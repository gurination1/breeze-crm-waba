const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const whatsapp = require('./whatsapp_api');
const ai = require('./ai_engine');
const supabaseKeepAlive = require('./supabase_keepalive');
const db = require('./db');
const crmApi = require('./crm_api');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Production Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Required for Tailwind & Lucide CDN scripts
  crossOriginEmbedderPolicy: false
}));

// API Rate Limiting (DoS and brute-force protection)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests. Please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many login attempts. Locked for 15 minutes for security.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '1mb' }));

// Mount CRM API Router
app.use('/api', crmApi);

// Serve Static Frontend UI
app.use(express.static(path.join(__dirname, 'public')));

// Deduplication cache to prevent handling same WhatsApp message twice
const processedMessageIds = new Set();

// Clean up old message IDs every hour
setInterval(() => {
  if (processedMessageIds.size > 2000) {
    processedMessageIds.clear();
  }
}, 3600000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Enterprise WABA AI Engine',
    supabaseKeepAlive: 'ACTIVE',
    timestamp: new Date().toISOString(),
    phoneNumbers: config.PHONE_NUMBERS
  });
});

/**
 * META WEBHOOK VERIFICATION (GET)
 * Meta calls this during Webhook setup in App Dashboard
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ [Webhook] Meta Verification Handshake SUCCESSFUL!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [Webhook] Meta Verification Failed: Invalid Token');
      return res.sendStatus(403);
    }
  }
  res.status(400).send('Invalid request');
});

// Debounce queue to merge split customer messages (e.g. typing 2 messages within 2.5s)
const userDebounceBuffers = new Map();
const userInFlight = new Set();
const lastBotReplyTime = new Map();
const tenantStatusCache = new Map();
const userDailyBotReplyCount = new Map(); // Anti-Loop Defense: phone -> { count, resetAt }

async function checkTenantActive(tId) {
  const cached = tenantStatusCache.get(tId);
  if (cached && (Date.now() - cached.time < 60000)) {
    return cached.active;
  }
  try {
    const tenantInfo = await db.get('crm_tenants', `id=eq.${tId}`);
    const active = !(tenantInfo && tenantInfo.length > 0 && tenantInfo[0].is_active === false);
    tenantStatusCache.set(tId, { active, time: Date.now() });
    return active;
  } catch (e) {
    return true;
  }
}

function queueCustomerMessage({ from, incomingText, contactName, tenantId, phoneNumberId, lead, msgId }) {
  if (!userDebounceBuffers.has(from)) {
    userDebounceBuffers.set(from, {
      texts: [],
      timer: null,
      contactName,
      tenantId,
      phoneNumberId,
      lead,
      lastMsgId: msgId
    });
  }

  const entry = userDebounceBuffers.get(from);
  entry.texts.push(incomingText);
  if (contactName) entry.contactName = contactName;
  entry.tenantId = tenantId;
  entry.phoneNumberId = phoneNumberId;
  if (lead) entry.lead = lead;
  entry.lastMsgId = msgId;

  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  entry.timer = setTimeout(async () => {
    userDebounceBuffers.delete(from);

    if (userInFlight.has(from)) {
      console.log(`⏳ [In-Flight Lock] AI already responding to ${from}, requeuing message...`);
      setTimeout(() => {
        queueCustomerMessage({
          from,
          incomingText: entry.texts.join('\n'),
          contactName: entry.contactName,
          tenantId: entry.tenantId,
          phoneNumberId: entry.phoneNumberId,
          lead: entry.lead,
          msgId: entry.lastMsgId
        });
      }, 1500);
      return;
    }

    const mergedText = entry.texts.join('\n').trim();
    if (!mergedText) return;

    // Check if user sent a trivial greeting right after the bot just responded (prevents double bot replies)
    const lastSentAt = lastBotReplyTime.get(from) || 0;
    const elapsed = Date.now() - lastSentAt;
    const isTrivialGreeting = /^(hi|hello|hlo|hey|hnji|hanji|ji|ok|theek\s*hai|sat\s*sri\s*akal|ss\s*akal|sri\s*akal)$/i.test(mergedText.trim());

    if (elapsed < 3000 && isTrivialGreeting) {
      console.log(`🛡️ [Duplicate Greeting Suppressed] Skipped redundant response for ${from} ("${mergedText}") - bot just replied ${Math.round(elapsed/1000)}s ago.`);
      return;
    }

    // Anti-Loop & Spam Defense: Max 25 bot replies per phone in 24h
    const now = Date.now();
    const rateData = userDailyBotReplyCount.get(from) || { count: 0, resetAt: now + 24 * 3600 * 1000 };
    if (now > rateData.resetAt) {
      rateData.count = 0;
      rateData.resetAt = now + 24 * 3600 * 1000;
    }
    if (rateData.count >= 25) {
      console.log(`🛡️ [Rate Limit / Loop Guard] ${from} reached 25 bot replies in 24h. Suppressing auto-reply to prevent token & cost blowout.`);
      return;
    }

    userInFlight.add(from);
    try {
      console.log(`⚡ [Debounce Dispatched] Merged ${entry.texts.length} messages for ${from}: "${mergedText.slice(0, 80)}"`);

      // Fire mark as read in parallel (non-blocking)
      whatsapp.markMessageAsRead(entry.phoneNumberId, entry.lastMsgId).catch(() => {});

      const aiResponse = await ai.generateAIReply(from, mergedText, entry.contactName, entry.tenantId, entry.phoneNumberId, entry.lead);
      console.log(`🤖 [AI Generated Reply (${entry.tenantId})]: "${aiResponse}"`);

      const safeOutboundText = (aiResponse && typeof aiResponse === 'string' && aiResponse.trim().length >= 3)
        ? aiResponse.trim()
        : "Hello! Batayein, kis machine ya setup baare gal karni hai?";

      let outboundWamid = null;
      let sendErrorMsg = null;
      try {
        const sendResult = await whatsapp.sendTextMessage(entry.phoneNumberId, from, safeOutboundText);
        outboundWamid = sendResult?.messages?.[0]?.id || null;
        lastBotReplyTime.set(from, Date.now());
        rateData.count++;
        userDailyBotReplyCount.set(from, rateData);
        console.log(`🚀 [Dispatched Outbound]: WAMID ${outboundWamid || 'OK'}`);
      } catch (sendErr) {
        sendErrorMsg = sendErr.response?.data?.error?.message || sendErr.message;
        console.error(`❌ [WhatsApp Send Error for ${from}]:`, sendErr.response?.data || sendErr.message);
      } finally {
        // Release lock immediately after sending message
        userInFlight.delete(from);
      }

      // Non-blocking async DB logging
      (async () => {
        try {
          await db.insert('crm_messages', {
            tenant_id: entry.tenantId,
            lead_phone: from,
            direction: 'OUTBOUND_BOT',
            message_type: 'TEXT',
            content: safeOutboundText,
            wamid: outboundWamid,
            delivery_status: outboundWamid ? 'SENT' : 'FAILED',
            error_details: outboundWamid ? null : sendErrorMsg,
            created_at: new Date().toISOString()
          });

          const tRec = await db.get('crm_tenants', `id=eq.${entry.tenantId}`);
          if (tRec && tRec.length > 0) {
            await db.update('crm_tenants', { quota_used: (tRec[0].quota_used || 0) + 1 }, `id=eq.${entry.tenantId}`);
          }

          if (entry.lead?.id) {
            let freshLead = entry.lead;
            try {
              const freshRecs = await db.get('crm_leads', `id=eq.${entry.lead.id}`);
              if (freshRecs && freshRecs.length > 0) freshLead = freshRecs[0];
            } catch (fErr) {}

            const currentReplyCount = Number(freshLead.ai_reply_count) || 0;
            const newCount = currentReplyCount + 1;

            const freshStatus = String(freshLead.status || '').toUpperCase();
            const isClosedOrQualified = ['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'SAVED_CONTACT', 'COMPLAINT', 'REPAIR'].includes(freshStatus) || freshLead.is_saved_contact || freshLead.was_qualified;

            const leadUpdates = {
              ai_reply_count: newCount,
              reply_count_month: new Date().toISOString().slice(0, 7),
              last_message_at: new Date().toISOString()
            };

            if (isClosedOrQualified) {
              leadUpdates.followup_enabled = false;
              leadUpdates.followup_due_at = null;
            } else if (freshStatus === 'NEW' || freshStatus === 'IN_PROGRESS' || freshStatus === 'UNCLEAR') {
              // 6-Hour Smart In-Window Follow-Up: ONLY if inquiry was open/unclear and customer went silent
              leadUpdates.followup_enabled = true;
              leadUpdates.followup_due_at = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
            } else {
              leadUpdates.followup_enabled = false;
              leadUpdates.followup_due_at = null;
            }

            await db.update('crm_leads', leadUpdates, `id=eq.${entry.lead.id}`).catch(() => {});
          }

          // Record immutable billing ledger head
          db.recordBillableEngagement({
            tenantId: entry.tenantId,
            leadPhone: from,
            clientName: null,
            city: null,
            engagementType: 'OUTBOUND_BOT',
            messagePreview: safeOutboundText
          }).catch(bErr => console.error('[Billable Bot Reply Record Err]:', bErr.message));
        } catch (dbOutErr) {
          console.error('❌ [Async DB Outbound Message Error]:', dbOutErr.message);
        }
      })().catch(() => {});
    } catch (procErr) {
      console.error(`❌ [Process Error for ${from}]:`, procErr.message);
      userInFlight.delete(from);
    }
  }, 600); // 600ms fast typing debounce window (cuts 1.6s delay!)
}

/**
 * META WEBHOOK EVENT HANDLER (POST)
 * Receives all incoming WhatsApp messages in real-time
 */
app.post('/webhook', async (req, res) => {
  console.log('\n📥 [RAW WEBHOOK POST RECEIVED]:', JSON.stringify(req.body));
  // Always acknowledge immediately to Meta to avoid webhook retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (!body || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const field = change.field;

        // Extract metadata
        const metadata = value.metadata || {};
        const phoneNumberId = metadata.phone_number_id || config.DEFAULT_PHONE_ID;
        const displayPhone = metadata.display_phone_number || '';

        // CRITICAL: DISCONNECT OLD/OTHER NUMBER COMPLETELY (99157 30338 / Phone ID 362616230279529)
        // Immediate drop: Zero echoes, zero inbound, zero DB logging, zero auto-seen, zero bot. 100% disconnected.
        const isDisconnectedNumber = phoneNumberId === '362616230279529' ||
          String(displayPhone || '').replace(/\D/g, '').endsWith('9915730338');
        if (isDisconnectedNumber) {
          console.log(`🚫 [COMPLETELY DISCONNECTED NUMBER] Dropped webhook event for ${displayPhone} (${phoneNumberId}). Zero CRM involvement.`);
          continue;
        }

        // 1. Handle Account Updates (Embedded Signup completed, phone added, partner app installs)
        if (field === 'account_update') {
          console.log(`\n🔔 [Meta Webhook: account_update]`, JSON.stringify(value));
          continue;
        }

        // 2. Handle Coexistence App State Sync
        if (field === 'smb_app_state_sync') {
          console.log(`\n🔄 [Meta Webhook: smb_app_state_sync]`, JSON.stringify(value));
          continue;
        }

        // 3. Handle Coexistence Mobile Echoes (Manual messages sent from WhatsApp Business Mobile App)
        const echoes = value.message_echoes || [];
        if (field === 'smb_message_echoes' || echoes.length > 0) {
          for (const echo of echoes) {
            const echoId = echo.id;
            const staffPhone = echo.from; // Sender (Business mobile number)
            const customerPhone = echo.to; // Recipient (Customer phone)
            const echoTime = echo.timestamp ? new Date(parseInt(echo.timestamp) * 1000).toISOString() : new Date().toISOString();

            if (processedMessageIds.has(echoId)) {
              console.log(`[Webhook Echo] Skipping duplicate echo ${echoId}`);
              continue;
            }
            processedMessageIds.add(echoId);

            let echoText = '';
            let messageType = (echo.type || 'text').toUpperCase();
            if (echo.type === 'text') {
              echoText = echo.text?.body || '';
            } else if (echo.type === 'image') {
              echoText = echo.image?.caption || '[Staff sent an image from WhatsApp Business app]';
            } else if (echo.type === 'document') {
              echoText = echo.document?.caption || echo.document?.filename || '[Staff sent a document from WhatsApp Business app]';
            } else if (echo.type === 'video') {
              echoText = echo.video?.caption || '[Staff sent a video from WhatsApp Business app]';
            } else if (echo.type === 'audio') {
              echoText = '[Staff sent a voice note from WhatsApp Business app]';
            } else if (echo.type === 'revoke') {
              echoText = '[Staff deleted a message on WhatsApp Business app]';
            } else {
              echoText = `[Staff sent a ${echo.type} message from WhatsApp Business app]`;
            }

            console.log(`\n📱 [Coexistence Mobile Echo] Staff (${staffPhone}) sent to Customer (${customerPhone}): "${echoText}"`);

            // Resolve Tenant strictly (only authorized phone ID 1345576425313536 for cpsystem)
            let tenantId = 'cpsystem';
            if (phoneNumberId === '1346591765206499' || phoneNumberId === '1310338315506407') {
              tenantId = 'mystery';
            } else if (phoneNumberId === '1345576425313536') {
              tenantId = 'cpsystem';
            } else {
              try {
                const matchedTenants = await db.get('crm_tenants', `phone_number_id=eq.${phoneNumberId}`);
                if (matchedTenants && matchedTenants.length > 0) {
                  tenantId = matchedTenants[0].id;
                }
              } catch (tErr) {}
            }

            // Persist to crm_messages as OUTBOUND_HUMAN
            try {
              await db.insert('crm_messages', {
                tenant_id: tenantId,
                lead_phone: customerPhone,
                direction: 'OUTBOUND_HUMAN',
                message_type: messageType,
                content: echoText,
                wamid: echoId,
                delivery_status: 'SENT',
                created_at: echoTime
              });
            } catch (insertErr) {
              console.error('❌ [DB Echo Insert Error]:', insertErr.message);
            }

            // Update crm_leads: set last_message_at and auto-pause bot (human takeover for external clients)
            try {
              const rawCust = customerPhone.startsWith('91') && customerPhone.length === 12 ? customerPhone.slice(2) : customerPhone;
              const internalPhones = ['919779220581', '919915730338', '919915730333', '916280834006', '916280333252', '919041172159'];
              const isInternalTesting = internalPhones.includes(customerPhone) || internalPhones.includes(staffPhone);

              const existingLeads = await db.get('crm_leads', `tenant_id=eq.${tenantId}&phone=in.(${customerPhone},${rawCust})`);
              if (existingLeads && existingLeads.length > 0) {
                const lead = existingLeads[0];
                const updatePayload = { last_message_at: echoTime, is_deleted: false };
                if (!isInternalTesting) {
                  updatePayload.bot_active = false; // Auto pause bot so owner can continue chatting manually without bot interruption!
                  console.log(`🤖 Bot auto-paused for ${customerPhone} due to human takeover from official WhatsApp mobile app.`);
                }
                await db.update('crm_leads', updatePayload, `id=eq.${lead.id}`);
              } else {
                let savedName = '';
                try {
                  const savedMatches = await db.get('crm_saved_contacts', `tenant_id=eq.${tenantId}&phone=in.(${customerPhone},${rawCust},91${rawCust})`);
                  if (savedMatches && savedMatches.length > 0) {
                    savedName = (savedMatches[0].name || '').trim();
                  }
                } catch (scErr) {}

                await db.insert('crm_leads', {
                  tenant_id: tenantId,
                  phone: customerPhone,
                  name: savedName || 'WhatsApp Contact',
                  requirement: 'Direct mobile conversation',
                  status: 'IN_PROGRESS',
                  bot_active: false,
                  is_saved_contact: !!savedName,
                  is_deleted: false,
                  last_message_at: echoTime,
                  created_at: echoTime
                });
                console.log(`✨ [Coexistence New Lead] Created lead for mobile echo recipient ${customerPhone}`);
              }
            } catch (lErr) {
              console.error('❌ [DB Echo Lead Update Error]:', lErr.message);
            }
          }
          continue; // Finish processing this change entry, do not fall through to incoming messages
        }

        // Check for incoming messages
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const contactName = contacts[0]?.profile?.name || '';

        for (const msg of messages) {
          const msgId = msg.id;
          const from = msg.from; // Sender phone number

          // Deduplicate
          if (processedMessageIds.has(msgId)) {
            console.log(`[Webhook] Skipping duplicate message ${msgId}`);
            continue;
          }
          processedMessageIds.add(msgId);

          // Extract text and message type
          let incomingText = '';
          let messageType = 'TEXT';
          if (msg.type === 'text') {
            incomingText = msg.text?.body || '';
          } else if (msg.type === 'interactive') {
            incomingText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          } else if (msg.type === 'button') {
            incomingText = msg.button?.text || '';
          } else if (msg.type === 'audio') {
            incomingText = '[Customer sent an audio voice message. Politely tell them in 1 short sentence in Punjabi/Hinglish that voice message is not clear/playable right now, and ask them to type their requirement or call Karan Singh at +91 99157 30338]';
            messageType = 'VOICE_TRANSCRIPT';
          } else {
            incomingText = `[Customer sent a ${msg.type} message]`;
          }

          console.log(`\n📩 [Incoming Message] From: ${from} (${contactName}) to Phone ID: ${phoneNumberId} (${displayPhone})`);
          console.log(`💬 Message: "${incomingText}"`);

          // Filter out official broadcast channels and toll-free spam
          const pClean = String(from || '').replace(/\D/g, '');
          const isChannelOrSpam = pClean.startsWith('911800') || pClean.startsWith('1800') || pClean.startsWith('1860') ||
            pClean === '919999041935' || pClean === '911800227575' ||
            /(official\s*whatsapp\s*channel|rbi\s*kehta\s*hai|investor\.sebi\.gov\.in|welcome\s*to.*channel|broadcast\s*channel)/i.test(incomingText);

          // Detect test & simulation numbers (quarantine to test_archive)
          const isTestPhone = pClean.startsWith('9198765') || pClean.startsWith('9199990') || pClean.startsWith('155501') ||
            pClean.startsWith('9191111') || pClean.startsWith('9192222') || pClean.startsWith('9193333') ||
            pClean.startsWith('9194444') || pClean.startsWith('9195555') || pClean.startsWith('9199999');

          // 2. Identify Tenant strictly (Phone ID 1345576425313536 is exclusive to cpsystem)
          let tenantId = null;
          if (phoneNumberId === '1345576425313536') {
            tenantId = 'cpsystem';
          } else if (phoneNumberId === '1346591765206499' || phoneNumberId === '1310338315506407') {
            tenantId = 'mystery';
          } else if (phoneNumberId === '1351625371363106') {
            tenantId = 'edufun';
          } else {
            try {
              const matchedTenants = await db.get('crm_tenants', `phone_number_id=eq.${phoneNumberId}`);
              if (matchedTenants && matchedTenants.length > 0) {
                tenantId = matchedTenants[0].id;
              }
            } catch (tErr) {
              console.error('Tenant lookup error:', tErr.message);
            }
          }

          // If tenantId cannot be verified, DROP immediately. Never pollute cpsystem!
          if (!tenantId) {
            console.log(`⚠️ [Dropped Inbound - Unassigned Phone ID]: ${phoneNumberId} (${displayPhone}). Not registered to any tenant.`);
            continue;
          }

          if (isChannelOrSpam) {
            tenantId = 'spam_archive';
          } else if (isTestPhone) {
            tenantId = 'test_archive';
          }

          // 3. Persist inbound message to Supabase crm_messages asynchronously (non-blocking)
          db.insert('crm_messages', {
            tenant_id: tenantId,
            lead_phone: from,
            direction: 'INBOUND',
            message_type: messageType,
            content: incomingText,
            wamid: msgId,
            delivery_status: 'DELIVERED',
            is_deleted: isChannelOrSpam || isTestPhone,
            created_at: new Date().toISOString()
          }).catch(insertErr => console.error('❌ [DB Inbound Message Error]:', insertErr.message));

          if (isChannelOrSpam) {
            console.log(`🛑 [Spam / Broadcast Channel Filtered] From: ${from}. Message will not trigger AI reply.`);
            continue;
          }

          if (isTestPhone) {
            console.log(`🛑 [Test Phone Quarantined] From: ${from}. Message quarantined to test_archive.`);
            continue;
          }

          const isKaranLine = phoneNumberId === '362616230279529' ||
            String(displayPhone || '').replace(/\D/g, '').endsWith('9915730338') ||
            String(from || '').replace(/\D/g, '').endsWith('9915730338');

          let resolvedContactName = contactName;
          if (from.endsWith('9041172159') || resolvedContactName === 'Nya') {
            resolvedContactName = 'Gurdharam';
          }

          // 4. Fetch Client's Saved Contacts and Existing Leads in parallel
          let isSavedContact = false;
          let savedName = '';
          let lead = null;
          const rawFrom = from.startsWith('91') && from.length === 12 ? from.slice(2) : from;
          const variants = Array.from(new Set([from, rawFrom, '91' + rawFrom]));

          try {
            const [savedMatches, existingLeads] = await Promise.all([
              db.get('crm_saved_contacts', `tenant_id=eq.${tenantId}&phone=in.(${variants.join(',')})`).catch(() => []),
              db.get('crm_leads', `tenant_id=eq.${tenantId}&phone=in.(${variants.join(',')})`).catch(() => [])
            ]);

            if (savedMatches && savedMatches.length > 0) {
              const candidate = (savedMatches[0].name || '').trim();
              const isBogusName = /^[\p{Extended_Pictographic}\s\d_\W]+$/u.test(candidate) ||
                /^(customer\s*sent|whatsapp\s*lead|test\s*client)/i.test(candidate);
              if (!isBogusName && candidate.length >= 2) {
                isSavedContact = true;
                savedName = candidate;
              }
            }

            if (existingLeads && existingLeads.length > 0) {
              lead = existingLeads[0];
            }
          } catch (scErr) {}

          const finalDisplayName = savedName || resolvedContactName || 'WhatsApp Contact';

          // 5. Upsert Lead in Supabase crm_leads
          try {
            if (lead) {
              if (lead.is_saved_contact) {
                isSavedContact = true;
              }
              const currentMonth = new Date().toISOString().slice(0, 7);
              const isAlreadyClosed = ['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'SAVED_CONTACT', 'COMPLAINT', 'REPAIR'].includes(String(lead.status || '').toUpperCase()) || lead.is_saved_contact || lead.was_qualified;
              const updates = {
                last_message_at: new Date().toISOString(),
                phone: from,
                is_deleted: false,
                followup_count: 0,
                followup_due_at: null,
                followup_enabled: !isAlreadyClosed
              };
              // Monthly reset for 15-reply cap
              if (lead.reply_count_month && lead.reply_count_month !== currentMonth) {
                updates.ai_reply_count = 0;
                updates.is_handoff_to_staff = false;
                updates.reply_count_month = currentMonth;
                lead.ai_reply_count = 0;
                lead.is_handoff_to_staff = false;
                lead.reply_count_month = currentMonth;
              }
              if (lead.status === 'COLD') {
                updates.status = 'IN_PROGRESS';
                lead.status = 'IN_PROGRESS';
              }
              if (resolvedContactName && resolvedContactName !== 'WhatsApp Contact' && resolvedContactName !== 'WhatsApp Lead') {
                updates.whatsapp_profile_name = resolvedContactName;
              }
              if (savedName) {
                updates.name = savedName;
                lead.name = savedName;
                updates.is_saved_contact = true;
                lead.is_saved_contact = true;
                if (typeof lead.bot_active !== 'boolean') {
                  updates.bot_active = false;
                  lead.bot_active = false;
                }
              } else {
                if (!lead.name || lead.name === 'WhatsApp Lead' || lead.name === 'Nya' || lead.name === 'WhatsApp Contact') {
                  updates.name = resolvedContactName || 'WhatsApp Contact';
                  lead.name = updates.name;
                }
                if (typeof lead.bot_active !== 'boolean') {
                  updates.bot_active = !isKaranLine;
                  lead.bot_active = updates.bot_active;
                }
              }
              if (isKaranLine) {
                updates.bot_active = false;
                lead.bot_active = false;
              }
              await db.update('crm_leads', updates, `id=eq.${lead.id}`);
            } else {
              const newLead = await db.insert('crm_leads', {
                tenant_id: tenantId,
                phone: from,
                name: finalDisplayName,
                whatsapp_profile_name: resolvedContactName || null,
                requirement: isSavedContact ? 'Saved Contact (Direct Chat)' : (isKaranLine ? 'Direct phone conversation' : 'Inquiry in progress'),
                status: isSavedContact ? 'SAVED_CONTACT' : 'NEW',
                is_saved_contact: isSavedContact,
                bot_active: isKaranLine ? false : !isSavedContact,
                is_deleted: false,
                last_message_at: new Date().toISOString()
              });
              lead = newLead?.[0] || { bot_active: isKaranLine ? false : !isSavedContact, is_saved_contact: isSavedContact, name: finalDisplayName };
            }
          } catch (leadErr) {
            console.error('❌ [DB Lead Upsert Error]:', leadErr.message);
          }

          // MANDATORY: 99157 30338 (Phone ID 362616230279529) is 100% human staff line.
          // Zero bot auto-replies, ZERO auto-seen (blue ticks), pure coexistence.
          if (isKaranLine) {
            console.log(`⏸️ [Staff Coexistence] ${displayPhone} / From: ${from} is Karan Singh line. Bot AI & auto-seen are 100% OFF.`);
            continue;
          }

          // Check opt-out command
          const isStopCommand = /^\s*(stop|unsubscribe|cancel|band\s*karo|stop\s*bot)\s*$/i.test(incomingText.trim());
          if (isStopCommand) {
            console.log(`🛑 [Opt-Out Received] Customer ${from} requested STOP.`);
            try {
              await db.update('crm_leads', { bot_active: false }, `tenant_id=eq.${tenantId}&phone=eq.${from}`);
              const stopReply = 'Hello! Bot auto-reply stop kar dita gaya hai. Tussi jadon marzi CP System (+91 99157 30338) nu direct call ya text kar sakde ho.';
              const stopRes = await whatsapp.sendTextMessage(phoneNumberId, from, stopReply);
              const stopWamid = stopRes?.messages?.[0]?.id || null;
              await db.insert('crm_messages', {
                tenant_id: tenantId,
                lead_phone: from,
                direction: 'OUTBOUND_BOT',
                message_type: 'TEXT',
                content: stopReply,
                wamid: stopWamid,
                delivery_status: 'SENT',
                created_at: new Date().toISOString()
              });
            } catch (sErr) {}
            continue;
          }

          // 6. Check Human Takeover & Tenant Bot Toggle
          const isBotActiveForLead = typeof lead?.bot_active === 'boolean'
            ? lead.bot_active
            : !isSavedContact;

          // Skip auto-replying to forwarded lead qualification alert cards
          if (incomingText.includes('NEW CP SYSTEM LEAD QUALIFIED') || incomingText.includes('LEAD QUALIFIED')) {
            console.log(`[Alert Filter] Skipped auto-reply for forwarded lead notification card from ${from}`);
            continue;
          }

          const isTenantBotActive = await checkTenantActive(tenantId);

          if (!isTenantBotActive) {
            console.log(`⏸️ [Tenant Bot Paused] Global bot paused for tenant ${tenantId}. Bot AI will NOT reply.`);
            continue;
          }

          if (!isBotActiveForLead) {
            if (isSavedContact) {
              console.log(`👤 [Saved Contact] ${from} (${finalDisplayName}) bot is silenced/takeover mode. Bot will NOT reply.`);
            } else {
              console.log(`⏸️ [Takeover Active] Human operator has taken over chat for ${from}. Bot AI will NOT reply.`);
            }
            continue;
          }

          // 6B. Check 15 AI Replies Cap & Staff Handoff Rule
          const leadReplyCount = Number(lead?.ai_reply_count) || 0;
          if (leadReplyCount >= 15) {
            if (!lead?.is_handoff_to_staff) {
              console.log(`🛡️ [15-Reply Cap Reached] Customer ${from} reached 15 AI replies. Handing over to staff.`);
              const handoffMsg = "Aapka inquiry hamari senior sales team (+91 99157 30338) ko assign ho chuki hai. Hum jaldi hi aapse rabta karenge aur sabhi details finalize karenge! 🙏";
              try {
                const sendRes = await whatsapp.sendTextMessage(phoneNumberId, from, handoffMsg);
                const wamid = sendRes?.messages?.[0]?.id || null;
                await db.insert('crm_messages', {
                  tenant_id: tenantId,
                  lead_phone: from,
                  direction: 'OUTBOUND_BOT',
                  message_type: 'TEXT',
                  content: handoffMsg,
                  wamid,
                  delivery_status: 'SENT',
                  created_at: new Date().toISOString()
                });
                await db.update('crm_leads', {
                  bot_active: false,
                  is_handoff_to_staff: true,
                  followup_enabled: false,
                  followup_due_at: null
                }, `id=eq.${lead.id}`);
                if (lead) {
                  lead.bot_active = false;
                  lead.is_handoff_to_staff = true;
                  lead.followup_enabled = false;
                  lead.followup_due_at = null;
                }
              } catch (hErr) {
                console.error('❌ [Handoff Msg Err]:', hErr.message);
              }
            } else {
              console.log(`🛡️ [Staff Handoff Active] Customer ${from} has already received handoff. Bot muted.`);
            }
            continue;
          }

          // 7. Enqueue into Debounce Buffer (eliminates parallel race conditions & merged fast typing)
          queueCustomerMessage({
            from,
            incomingText,
            contactName: resolvedContactName,
            tenantId,
            phoneNumberId,
            lead,
            msgId
          });
        }

        // Handle delivery status updates (sent, delivered, read, failed)
        const statuses = value.statuses || [];
        for (const st of statuses) {
          const rawStatus = (st.status || 'sent').toLowerCase();
          const statusUpper = rawStatus.toUpperCase();
          const hasError = st.errors && st.errors.length > 0;
          const finalStatus = hasError ? 'FAILED' : statusUpper;
          const errorMsg = hasError
            ? (st.errors[0]?.error_data?.details || st.errors[0]?.message || JSON.stringify(st.errors))
            : null;

          console.log(`📡 [Message Status] ID: ${st.id} | Recipient: ${st.recipient_id} | Status: ${finalStatus}${errorMsg ? ` | Reason: ${errorMsg}` : ''}`);

          try {
            const updatePayload = {
              delivery_status: finalStatus
            };
            if (errorMsg) {
              updatePayload.error_details = errorMsg;
            }

            // Atomic status guard: do not downgrade READ -> DELIVERED or DELIVERED -> SENT
            let queryFilter = `wamid=eq.${st.id}`;
            if (finalStatus === 'SENT') {
              queryFilter += `&delivery_status=neq.DELIVERED&delivery_status=neq.READ&delivery_status=neq.FAILED`;
            } else if (finalStatus === 'DELIVERED') {
              queryFilter += `&delivery_status=neq.READ&delivery_status=neq.FAILED`;
            }

            const updatedRows = await db.update('crm_messages', updatePayload, queryFilter);
            if (updatedRows && updatedRows.length > 0) {
              console.log(`✅ [DB Status Updated] Message ${st.id} marked ${finalStatus} in crm_messages`);
            }
          } catch (dbStatErr) {
            console.error(`❌ [DB Status Update Error for ${st.id}]:`, dbStatErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ [Webhook Handler Error]:', err.message);
  }
});

/**
 * DIRECT OUTBOUND API (POST /api/send)
 * Allows our team or internal services to send messages anytime
 */
app.post('/api/send', async (req, res) => {
  try {
    const { to, text, phoneNumberId } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: 'Missing to or text' });
    }
    const phoneId = phoneNumberId || config.DEFAULT_PHONE_ID;
    const result = await whatsapp.sendTextMessage(phoneId, to, text);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// SPA catch-all route (serves index.html for frontend navigation)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/webhook' || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * AUTOMATED IN-WINDOW 6-HOUR FOLLOW-UP CRON WORKER
 * Strictly honors:
 * 1. ONLY sends if inquiry is open (NEW, IN_PROGRESS, UNCLEAR) and customer went silent.
 * 2. 100% SUPPRESSED for QUALIFIED, WON, CLOSED, LOST, COMPLAINT, REPAIR, SAVED_CONTACT.
 * 3. Strictly within 24 hours of customer's last message (0 messages after 24h).
 * 4. Strictly max 1 follow-up nudge per inquiry.
 * 5. Strictly skipped if lead reached 15 AI replies.
 */
function startAutomatedFollowUpWorker() {
  console.log('⏰ [Cron] Automated In-Window 6h Follow-Up Worker initialized (2m cadence).');
  setInterval(async () => {
    try {
      const nowIso = new Date().toISOString();
      const candidates = await db.get('crm_leads', `followup_enabled=eq.true&followup_due_at=lte.${nowIso}&limit=20`);
      if (!candidates || candidates.length === 0) return;

      const suppressedStatuses = ['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'COMPLAINT', 'REPAIR', 'SAVED_CONTACT'];

      for (const lead of candidates) {
        try {
          const st = String(lead.status || '').toUpperCase();
          const isSuppressed = suppressedStatuses.includes(st) || lead.is_saved_contact || lead.was_qualified;

          // 1. Permanent cancellation for qualified or closed deals
          if (isSuppressed) {
            await db.update('crm_leads', { followup_enabled: false, followup_due_at: null }, `id=eq.${lead.id}`);
            continue;
          }

          // 2. Meta 24-hour service window guard (User rule: NO follow-up after 24 hours)
          const lastMsgTime = new Date(lead.last_message_at || lead.created_at).getTime();
          const hoursSinceLast = (Date.now() - lastMsgTime) / 3600000;
          if (hoursSinceLast > 24) {
            console.log(`🛡️ [Follow-Up Suppressed] Lead ${lead.phone} is outside 24h window (${hoursSinceLast.toFixed(1)}h). Follow-up cancelled.`);
            await db.update('crm_leads', { followup_enabled: false, followup_due_at: null }, `id=eq.${lead.id}`);
            continue;
          }

          // 3. 15-reply cap guard
          if (Number(lead.ai_reply_count) >= 15 || lead.is_handoff_to_staff) {
            await db.update('crm_leads', { followup_enabled: false, followup_due_at: null }, `id=eq.${lead.id}`);
            continue;
          }

          // 4. Max 1 nudge per inquiry
          if (Number(lead.followup_count) >= 1) {
            await db.update('crm_leads', { followup_enabled: false, followup_due_at: null }, `id=eq.${lead.id}`);
            continue;
          }

          // 5. Tenant bot pause guard
          const tId = lead.tenant_id || 'cpsystem';
          const isBotActive = await checkTenantActive(tId);
          if (!isBotActive) continue;

          // Fetch tenant phone ID
          const tenants = await db.get('crm_tenants', `id=eq.${tId}`);
          const phoneId = tenants?.[0]?.phone_number_id || config.DEFAULT_PHONE_ID;

          // 6. Atomic Distributed Claim (Prevents race conditions if both Oracle & Render run concurrently)
          const claimRes = await db.update('crm_leads', {
            followup_due_at: null,
            followup_count: (Number(lead.followup_count) || 0) + 1,
            last_message_at: new Date().toISOString()
          }, `id=eq.${lead.id}&followup_due_at=not.is.null`);

          if (!claimRes || claimRes.length === 0) {
            // Another cluster instance already claimed and dispatched this follow-up
            continue;
          }

          const followUpText = await ai.generateFollowUpMessage(lead, tId);
          const sendRes = await whatsapp.sendTextMessage(phoneId, lead.phone, followUpText);
          const wamid = sendRes?.messages?.[0]?.id || null;

          await db.insert('crm_messages', {
            tenant_id: tId,
            lead_phone: lead.phone,
            direction: 'OUTBOUND_BOT',
            message_type: 'TEXT',
            content: followUpText,
            wamid,
            delivery_status: 'SENT',
            created_at: new Date().toISOString()
          });

          if (tenants?.[0]) {
            await db.update('crm_tenants', { quota_used: (tenants[0].quota_used || 0) + 1 }, `id=eq.${tId}`).catch(() => {});
          }

          db.recordBillableEngagement({
            tenantId: tId,
            leadPhone: lead.phone,
            clientName: lead.name,
            city: lead.city,
            engagementType: 'OUTBOUND_BOT',
            messagePreview: followUpText
          }).catch(() => {});

          console.log(`📡 [Auto 6h Follow-Up Dispatched] for ${lead.phone} (${tId}) | WAMID: ${wamid}`);
        } catch (leadErr) {
          console.error(`❌ [Auto Follow-Up Error for ${lead.phone}]:`, leadErr.message);
        }
      }
    } catch (err) {
      console.error('❌ [Auto Follow-Up Cron Error]:', err.message);
    }
  }, 120000);
}

// Start Server
app.listen(config.PORT, () => {
  console.log(`====================================================`);
  console.log(`  Enterprise WABA AI Engine LIVE on Port ${config.PORT}`);
  console.log(`  Webhook Endpoint: /webhook`);
  console.log(`  Verify Token: ${config.WEBHOOK_VERIFY_TOKEN}`);
  console.log(`  Active Phone 1: ${config.PHONE_NUMBERS['1346591765206499'].display} (${config.PHONE_NUMBERS['1346591765206499'].name})`);
  console.log(`  Active Phone 2: ${config.PHONE_NUMBERS['1351625371363106'].display} (${config.PHONE_NUMBERS['1351625371363106'].name})`);
  console.log(`====================================================`);

  // Start 24/7 Supabase keep-alive engine
  supabaseKeepAlive.startKeepAlive();

  // Start automated 6-hour follow-up background worker
  startAutomatedFollowUpWorker();
});
