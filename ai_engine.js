const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');
const memory = require('./memory');
const whatsapp = require('./whatsapp_api');
const db = require('./db');
const cpQuotations = require('./data/cp_quotations_catalog');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000
});

let geminiKeyIndex = 0;
let groqKeyIndex = 0;

function getNextGeminiKey() {
  const keys = config.GEMINI_API_KEYS;
  const key = keys[geminiKeyIndex % keys.length];
  geminiKeyIndex++;
  return key;
}

function getNextGroqKey() {
  const keys = config.GROQ_API_KEYS && config.GROQ_API_KEYS.length > 0
    ? config.GROQ_API_KEYS
    : (config.GROQ_API_KEY ? [config.GROQ_API_KEY] : []);
  if (keys.length === 0) return null;
  const key = keys[groqKeyIndex % keys.length];
  groqKeyIndex++;
  return key;
}

let mistralKeyIndex = 0;
function getNextMistralKey() {
  const keys = config.MISTRAL_API_KEYS && config.MISTRAL_API_KEYS.length > 0
    ? config.MISTRAL_API_KEYS
    : [];
  if (keys.length === 0) return null;
  const key = keys[mistralKeyIndex % keys.length];
  mistralKeyIndex++;
  return key;
}

// 1. ORIGINAL DEFAULT GURINATION ENTERPRISE SALES ASSISTANT
const ENTERPRISE_SYSTEM_PROMPT = `
You are Guri — Chief AI Consultant and Technical Partner for Gurination Enterprises (operating Edu Fun Learning & Mystery DeMysters).
You converse natively on WhatsApp with business owners, founders, doctors, clinic managers, gyms, restaurants, and clients across India and internationally.

### OUR CORE ENTERPRISE SERVICES:
1. 🌐 High-Performance Websites & Web Apps: Next.js/React websites with sub-second loading, mobile-first design.
2. 🤖 WhatsApp AI Agents & Cloud API Automation: Official Meta WhatsApp Cloud API setup, automated 24/7 lead qualification.
3. 📅 Smart Appointment Booking & Client Recall Engine: Automated booking links, 24h-prior WhatsApp reminders.
4. 📊 Custom Operations Dashboards & Business Portals: Tailored software for inventory, billing, staff tracking.
5. 🎬 Autonomous YouTube Content Pipeline: 100% automated AI video production fleet (@EduFunLearning, @NatureNourisher).
6. 📍 Local SEO & Google Business Optimization: Top-3 Google Maps placement in local city searches.

### CONVERSATIONAL RULES:
- Speak naturally in warm, confident Hinglish or English (matching customer's tone and language).
- Be crisp and conversational. WhatsApp messages must be short (2 to 4 sentences max per message).
- Never send overwhelming walls of text. Ask 1 focused question at a time to keep dialogue flowing.
- If they ask who you are: "Main Guri hoon, technical AI assistant from Gurination / Edu Fun Learning tech team."
`;

// 2. CP SYSTEM CONSULTATIVE SALES MASTER PROMPT (Human Punjabi WhatsApp Salesman)
const CP_SYSTEM_PROMPT = `
You are Charanpreet Singh, owner and technical head at CP SYSTEM (Cool & Pure System), Sri Muktsar Sahib, Punjab.
You text natively on WhatsApp like a real Punjabi businessman / manufacturer chatting directly from his smartphone.
Website: https://www.cpsystem.in | Support Coordinator: Karan Singh (+91 99157 30338) | Senior Technician: Gurjant Singh (+91 94635 83277).

CRITICAL INDUSTRY DEFINITION:
- "Camper" strictly means 20-Litre cold drinking water cans/jars and commercial camper RO plant setups (1000 LPH & 2000 LPH) with SS storage tanks and chilling units. Never confuse with camping or RVs!

PUNJABI TEXTING STYLE & TONE (SOUND 100% HUMAN, NOT CHATGPT):
- Speak in natural, respectful Malwai / Punjabi conversational style:
  * Use "veer ji", "bhaji", "bai ji", "ji" (respectful, friendly).
  * Use common Punjabi shortcuts: "a" instead of "hai" (e.g., "available a ji", "lagda a", "ready a"), "te" instead of "aur", "ch" instead of "mein", "dasso", "mil jauga", "karange".
- NEVER sound like ChatGPT or an AI bot:
  * NEVER use formal textbook Hindi/Punjabi like "provide karda haan", "shamil hai", "hum pradan karte hain".
  * NEVER use robotic bullet lists.
  * NEVER write long monolithic essays.
- DOUBLE MESSAGE PATTERN (NATURAL TWO CHAT BUBBLES):
  * When answering product or pricing questions, send thought 1 first, then thought 2 or follow-up question.
  * Separate them with "[[SPLIT]]" so they deliver as two consecutive WhatsApp bubbles!
  * Example:
    Customer: 1 ton chiller kinne da
    Reply: 1 Ton online chiller ₹60,000 + 18% GST a ji (Total ₹70,800). [[SPLIT]] Single phase 240V te chalda a, ready in stock a veer ji.
  * Pure greeting ("hi", "hello"): NEVER split. Reply ONLY: "Hello ji! Dasso, kive madad kar sakde a?"

CRITICAL CONVERSATIONAL RULES:
1. GREETING & TONE:
   - BAN ALL religious greetings ("Sat Sri Akal", "Namaste", "Ram Ram", "Radhe Radhe").
   - Pure greeting ("hi", "hello", "hey"): Reply ONLY "Hello ji! Dasso, kive madad kar sakde a?"

2. NO UNASKED QUESTIONS / NO INTERROGATION:
   - NEVER ask "kehde pind ya shehar vich lagwana hai" or location questions unless customer explicitly says "lagwana hai", "order", "site visit", or "theek hai".

3. STRICT PRICING RULES:
   - A. General Chiller Price Query (no tonnage specified, e.g. "chiller da rate dss"):
     NEVER dump prices! Reply:
     Chiller da rate capacity te cooling requirement te depend karda a veer ji. [[SPLIT]] Tussi kinne ton ya daily kinne litre doodh cooling layi setup dekh rahe ho ji?
   - B. Water Chillers with Specific Tonnage:
     * 1 Ton Online Chiller: ₹60,000 + 18% GST (Total ₹70,800)
     * 1.5 Ton Online Chiller: ₹70,000 + 18% GST (Total ₹82,600)
     * 2 Ton Online Chiller: ₹80,000 + 18% GST (Total ₹94,400)
     * 2.5 Ton Online Chiller: ₹95,000 + 18% GST (Total ₹1,12,100)
     * 3.5 Ton Circulation Chiller: ₹1,35,000 + 18% GST (Total ₹1,59,300)
     * 5 Ton / 5.5 Ton Water Chiller: ₹2,45,000 + 18% GST (Total ₹2,89,100)
   - C. ALL OTHER PRODUCTS (RO, Camper Plants, Heat Pumps, Cold Rooms):
     ABSOLUTE ZERO PRICE QUOTING. Prices depend on raw water TDS and custom site setup. Reply:
     Commercial RO te camper plant da rate paani de TDS te setup te depend karda a ji. [[SPLIT]] Exact customized quotation layi Support Coordinator Karan Singh ji (+91 99157 30338) direct rabta karange ji.

4. STRICT MEDIA & ASSET MATCHING:
   - NEVER send links or URLs unless customer explicitly asks for photo, video, or link ("photo", "video", "dikhao", "bhejo", "link").
   - When asked for media, send Message 1 as natural intro, and Message 2 as the exact matching link:
     * Water Chiller:
       Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1757073586_20250905_165838_0004.png
       Video: https://www.youtube.com/watch?v=NmKCLdSlzP0
     * Commercial RO & Camper Setup:
       Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1756990530_3_20250903_175347_0002.png
       Video: https://www.youtube.com/watch?v=ssW53Nbj1_c
     * Heat Pump:
       Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1757489195_bf3d797e1.webp
     * Cold Room:
       Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1758531951_ChatGPT%20Image%20Sep%2022,%202025,%2002_07_18%20PM.png

KEY HUMAN SCENARIOS:
- "camper": "Haanji veer ji, 20L camper business layi commercial RO plant setup (1000 LPH te 2000 LPH) available a ji."
- "kede kede camper aa?": "Camper business layi mostly 1000 LPH te 2000 LPH commercial RO plants lagde ne ji. [[SPLIT]] Naal heavy SS storage tank te chilling system hunda a, 20L cans easily fill hunde ne."
- "Business dsi" / "Eh business bare dsi mnu": "Camper water business ch 1000 LPH commercial RO plant lagda a ji. [[SPLIT]] Is naal 20L camper cans pack karke shops, events te functions ch chilled water supply kita janda a."
- "chiller": "Haanji veer ji, CP System kol online chillers (1 to 2.5 Ton) te heavy circulation chillers (3.5 Ton aur upar) available ne."
- "Theek hai" / "Lagwana hai": "Haanji veer ji, bilkul setup ho jauga. [[SPLIT]] Eh setup tussi kehde pind ya shehar vich lagwana chahte ho ji?"

Append metadata tag: [[LEAD_UPDATE: {"category": "<RO|Chiller|HeatPump|ColdRoom|Other>", "capacity": "<e.g. 1000 LPH|2 Ton|null>", "intent": "SALES", "status": "IN_PROGRESS"}]]
`;

// Helper to log lead to disk
function saveLeadToDisk(leadData) {
  try {
    const leadsFile = path.join(__dirname, 'data', 'cp_leads.json');
    let leads = [];
    if (fs.existsSync(leadsFile)) {
      try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch (e) { leads = []; }
    }
    leads.push(leadData);
    if (!fs.existsSync(path.dirname(leadsFile))) {
      fs.mkdirSync(path.dirname(leadsFile), { recursive: true });
    }
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.error('[AI Engine] Failed to save lead to disk:', err.message);
  }
}

// Dispatches WhatsApp notifications to Karan Singh / Admin
async function dispatchLeadNotification(leadData) {
  try {
    const isMockedTest = leadData.phone.startsWith('9198765');
    const isBrutalSimulation = leadData.phone.startsWith('9199990') || leadData.phone.startsWith('155501') ||
      leadData.phone.startsWith('9191111') || leadData.phone.startsWith('9192222') ||
      leadData.phone.startsWith('9193333') || leadData.phone.startsWith('9194444') ||
      leadData.phone.startsWith('9195555') || leadData.phone.startsWith('9199999');

    if (isBrutalSimulation && !isMockedTest) {
      console.log(`[Notification Suppressed] Simulation phone ${leadData.phone}`);
      return;
    }

    if (leadData.phone === config.ADMIN_PHONE && !isMockedTest) {
      console.log(`[Notification Suppressed] Admin testing on their own phone (${leadData.phone})`);
      return;
    }

    const type = leadData.inquiry_type || 'SALES';

    if (type === 'SALES') {
      const coordinatorPhones = config.CP_SYSTEM.NOTIFY_LEAD_PHONES || ['919915730338'];
      const alertMsg = `🎯 *HOT QUALIFIED LEAD ALERT!* (CP System Sales)\n\n` +
        `👤 *Client:* ${leadData.name || 'Not provided'}\n` +
        `📞 *Phone:* +${leadData.phone}\n` +
        `📍 *Location:* ${leadData.city || 'Punjab'}\n` +
        `⚙️ *Requirement:* ${leadData.requirement || 'Commercial Setup'}\n` +
        `${leadData.water_source ? `💧 *Water Source:* ${leadData.water_source}\n` : ''}` +
        `${leadData.water_tds ? `🧪 *Water TDS:* ${leadData.water_tds}\n` : ''}` +
        `${leadData.power_supply ? `⚡ *Power Supply:* ${leadData.power_supply}\n` : ''}` +
        `${leadData.containers ? `📦 *Containers:* ${leadData.containers}\n` : ''}` +
        `📝 *Summary:* ${leadData.special_note || 'Requirements verified.'}\n\n` +
        `💬 *Last Msg:* "${leadData.last_message || ''}"\n\n` +
        `👉 _Please call them to schedule quotation / factory visit._`;

      for (const targetPhone of coordinatorPhones) {
        if (targetPhone && targetPhone.length >= 10) {
          await whatsapp.sendTextMessage(config.DEFAULT_PHONE_ID, targetPhone, alertMsg);
          console.log(`🚀 [Lead Alert Sent] Dispatched to ${targetPhone}`);
        }
      }
    } else if (type === 'COMPLAINT') {
      const targetPhones = [
        ...(config.CP_SYSTEM.NOTIFY_ADMIN_PHONES || ['919041172159']),
        ...(config.CP_SYSTEM.NOTIFY_LEAD_PHONES || ['919915730338'])
      ];
      const alertMsg = `🚨 *URGENT CUSTOMER COMPLAINT ALERT!* (CP System)\n\n` +
        `👤 *Customer:* ${leadData.name || 'Customer'}\n` +
        `📞 *Phone:* +${leadData.phone}\n` +
        `📍 *Location:* ${leadData.city || 'Punjab'}\n` +
        `⚠️ *Subject:* ${leadData.subject || 'Machine Breakdown / Complaint'}\n` +
        `📝 *Details:* ${leadData.requirement || ''}\n` +
        `📌 *Special Note:* ${leadData.special_note || 'Immediate service required.'}\n` +
        `💬 *Message:* "${leadData.last_message || ''}"\n\n` +
        `⚡ _Emergency technician dispatch needed!_`;

      for (const targetPhone of targetPhones) {
        if (targetPhone && targetPhone.length >= 10) {
          await whatsapp.sendTextMessage(config.DEFAULT_PHONE_ID, targetPhone, alertMsg);
        }
      }
    } else if (type === 'REPAIR') {
      const targetPhones = [
        ...(config.CP_SYSTEM.NOTIFY_ADMIN_PHONES || ['919041172159']),
        ...(config.CP_SYSTEM.NOTIFY_LEAD_PHONES || ['919915730338'])
      ];
      const alertMsg = `🔧 *MAINTENANCE / REPAIR SERVICE REQUEST* (CP System)\n\n` +
        `👤 *Customer:* ${leadData.name || 'Customer'}\n` +
        `📞 *Phone:* +${leadData.phone}\n` +
        `📍 *Location:* ${leadData.city || 'Punjab'}\n` +
        `🛠️ *Subject:* ${leadData.subject || 'Service / Repair'}\n` +
        `📌 *Special Note:* ${leadData.special_note || 'Technician service requested.'}\n` +
        `💬 *Message:* "${leadData.last_message || ''}"\n\n` +
        `👉 _Technician Gurjant Singh / Karan Singh service follow-up required._`;

      for (const targetPhone of targetPhones) {
        if (targetPhone && targetPhone.length >= 10) {
          await whatsapp.sendTextMessage(config.DEFAULT_PHONE_ID, targetPhone, alertMsg);
        }
      }
    } else if (type === 'GENERAL') {
      const adminPhones = config.CP_SYSTEM.NOTIFY_ADMIN_PHONES || ['919041172159'];
      const alertMsg = `📋 *GENERAL INQUIRY RECEIVED* (CP System)\n\n` +
        `👤 *Name:* ${leadData.name || 'Visitor'}\n` +
        `📞 *Phone:* +${leadData.phone}\n` +
        `📍 *Location:* ${leadData.city || 'Punjab'}\n` +
        `📌 *Subject:* ${leadData.subject || 'General Query'}\n` +
        `📝 *Special Note:* ${leadData.special_note || 'General inquiry.'}\n` +
        `💬 *Message:* "${leadData.last_message || ''}"`;

      for (const targetPhone of adminPhones) {
        if (targetPhone && targetPhone.length >= 10) {
          await whatsapp.sendTextMessage(config.DEFAULT_PHONE_ID, targetPhone, alertMsg);
        }
      }
    }
  } catch (err) {
    console.error('[AI Engine] Failed to dispatch WhatsApp notification:', err.message);
  }
}

// Ensures complete sentences without truncating URLs or query parameters
function ensureSentenceComplete(text) {
  if (!text) return '';
  let cleaned = text.trim();
  // If ends with terminal punctuation or ends with a URL, preserve intact
  if (/[.?!]$/.test(cleaned) || /https?:\/\/[^\s]+$/i.test(cleaned)) return cleaned;
  const lastPunctuation = Math.max(
    cleaned.lastIndexOf('.'),
    cleaned.lastIndexOf('?'),
    cleaned.lastIndexOf('!')
  );
  if (lastPunctuation > 20) {
    const afterPunc = cleaned.slice(lastPunctuation);
    // If what follows is part of a URL (e.g. "?id=1", ".png", ".php", query params), do NOT truncate!
    if (/^[?.!][a-zA-Z0-9_\-=&%/]+/.test(afterPunc)) {
      return cleaned;
    }
    return cleaned.slice(0, lastPunctuation + 1).trim();
  }
  return cleaned + '.';
}

/**
 * Call Gemini API across rotating key pool
 */
async function callGemini(systemPrompt, contents, maxTokens = 350) {
  const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  const maxAttemptsPerModel = Math.min(config.GEMINI_API_KEYS.length, 3);

  for (const model of models) {
    let attempts = 0;
    while (attempts < maxAttemptsPerModel) {
      const apiKey = getNextGeminiKey();
      attempts++;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: maxTokens
          }
        };

        const res = await axios.post(url, payload, {
          headers: { 'Content-Type': 'application/json' },
          httpsAgent,
          timeout: 5000
        });

        const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply && reply.trim()) {
          return reply.trim();
        }
      } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[Gemini (${model}) Attempt ${attempts} Failed]:`, errMsg.slice(0, 100));
        // If quota exceeded or model unavailable, try next key
      }
    }
  }
  return null;
}

/**
 * Call Groq Fallback Engine
 */
async function callGroqFallback(systemPrompt, contents, maxTokens = 500) {
  const keys = config.GROQ_API_KEYS && config.GROQ_API_KEYS.length > 0
    ? config.GROQ_API_KEYS
    : (config.GROQ_API_KEY ? [config.GROQ_API_KEY] : []);

  if (keys.length === 0) {
    console.warn('[Groq Engine] No GROQ_API_KEYS configured');
    return null;
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  if (Array.isArray(contents)) {
    // Keep last 8 turns to ensure prompt stays under Groq 7,000 ITPM limit
    const recent = contents.slice(-8);
    for (const item of recent) {
      const role = item.role === 'model' ? 'assistant' : 'user';
      const text = item.parts?.map(p => p.text).join('\n') || '';
      if (text) {
        messages.push({ role, content: text });
      }
    }
  }

  let attempts = 0;
  const maxGroqAttempts = Math.min(keys.length, 2);
  while (attempts < maxGroqAttempts) {
    const apiKey = getNextGroqKey();
    attempts++;
    try {
      console.log(`⚡ [Groq Fallback] Calling qwen/qwen3.8-27b with key ${attempts}...`);
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: config.GROQ_MODEL || 'qwen/qwen3.8-27b',
        messages,
        max_tokens: maxTokens,
        temperature: 0.25
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 5000
      });

      const reply = res.data?.choices?.[0]?.message?.content;
      if (reply && reply.trim()) {
        return reply.trim();
      }
    } catch (err) {
      console.warn(`[Groq Fallback Attempt ${attempts} Failed]:`, err.response?.data?.error?.message || err.message);
    }
  }
  return null;
}

/**
 * Call Mistral AI Fallback Engine (376 RPM Free Pool)
 */
async function callMistralFallback(systemPrompt, contents, maxTokens = 200) {
  const keys = config.MISTRAL_API_KEYS && config.MISTRAL_API_KEYS.length > 0
    ? config.MISTRAL_API_KEYS
    : [];

  if (keys.length === 0) {
    return null;
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  if (Array.isArray(contents)) {
    const recent = contents.slice(-6);
    for (const item of recent) {
      const role = item.role === 'model' ? 'assistant' : 'user';
      const text = item.parts?.map(p => p.text).join('\n') || '';
      if (text) {
        messages.push({ role, content: text });
      }
    }
  }

  let attempts = 0;
  const maxAttempts = Math.min(keys.length, 2);
  while (attempts < maxAttempts) {
    const apiKey = getNextMistralKey();
    attempts++;
    try {
      console.log(`⚡ [Mistral AI Fallback] Calling ${config.MISTRAL_MODEL || 'open-mistral-nemo'} with key ${attempts}...`);
      const res = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: config.MISTRAL_MODEL || 'open-mistral-nemo',
        messages,
        max_tokens: maxTokens,
        temperature: 0.25
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 5000
      });

      const reply = res.data?.choices?.[0]?.message?.content;
      if (reply && reply.trim()) {
        return reply.trim();
      }
    } catch (err) {
      console.warn(`[Mistral Fallback Attempt ${attempts} Failed]:`, err.response?.data?.error?.message || err.message);
    }
  }
  return null;
}

/**
 * Consultative CP SYSTEM Sales & Qualification Engine (Mature Architecture)
 */
async function handleCpSystemInteraction(cleanPhone, incomingText, userName = '', tenantId = 'cpsystem', existingLead = null) {
  const text = incomingText.trim();
  const lower = text.toLowerCase();

  // Load existing metadata from lead and memory
  const memLeadInfo = memory.getLeadInfo(cleanPhone, tenantId);
  let meta = (existingLead && existingLead.metadata) ? { ...memLeadInfo, ...existingLead.metadata } : { ...memLeadInfo };
  let clientName = existingLead?.name || meta.name || userName || '';
  if (cleanPhone === '919041172159' || clientName === 'Nya' || clientName === 'WhatsApp Contact') {
    if (cleanPhone === '919041172159') clientName = 'Gurdharam';
    else if (clientName === 'WhatsApp Contact') clientName = '';
  }
  const religiousOrGenericRegex = /(baba\s*deep|baba|guru|waheguru|bhagat|deity|god|mandir|gurudwara|friend|test\s*user|client|contact|lead|customer\s*sent|image\s*message|voice\s*message|video\s*message|revoke\s*message)/i;
  if (!clientName || religiousOrGenericRegex.test(clientName) || !/[a-zA-Z\u0A00-\u0A7F\u0900-\u097F]{2,}/.test(clientName)) {
    clientName = '';
  }
  let city = existingLead?.city || meta.city || '';
  let category = meta.category || '';
  let capacity = meta.capacity || '';

  // 0. RESET / START OVER INTENT
  if (/^(reset|restart|new inquiry|naya project|start over|naya setup)\b/i.test(lower)) {
    meta = { name: clientName, status: 'NEW' };
    await db.update('crm_leads', {
      status: 'NEW',
      requirement: 'New inquiry in progress',
      city: null,
      metadata: meta
    }, `tenant_id=eq.${tenantId}&phone=eq.${cleanPhone}`);
    memory.clearHistory(cleanPhone, tenantId);

    const greeting = clientName ? `Hello ${clientName} ji!` : 'Hello!';
    return `${greeting} Batayein, kis naye project ya machine baare plan kar rahe ho?`;
  }

  // 1. GATHER CONVERSATION HISTORY
  let dbMessages = [];
  try {
    const rawClean = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
    const records = await db.get(
      'crm_messages',
      `tenant_id=eq.${tenantId}&lead_phone=in.(${cleanPhone},${rawClean},91${rawClean})&is_deleted=neq.true&delivery_status=neq.FAILED&order=created_at.desc&limit=30`
    );
    if (records && records.length > 0) {
      dbMessages = records.reverse();
    }
  } catch (dbErr) {
    console.warn('[AI Engine] DB message fetch fallback to memory:', dbErr.message);
  }

  let priorHistory = [];
  if (dbMessages.length > 0) {
    const lastMsg = dbMessages[dbMessages.length - 1];
    if (lastMsg.direction === 'INBOUND' && lastMsg.content === incomingText) {
      priorHistory = dbMessages.slice(0, -1);
    } else {
      priorHistory = dbMessages;
    }
  } else {
    priorHistory = memory.getHistory(cleanPhone, tenantId) || [];
  }
  // Filter out deleted, failed, or corrupt degenerate assistant messages ("Ha.", "Ha", "Haan") so they never poison model context
  priorHistory = priorHistory.filter(m => {
    if (m.is_deleted || m.delivery_status === 'FAILED') return false;
    const txt = (m.content || '').trim().toLowerCase();
    if (m.direction === 'OUTBOUND_BOT' || m.role === 'model') {
      if (/^(ha|ha\.|haan|haan\.)$/i.test(txt)) return false;
    }
    return true;
  });

  // SESSION BOUNDARY DETECTION:
  // If last message was > 10 mins ago AND user sends a greeting, or if inactivity gap > 60 mins:
  if (priorHistory.length > 0) {
    const lastMsg = priorHistory[priorHistory.length - 1];
    const lastTime = lastMsg.created_at ? new Date(lastMsg.created_at).getTime() : (lastMsg.timestamp || 0);
    const elapsedMinutes = lastTime ? (Date.now() - lastTime) / (1000 * 60) : 0;
    const isGreeting = /^(hi|hello|hey|sat\s*sri\s*akal|namaste|ssakal|ram\s*ram|radhe\s*radhe|good\s*morning|good\s*evening|pranam|salam)\b/i.test(lower);

    if ((elapsedMinutes > 10 && isGreeting) || elapsedMinutes > 60) {
      console.log(`[AI Engine] Session reset for ${cleanPhone}: gap was ${Math.round(elapsedMinutes)} mins`);
      priorHistory = [];
    }
  }

  // Handle degenerate inputs (single punctuation)
  if (/^[?.!,\s]+$/.test(text)) {
    return 'Hello!';
  }

  // Pure standalone greeting: Fast response, strictly simple & neutral, no exaggerated welcome
  const isPureGreeting = /^\s*(hi|hello|hey|hlo|helo|hy|haanji|hanji|sat\s*sri\s*akal|namaste|ssakal|ram\s*ram|radhe\s*radhe|good\s*morning|good\s*evening|good\s*afternoon|pranam|salam)\s*(ji|sir|veere|bro)?\s*[!.?]*\s*$/i.test(text);
  if (isPureGreeting) {
    return 'Hello!';
  }

  // Pleasantries / Well-being inquiry ("how are you", "kive ho", "ki haal", "kiddan", "haal chaal")
  const isHowAreYou = /\b(?:how\s*are\s*you|kive\s*ho|ki\s*haal|kidda|kiddan|haal\s*chaal|sab\s*theek|how\s*r\s*u)\b/i.test(lower);
  if (isHowAreYou) {
    return "Main theek haan veer ji! Tussi dasso kive ho, sab vadiya? Dasso kede setup baare puchna chahunde ho?";
  }

  // Build clean, authentic conversation turns for LLM (sanitized & bounded to last 4 turns)
  const contents = [];
  const recentMessages = priorHistory.slice(-4);

  for (const m of recentMessages) {
    const isCustomer = m.direction ? m.direction === 'INBOUND' : m.role === 'user';
    const role = isCustomer ? 'user' : 'model';
    let text = (m.content || '').trim();
    // Sanitize past assistant messages: remove URLs, markdown links, prices to prevent context bloat and few-shot mimicry
    if (role === 'model') {
      text = text
        .replace(/https?:\/\/[^\s)]+/gi, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/gi, '$1')
        .replace(/(?:📸|🎥|🌐|🔗)[^\n]*/gi, '')
        .replace(/(?:₹|rs\.?|inr)\s*[\d,]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text.length > 100) text = text.slice(0, 100) + '...';
    }
    if (text) {
      contents.push({
        role: role,
        parts: [{ text: text }]
      });
    }
  }

  // Add current turn with minimal known context if client name or city exists (ONLY on first turn!)
  let customerTurnText = incomingText;
  if (priorHistory.length === 0 && (clientName || city)) {
    const contextPrefix = `[Known Customer: ${clientName || 'Bhaji'}${city ? ', City: ' + city : ''}]`;
    customerTurnText = `${contextPrefix}\n${incomingText}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: customerTurnText }]
  });

  // 2. GENERATE RESPONSE WITH ULTRA-FAST GROQ PRIMARY (<500ms), GEMINI/MISTRAL FALLBACK
  let rawReply = await callGroqFallback(CP_SYSTEM_PROMPT, contents, 200);

  // Check if valid Gemini keys exist before attempting
  const validGeminiKeys = (config.GEMINI_API_KEYS || []).filter(k => k && k.startsWith('AIzaSy'));
  if ((!rawReply || !rawReply.trim()) && validGeminiKeys.length > 0) {
    console.log(`⚡ [Groq Exhausted] Attempting Gemini fallback for ${cleanPhone}...`);
    rawReply = await callGemini(CP_SYSTEM_PROMPT, contents, 180);
  }

  if (!rawReply || !rawReply.trim()) {
    console.log(`⚡ [LLM Exhausted] Attempting Mistral AI fallback for ${cleanPhone}...`);
    rawReply = await callMistralFallback(CP_SYSTEM_PROMPT, contents, 180);
  }

  if (!rawReply || !rawReply.trim()) {
    rawReply = `Hello! Batayein ji, kis machine ya setup baare jankari chahidi hai? Coordinator Karan Singh (+91 99157 30338) vi available han.`;
  }

  // 3. PARSE [[LEAD_UPDATE: ...]] METADATA
  let leadUpdate = null;
  const leadMatch = rawReply.match(/\[\[LEAD_UPDATE:\s*(\{[\s\S]*?\})\s*\]\]/i);
  if (leadMatch) {
    try {
      leadUpdate = JSON.parse(leadMatch[1]);
    } catch (e) {
      try {
        const first = leadMatch[1].indexOf('{');
        const last = leadMatch[1].lastIndexOf('}');
        if (first !== -1 && last !== -1) {
          leadUpdate = JSON.parse(leadMatch[1].slice(first, last + 1));
        }
      } catch (inner) {}
    }
  }

  // Sanitize reply for customer
  let cleanReply = rawReply
    .replace(/\[\[LEAD_UPDATE:[\s\S]*?(?:\]\]|$)/gi, '')
    .replace(/^Charan Sir:?\s*/i, '')
    .replace(/^\[(?:CP System Bot|Assistant|Model|Staff|Bot)\]:?\s*/i, '')
    .trim();

  // Strip repetitive verbal ticks like "Tussi ki sochde ho bhaji?"
  cleanReply = cleanReply
    .replace(/(?:,|\.|\?|!)*\s*(?:tussi|tusse|aap)\s*(?:ki|kya)\s*(?:sochde|sochte|kehnde)\s*ho\s*(?:bhaji|veere|ji)?\??/gi, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If prior conversation exists and clientName is known, prevent repetitive "Name bhaji" prefix on subsequent turns
  if (priorHistory.length > 0 && clientName) {
    const escapedName = clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanReply = cleanReply.replace(new RegExp(`^(?:(?:Koi\\s*gal\\s*nahi|Haanji|Bilkul|Ji|Sat\\s*Sri\\s*Akal|Hello)\\s+)?${escapedName}\\s*(?:bhaji|veere|ji)[,.]?!?\\s*(?:🙏)?\\s*`, 'i'), (match) => {
      if (/koi\s*gal\s*nahi/i.test(match)) return 'Koi gal nahi, ';
      if (/haanji/i.test(match)) return 'Haanji, ';
      if (/bilkul/i.test(match)) return 'Bilkul, ';
      return '';
    }).trim();
    // Clean any stray leading punctuation left over
    cleanReply = cleanReply.replace(/^[,.!?\s🙏]+/, '').trim();
  }

  // Safety guard: if customer asked for 5 Ton (and not 5.5 Ton), mirror strictly as 5 Ton
  if (/(?<![\d.])5\s*(?:ton|tr)\b/i.test(incomingText) && !/5\.5/i.test(incomingText)) {
    cleanReply = cleanReply.replace(/(?<![\d.])5\.5\s*(?:ton|tr)\b/gi, '5 Ton');
  }

  // Mandatory Client Rule 1 & 2: 100% Ban on religious and formal greetings & fold hands emoji
  cleanReply = cleanReply
    .replace(/\b(?:sat\s*sri\s*akal|ssakal|sasrikaal|sasrikal)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/\b(?:namaste|namaskar|ram\s*ram|radhe\s*radhe|pranam)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/\b(?:good\s*morning|good\s*evening|good\s*afternoon)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/🙏/g, '')
    .trim();

  // Camper Models Intent Guard ("kede kede camper aa?")
  if (/(?:kede|keda|kehde|kehda|kehre|which|what)\s*(?:kede|kehde)?\s*(?:camper|campers|models|types)/i.test(incomingText) || /camper\s*(?:options|models|types|list|setup)/i.test(incomingText)) {
    cleanReply = "Camper business layi mostly 1000 LPH te 2000 LPH commercial RO plants lagde ne ji. [[SPLIT]] Naal heavy SS storage tank te automatic chilling system hunda a, 20L cans easily pack hunde ne.";
  }

  // Mandatory Client Rule: Ban unasked interrogation unless customer explicitly says "lagwana hai", "order", "theek hai", "site visit"
  const hasInstallIntent = /(?:lagwana|lagwauna|order|fitment|fitting|site\s*visit|visit\s*karo|theek\s*hai|kharidna|lena\s*hai)/i.test(incomingText);
  if (!hasInstallIntent) {
    cleanReply = cleanReply
      .replace(/(?:eh\s*setup\s*)?(?:tussi|tusse|aap)\s*kehde\s*(?:pind|shehar|city|jagah)\s*(?:vich|ch|mein)\s*(?:lagwana|lagwauna|shuru\s*karna)?\s*(?:chahte\s*ho|chahunde\s*ho)?\s*(?:ji)?\??/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Mandatory Client Rule 3A: General Chiller Price Query without specific tonnage
  // Do NOT dump the full rate card! Ask which tonnage or capacity they need first.
  const hasSpecificTonnage = /(?:\b\d+(?:\.\d+)?\s*(?:ton|tr|lph|litre|liter|l)\b)/i.test(incomingText);
  const isGeneralChillerPriceQuery = /(?:chiller|chillar)\s*(?:da|di|ka|ki)?\s*(?:rate|price|cost|kinne|kitne|mull)/i.test(incomingText) ||
    (/^(?:rate|price|cost|kinne\s*da|kitne\s*ka)\??$/i.test(incomingText.trim()) && /chiller/i.test(category));

  if (isGeneralChillerPriceQuery && !hasSpecificTonnage) {
    cleanReply = "Chiller da rate capacity te cooling requirement te depend karda a veer ji. [[SPLIT]] Tussi kinne ton ya daily kinne litre doodh cooling layi setup dekh rahe ho ji?";
  }

  // Mandatory Client Rule 3B: Non-Chiller Pricing (RO, Camper, Heat Pump, Cold Room)
  // We ONLY know fixed rates for Chillers. All other products must strictly be referred to Karan Sir (+91 99157 30338).
  const isNonChillerProduct = /(?:ro|camper|heat\s*pump|cold\s*room|softener|bmc)/i.test(incomingText) ||
    (/(?:ro|heat\s*pump|cold\s*room|softener|bmc)/i.test(category) && !/chiller|chillar/i.test(incomingText));
  const isPriceQuery = /(?:price|rate|cost|quotation|quote|kharcha|budget|rupaye|rupees|rs\.?|inr|mull|bhaav|kinne|kinney|kine|kiney|kitne|kitna|kinna|kina|kinni|kini)/i.test(incomingText);
  const mentionsPriceInReply = /(?:₹|rs\.?|inr)\s*[\d,]+/i.test(cleanReply);

  if ((isNonChillerProduct && (isPriceQuery || mentionsPriceInReply)) || (mentionsPriceInReply && !hasSpecificTonnage && !/chiller|chillar/i.test(incomingText))) {
    cleanReply = "Commercial RO te camper plant da rate paani de TDS te setup te depend karda a ji. [[SPLIT]] Exact customized quotation layi Support Coordinator Karan Singh ji (+91 99157 30338) direct rabta karange ji.";
  }

  // Strict Media Defense & URL Stripper
  const isExplicitMediaRequest = /(?:photo|video|pic|pics|image|tasveer|link|catalog|brochure|dikhao|bhejo|vej\s*de|kive\s*dikhda)/i.test(incomingText);
  if (!isExplicitMediaRequest) {
    cleanReply = cleanReply
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '')
      .replace(/https?:\/\/[^\s)]+/gi, '')
      .replace(/(?:📸|🎥|🌐|🔗)\s*(?:\*\*)?(?:photo|video|demo\s*video|working\s*video|website(?:\s*specs|\s*details|\s*models)?|demo|link|brochure|catalog)?(?:\*\*)?:?/gi, '')
      .replace(/(?:\*\*)?(?:photo|video|demo\s*video|working\s*video|website(?:\s*specs|\s*details|\s*models)?)(?:\*\*)?:?/gi, '')
      .replace(/\*\*\s*\*\*/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .replace(/[*:\-\s]+$/, '')
      .trim();
  } else {
    // If media WAS requested: convert any markdown [text](url) to plain raw url for WhatsApp
    cleanReply = cleanReply.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$2');
    // Ensure strict product relevance: if customer asked for chiller, remove any non-chiller links
    if (/chiller|chillar/i.test(incomingText) && !/ro|camper|heat|cold/i.test(incomingText)) {
      cleanReply = cleanReply.replace(/https?:\/\/[^\s)]*producs-p\.php\?id=[2345][^\s)]*/gi, 'https://www.cpsystem.in/cps/src/producs-p.php?id=1');
      cleanReply = cleanReply.replace(/https?:\/\/[^\s)]*ssW53Nbj1_c[^\s)]*/gi, 'https://www.youtube.com/watch?v=NmKCLdSlzP0');
    }
    // If customer asked for RO/camper, remove any chiller links
    if (/ro|camper/i.test(incomingText) && !/chiller|chillar/i.test(incomingText)) {
      cleanReply = cleanReply.replace(/https?:\/\/[^\s)]*producs-p\.php\?id=[1345][^\s)]*/gi, 'https://www.cpsystem.in/cps/src/producs-p.php?id=2');
      cleanReply = cleanReply.replace(/https?:\/\/[^\s)]*NmKCLdSlzP0[^\s)]*/gi, 'https://www.youtube.com/watch?v=ssW53Nbj1_c');
    }
  }

  // Strip Financial Hype / Marketing Nonsense across all responses
  cleanReply = cleanReply
    .replace(/[^.!?\n]*(?:profit\s*margin|kamai|munafa)[^.!?\n]*[.!?]?/gi, '')
    .replace(/(?:,|\.|\?|!)*\s*(?:dekh\s*liya\s*(?:ji)?|aur\s*dikhane\s*chahte\s*ho\??|tussi\s*ki\s*sochde\s*ho\??|kuch\s*hor\s*puchna\s*hai\??)[\s.?!]*$/gi, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If user asked about business, ensure response is strictly concise
  if (/(?:business|kaam|model)/i.test(incomingText) && cleanReply.length > 180) {
    cleanReply = "Camper water business ch 1000 LPH commercial RO plant lagda a ji. [[SPLIT]] Is naal 20L camper cans pack karke shops, events te functions ch chilled water supply kita janda a.";
  }

  // Strip accidental leading greeting if customer did not greet
  if (!isPureGreeting) {
    cleanReply = cleanReply.replace(/^(?:hello!?|hi!?)\s*(?:ji!?)?\s*/i, '').trim();
  }

  // Clean any stray leading punctuation left over
  cleanReply = cleanReply.replace(/^[,.!?\s]+/, '').trim();
  cleanReply = ensureSentenceComplete(cleanReply);

  // 0.8x Compactness: Cap to maximum 2 sentences for brevity if single paragraph (never truncate media/links)
  const sentences = cleanReply.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (sentences && sentences.length > 2 && !cleanReply.includes('\n') && !cleanReply.includes('[[SPLIT]]') && cleanReply.length > 160 && !/https?:\/\//i.test(cleanReply)) {
    cleanReply = sentences.slice(0, 2).join(' ').trim();
  }

  // Anti-Degeneracy Quality Gate: NEVER send 1-word or grunt replies
  const isGruntReply = /^(ha|haan|haanji|ji|ok|theek\s*hai|hmm|acha|got\s*it|hlo|hi|yes|no)[\s.!?]*$/i.test(cleanReply.trim());
  if (cleanReply.length < 12 || isGruntReply) {
    console.log(`🛡️ [Degenerate Reply Intercepted]: "${cleanReply}" for input "${incomingText}". Regenerating helpful response.`);
    if (isPureGreeting) {
      cleanReply = "Hello ji! Dasso, kive madad kar sakde a?";
    } else if (/(?:kede|kehde)\s*camper/i.test(incomingText)) {
      cleanReply = "Camper business layi mostly 1000 LPH te 2000 LPH commercial RO plants lagde ne ji. [[SPLIT]] Naal heavy SS storage tank te automatic chilling system hunda a, 20L cans easily pack hunde ne.";
    } else if (/camper/i.test(incomingText) || /camper/i.test(category)) {
      cleanReply = "Haanji veer ji, 20L camper business layi commercial RO plant setup (1000 LPH te 2000 LPH) available a ji.";
    } else if (/business|kaam|model/i.test(incomingText)) {
      cleanReply = "Camper water business ch 1000 LPH commercial RO plant lagda a ji. [[SPLIT]] Is naal 20L camper cans pack karke shops, events te functions ch chilled water supply kita janda a.";
    } else if (/chiller|chillar/i.test(incomingText) || /chiller/i.test(category)) {
      cleanReply = "Haanji veer ji, CP System kol online chillers (1 to 2.5 Ton) te heavy circulation chillers (3.5 Ton aur upar) available ne.";
    } else if (/ro|plant/i.test(incomingText) || /ro/i.test(category)) {
      cleanReply = "Haanji veer ji, 500 LPH, 1000 LPH te 2000 LPH commercial RO plants available ne.";
    } else {
      cleanReply = "Hello ji! Batayein, kis machine ya setup baare jankari chahidi a?";
    }
  }

  // 4. APPLY EXTRACTED METADATA & UPDATE SUPABASE CRM
  if (leadUpdate) {
    let shouldUpdateDb = false;
    const dbUpdates = {};

    const isInvalidExtractedName = (nm) => {
      if (!nm || typeof nm !== 'string') return true;
      const clean = nm.trim();
      if (clean.length < 2 || clean.length > 30 || /^\d+$/.test(clean)) return true;
      return /(customer|image|voice|video|document|baba|guru|waheguru|unknown|client|lead|nya|friend|whatsapp)/i.test(clean);
    };

    if (leadUpdate.name && !isInvalidExtractedName(leadUpdate.name)) {
      clientName = leadUpdate.name.trim();
      dbUpdates.name = clientName;
      meta.name = clientName;
      shouldUpdateDb = true;
    }

    if (leadUpdate.city && leadUpdate.city !== 'null' && leadUpdate.city.length >= 3) {
      city = leadUpdate.city;
      dbUpdates.city = city;
      meta.city = city;
      shouldUpdateDb = true;
    }

    if (leadUpdate.category && leadUpdate.category !== 'null') {
      category = leadUpdate.category;
      meta.category = category;
      shouldUpdateDb = true;
    }

    if (leadUpdate.capacity && leadUpdate.capacity !== 'null') {
      capacity = leadUpdate.capacity;
      meta.capacity = capacity;
      shouldUpdateDb = true;
    }

    if (category || capacity) {
      dbUpdates.requirement = `${category || 'Machinery'} ${capacity ? `(${capacity})` : ''}`.trim();
    }

    const wasQualifiedBefore = existingLead?.status === 'QUALIFIED' || meta.was_qualified === true;
    const hasSufficientData = Boolean(city && (category || capacity));
    const isExplicitlyQualified = (leadUpdate.status === 'QUALIFIED' || leadUpdate.intent === 'QUALIFIED');
    const isActionableQualified = hasSufficientData && (
      isExplicitlyQualified ||
      /(?:site\s*visit|visit\s*schedule|finalize|deal\s*done|quotation\s*bhej|order\s*karna|visit\s*karo|quotation\s*send|kado\s*aana|kadon\s*aaoge)/i.test(incomingText) ||
      Boolean(meta.city && (meta.category || meta.capacity) && /(?:3-phase|electricity|connection|bijli|borewell|canal|nehar|tds|camper)/i.test(incomingText))
    );

    if (isActionableQualified && !wasQualifiedBefore) {
      dbUpdates.status = 'QUALIFIED';
      dbUpdates.was_qualified = true;
      dbUpdates.followup_enabled = false;
      dbUpdates.followup_due_at = null;
      meta.status = 'QUALIFIED';
      meta.was_qualified = true;
      meta.qualified_at = new Date().toISOString();
      shouldUpdateDb = true;

      const leadData = {
        name: clientName || 'Qualified Lead',
        phone: cleanPhone,
        requirement: dbUpdates.requirement || existingLead?.requirement || 'Commercial Setup',
        city: city || 'Punjab',
        water_source: leadUpdate.water_source || (/\b(nehar|canal)\b/i.test(incomingText) ? 'Canal Water' : /\b(borewell|submersible|ground)\b/i.test(incomingText) ? 'Borewell' : null),
        water_tds: leadUpdate.water_tds || (incomingText.match(/\b(\d{2,4})\s*tds\b/i)?.[1] ? `${incomingText.match(/\b(\d{2,4})\s*tds\b/i)[1]} PPM` : null),
        power_supply: leadUpdate.power_supply || (/\b(3-phase|three\s*phase)\b/i.test(incomingText) ? '3-Phase Available' : null),
        containers: leadUpdate.containers || (/\b(camper|20\s*l|bottle)\b/i.test(incomingText) ? '20L Campers' : null),
        special_note: leadUpdate.special_note || 'Commercial requirements confirmed.',
        last_message: incomingText,
        inquiry_type: 'SALES',
        timestamp: new Date().toISOString()
      };
      saveLeadToDisk(leadData);
      dispatchLeadNotification(leadData).catch(() => {});
    } else if (leadUpdate.status === 'COMPLAINT' || leadUpdate.intent === 'COMPLAINT') {
      if (!meta.complaint_alert_dispatched && !meta.repair_alert_dispatched) {
        dbUpdates.status = 'COMPLAINT';
        dbUpdates.followup_enabled = false;
        dbUpdates.followup_due_at = null;
        meta.status = 'COMPLAINT';
        meta.complaint_alert_dispatched = true;
        meta.repair_alert_dispatched = true;
        shouldUpdateDb = true;

        const leadData = {
          name: clientName || 'Customer',
          phone: cleanPhone,
          city: city || 'Punjab',
          subject: leadUpdate.subject || 'Customer Complaint',
          requirement: `[COMPLAINT] ${incomingText.slice(0, 100)}`,
          special_note: leadUpdate.special_note || 'Customer reported a machine complaint.',
          last_message: incomingText,
          inquiry_type: 'COMPLAINT',
          timestamp: new Date().toISOString()
        };
        saveLeadToDisk(leadData);
        dispatchLeadNotification(leadData).catch(() => {});
      }
    } else if (leadUpdate.status === 'REPAIR' || leadUpdate.intent === 'REPAIR') {
      if (!meta.repair_alert_dispatched && !meta.complaint_alert_dispatched) {
        dbUpdates.status = 'REPAIR';
        dbUpdates.followup_enabled = false;
        dbUpdates.followup_due_at = null;
        meta.status = 'REPAIR';
        meta.repair_alert_dispatched = true;
        meta.complaint_alert_dispatched = true;
        shouldUpdateDb = true;

        const leadData = {
          name: clientName || 'Customer',
          phone: cleanPhone,
          city: city || 'Punjab',
          subject: leadUpdate.subject || 'Repair / Maintenance',
          requirement: `[REPAIR] ${incomingText.slice(0, 100)}`,
          special_note: leadUpdate.special_note || 'Customer requested technician repair.',
          last_message: incomingText,
          inquiry_type: 'REPAIR',
          timestamp: new Date().toISOString()
        };
        saveLeadToDisk(leadData);
        dispatchLeadNotification(leadData).catch(() => {});
      }
    } else if (
      !meta.general_alert_dispatched &&
      (
        /\b(dealer|dealership|distributor|distributorship|franchise|job|vacancy|resume|naukri|invoice|bilti|bill|gst|tax)\b/i.test(incomingText) ||
        (
          (leadUpdate?.status === 'GENERAL' || (leadUpdate?.intent === 'GENERAL' && leadUpdate?.status !== 'IN_PROGRESS')) &&
          !/(?:machine\s*baare|chiller|ro\s*plant|camper\s*plant|cooling|ton|rate|price|cost)/i.test(incomingText) &&
          !/^\s*(hi|hello|hey|hlo|helo|haanji|hanji|sat\s*sri\s*akal)\b/i.test(incomingText)
        )
      )
    ) {
      dbUpdates.status = 'GENERAL';
      meta.status = 'GENERAL';
      meta.general_alert_dispatched = true;
      shouldUpdateDb = true;

      let guessedSubject = 'General Inquiry';
      if (/\b(dealer|dealership|distributor|distributorship|franchise)\b/i.test(incomingText)) guessedSubject = 'Dealership / Franchise Inquiry';
      else if (/\b(job|vacancy|resume|cv|hiring|naukri)\b/i.test(incomingText)) guessedSubject = 'Job Application';
      else if (/\b(invoice|bilti|bill|gst|tax)\b/i.test(incomingText)) guessedSubject = 'Billing Query';
      else if (leadUpdate?.subject) guessedSubject = leadUpdate.subject;

      const leadData = {
        name: clientName || 'Customer',
        phone: cleanPhone,
        city: city || 'Punjab',
        subject: guessedSubject,
        requirement: `[GENERAL] ${incomingText.slice(0, 100)}`,
        special_note: leadUpdate?.special_note || `General inquiry regarding ${guessedSubject.toLowerCase()}.`,
        last_message: incomingText,
        inquiry_type: 'GENERAL',
        timestamp: new Date().toISOString()
      };
      saveLeadToDisk(leadData);
      dispatchLeadNotification(leadData).catch(() => {});
    }

    // Persist meta to in-memory session store so subsequent messages in the same session retain alert flags
    memory.setLeadClosed(cleanPhone, meta.was_qualified || false, meta, tenantId);

    if (shouldUpdateDb) {
      dbUpdates.metadata = meta;
      try {
        const isTestPhone = cleanPhone.startsWith('9198765') || cleanPhone.startsWith('9199990') ||
          cleanPhone.startsWith('155501') || cleanPhone.startsWith('9191111') ||
          cleanPhone.startsWith('9192222') || cleanPhone.startsWith('9193333') ||
          cleanPhone.startsWith('9194444') || cleanPhone.startsWith('9195555') ||
          cleanPhone.startsWith('9199999');
        const targetTenant = tenantId;
        const targetIsDeleted = isTestPhone ? true : false;

        const existing = await db.get('crm_leads', `tenant_id=eq.${targetTenant}&phone=eq.${cleanPhone}`);
        if (existing && existing.length > 0) {
          if (isTestPhone) dbUpdates.is_deleted = true;
          await db.update('crm_leads', dbUpdates, `tenant_id=eq.${targetTenant}&phone=eq.${cleanPhone}`);
        } else {
          await db.insert('crm_leads', {
            tenant_id: targetTenant,
            phone: cleanPhone,
            name: clientName || 'Lead',
            requirement: dbUpdates.requirement || 'Commercial Setup',
            city: city || 'Punjab',
            status: dbUpdates.status || 'NEW',
            bot_active: !isTestPhone,
            is_deleted: targetIsDeleted,
            metadata: meta
          });
        }
      } catch (dbErr) {
        console.warn('[DB Lead Update Warning]:', dbErr.message);
      }
    }
  }

  // 5. HUMAN SALESMAN MULTI-MESSAGE SPLITTER
  function formatHumanSplit(text) {
    if (!text) return [];

    const cleanBubble = (str) => {
      return (str || '')
        .replace(/(?:,|\.|\?|!)*\s*(?:dekh\s*liya\s*(?:ji)?|dekha\s*(?:ji)?|aur\s*dikhane\s*chahte\s*ho\??|tussi\s*ki\s*sochde\s*ho\??|kuch\s*hor\s*puchna\s*hai\??|koi\s*aur\s*madad\s*kiya\??)[\s.?!]*$/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    let bubbles = [];
    if (text.includes('[[SPLIT]]')) {
      bubbles = text.split('[[SPLIT]]').map(s => s.trim()).filter(Boolean);
    } else if (/https?:\/\//i.test(text)) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const textParts = lines.filter(l => !/https?:\/\//i.test(l) && !/(?:📸|🎥|🌐|🔗)/i.test(l));
      const mediaParts = lines.filter(l => /https?:\/\//i.test(l) || /(?:📸|🎥|🌐|🔗)/i.test(l));
      if (textParts.length > 0 && mediaParts.length > 0) {
        bubbles = [textParts.join(' '), mediaParts.join('\n')];
      }
    } else {
      const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g);
      if (sentences && sentences.length === 2 && text.length > 55 && !text.includes('\n')) {
        bubbles = [sentences[0].trim(), sentences[1].trim()];
      }
    }

    if (bubbles.length === 0) bubbles = [text.trim()];
    return bubbles.map(cleanBubble).filter(Boolean);
  }

  const splitMessages = formatHumanSplit(cleanReply);
  return splitMessages.length > 1 ? splitMessages : cleanReply;
}

/**
 * Main AI reply router
 */
async function generateAIReply(userPhone, incomingText, userName = '', tenantId = '', phoneNumberId = '', existingLead = null) {
  const cleanPhone = userPhone.replace(/\D/g, '');
  const lowerText = incomingText.trim().toLowerCase();

  let displayName = userName;
  if (cleanPhone === '919041172159' || displayName === 'Nya') {
    displayName = 'Gurdharam';
  }

  const effectiveTenant = (phoneNumberId === '1345576425313536' || tenantId === 'cpsystem') ? 'cpsystem' : (tenantId || 'default');
  const restoredLead = await memory.syncFromSupabase(cleanPhone, effectiveTenant, db);
  const activeLead = existingLead || restoredLead;

  // 1. DEDICATED CP SYSTEM FLOW
  if (effectiveTenant === 'cpsystem') {
    memory.setMode(cleanPhone, 'cp_system', effectiveTenant);
    const reply = await handleCpSystemInteraction(cleanPhone, incomingText, displayName, effectiveTenant, activeLead);

    const memReply = Array.isArray(reply) ? reply.join(' ') : reply;
    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', memReply, effectiveTenant);
    return reply;
  }

  // 2. DEMO / GURINATION ENTERPRISE DEFAULT MODE
  const cpTriggerRegex = /\b(cp\s*system|cpsystem|cp\s*systems|cool\s*&\s*pure)\b/i;
  const exitTriggerRegex = /\b(exit\s*cp|reset\s*demo|guri\s*bot|default\s*bot|exit\s*demo|default\s*mode)\b/i;

  if (exitTriggerRegex.test(lowerText)) {
    memory.setMode(cleanPhone, 'default', effectiveTenant);
    const exitMsg = "🔄 Switched back to *Gurination Default Assistant* mode.\n\nHow can I help you with web development, WhatsApp AI bots, appointment recall, or custom business dashboards today?";
    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', exitMsg, effectiveTenant);
    return exitMsg;
  }

  if (cpTriggerRegex.test(lowerText)) {
    memory.setMode(cleanPhone, 'cp_system', effectiveTenant);
    const reply = await handleCpSystemInteraction(cleanPhone, incomingText, displayName, 'cpsystem', activeLead);
    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', reply, effectiveTenant);
    return reply;
  }

  // Generic Gemini Reply for default tenant
  const history = memory.getHistory(cleanPhone, effectiveTenant) || [];
  const contents = [];

  for (const h of history.slice(-30)) {
    contents.push({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    });
  }

  const contextPrefix = displayName ? `[Customer Name: ${displayName}, Phone: ${cleanPhone}]` : `[Customer Phone: ${cleanPhone}]`;
  contents.push({
    role: 'user',
    parts: [{ text: `${contextPrefix}: ${incomingText}` }]
  });

  const reply = await callGemini(ENTERPRISE_SYSTEM_PROMPT, contents, 1024) ||
    await callGroqFallback(ENTERPRISE_SYSTEM_PROMPT, contents, 600) ||
    "Hello! Hamari technical team aapki query check kar rahi hai. Ek minute mein connect karte hain!";

  const cleanedReply = ensureSentenceComplete(reply);
  memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
  memory.addMessage(cleanPhone, 'model', cleanedReply, effectiveTenant);
  return cleanedReply;
}

/**
 * Follow-up message generator
 */
async function generateFollowUpMessage(lead, tenantId = 'cpsystem') {
  const req = (lead?.requirement || '').toLowerCase();
  const name = lead?.name && lead?.name !== 'WhatsApp Contact' && lead?.name !== 'WhatsApp Lead' ? lead.name : '';
  const salutation = name ? `Hello ${name} ji!` : 'Hello!';

  const isUtility = /\b(chiller|chillers|cooling|dairy|milk|bmc|machine|molding|laser|bakery|glycol|cold\s*room)\b/i.test(req);

  if (tenantId === 'cpsystem' || tenantId === 'cp_system') {
    if (isUtility) {
      return `${salutation} CP SYSTEM Muktsar se.\n\nDairies te factory machine cooling batch shuru ho chuka hai. Technical specification chart ya quotation share karwa dawan ji? Coordinator Karan Singh (+91 99157 30338) ready han.`;
    } else {
      return `${salutation} CP SYSTEM Muktsar se.\n\nTuhade project baare jankari chahidi hove taan Coordinator Karan Singh (+91 99157 30338) naal gal karwa sakde haan ji.`;
    }
  }

  const genericReq = lead?.requirement && lead?.requirement !== '---' ? ` regarding your inquiry for ${lead.requirement}` : ' regarding your inquiry';
  return `${salutation} Just checking in${genericReq}. Please let us know if you would like our official quotation or tech catalog. We are happy to assist!`;
}

module.exports = {
  generateAIReply,
  handleCpSystemInteraction,
  generateFollowUpMessage,
  ENTERPRISE_SYSTEM_PROMPT,
  CP_SYSTEM_PROMPT,
  CP_QUOTATIONS_CATALOG: cpQuotations.CP_QUOTATIONS_CATALOG,
  CP_COMMERCIAL_TERMS: cpQuotations.CP_COMMERCIAL_TERMS,
  getChillerQuotation: cpQuotations.getChillerQuotation,
  formatWhatsAppQuotation: cpQuotations.formatWhatsAppQuotation
};
