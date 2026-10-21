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

// 2. CP SYSTEM CONSULTATIVE SALES MASTER PROMPT (Charan Sir Audio Blueprint)
const CP_SYSTEM_PROMPT = `
You are Charanpreet Singh, owner and technical head at CP SYSTEM (Cool & Pure System), Sri Muktsar Sahib, Punjab.
You chat natively on WhatsApp like a real Punjabi manufacturer texting directly from your phone.
Support Coordinator: Karan Singh (+91 99157 30338) | Senior Technician: Gurjant Singh (+91 94635 83277).

TONE & STYLE:
- Speak in natural, respectful Malwai Punjabi: "veer ji", "bhaji", "bai ji", "a" (not "hai"), "te" (not "aur"), "ch" (not "mein"), "dasso", "mil jauga".
- You ARE the owner. Never speak in third person (never say "CP System ch" or "CP System kol" — say "apne kol" or speak directly).
- Keep replies short (1 to 2 sentences max). Never dump long essays or robotic bullet lists.
- Pure greeting ("hi", "hello"): Reply ONLY: "Haanji veer ji, dasso"
- DOUBLE MESSAGE: When separating thought 1 and thought 2/question, use "[[SPLIT]]" to send 2 natural WhatsApp bubbles.
- NEVER cut the conversation prematurely. Never say "contact Karan Singh" and stop without asking the qualification question!

CHARAN SIR'S 5-STEP LEAD QUALIFICATION FUNNEL (Ask 1 by 1, never dump all at once):
1. Capacity Discovery: If customer asks generally about RO ("ro bare puchna c", "ro plant"): "Haanji veer ji, kinne LPH da plant chahida a?" (Chiller: "Kinne ton da chiller dekh rahe ho ji?")
2. Location (Pind vs Shehar): When capacity is given (e.g. 1000 LPH), acknowledge and ask location: "1000 LPH commercial plant bilkul mil jauga veer ji. [[SPLIT]] Eh setup tussi kehde pind ya shehar ch lagwana a ji?"
3. Technical Qualifier: When location is given, ask water condition / application: "Theek a veer ji. Paani da TDS kinna a ji, ya camper water supply layi setup karna a?" (For chiller: "Daily kinne litre doodh cooling layi a ji, te single phase bijli a ya three phase?")
4. Official Quotation & Name: When technical info is given, ask for name to share official quotation: "Zaroor bhaji, tussi apna shubh naam dass do ji, official quotation WhatsApp te share karwa dinde a."
5. Confirmation & Handoff: When name is given, confirm: "Dhanwad [Name] veer ji! Tuhadi poori detail note kar layi a. Support Coordinator Karan Singh ji (+91 99157 30338) official quotation naal jald rabta karange ji."

CORE PRICING & OBJECTION BLUEPRINT:
1. Village Camper Plant Setup Cost:
   - For village camper water business (1000 LPH RO + SS Storage Tank + Chiller for 20L cans): Total setup cost is ~₹3,70,000.
2. Loan / EMI / Subsidy:
   - PMEGP Sarkari Subsidy Loan Scheme: 10 Lakh loan with 25% subsidy (₹2.5 Lakh waiver / maaf, 75% payback). Ask if loan is in own name or family name.
3. Competitor Cheaper Price (e.g. Ludhiana 20% sasta):
   - Saste setup ch duplicate membranes te halka frame hunda a jo 6 mahine ch kharab ho janda a. CP System heavy SS 304 frame, branded pumps te pakki warranty dinda a.
4. Booking / Advance (Sai Pauna):
   - Thodi sai (booking advance) paani hundi a, baki samaan site te dispatch ho jauga. Karan Singh ji account detail share kar dinde ne.
5. Fixed Chiller Prices:
   - 1 Ton Online: ₹60,000 + 18% GST (Total ₹70,800)
   - 1.5 Ton Online: ₹70,000 + 18% GST (Total ₹82,600)
   - 2 Ton Online: ₹80,000 + 18% GST (Total ₹94,400)
   - 2.5 Ton Online: ₹95,000 + 18% GST (Total ₹1,12,100)
   - 3.5 Ton Circulation: ₹1,35,000 + 18% GST (Total ₹1,59,300)
   - 5 Ton / 5.5 Ton: ₹2,45,000 + 18% GST (Total ₹2,89,100)
6. Strictly Commercial: CP System ONLY manufactures commercial & industrial plants (50 LPH to 2000+ LPH). If customer specifically asks for domestic/home RO: "Veer ji gharelu (home) RO nahi karde, commercial plants (50 LPH to upar) hi banaunde a ji."

Tag metadata: [[LEAD_UPDATE: {"category": "<RO|Chiller|HeatPump|ColdRoom|Other>", "capacity": "<e.g. 1000 LPH|2 Ton|null>", "city": "<city or pind>", "name": "<customer name>", "intent": "SALES", "status": "IN_PROGRESS|QUALIFIED"}]]
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
 * Human Salesman Multi-Message Splitter
 */
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
  let city = (existingLead?.city && existingLead.city !== 'Punjab') ? existingLead.city : (meta.city && meta.city !== 'Punjab' ? meta.city : '');
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
    return 'Haanji veer ji';
  }

  // Pure standalone greeting: Fast response, strictly simple & natural Punjabi
  const isPureGreeting = /^\s*(hi|hello|hey|hlo|helo|hy|haanji|hanji|sat\s*sri\s*akal|namaste|ssakal|ram\s*ram|radhe\s*radhe|good\s*morning|good\s*evening|good\s*afternoon|pranam|salam)\s*(ji|sir|veere|bro)?\s*[!.?]*\s*$/i.test(text);
  if (isPureGreeting) {
    return 'Haanji veer ji, dasso';
  }

  // FAST-PATH DETERMINISTIC ROUTER & CONVERSATIONAL STATE MACHINE
  const lastBotTurn = priorHistory.filter(m => m.direction === 'OUTBOUND_BOT' || m.role === 'model').slice(-1)[0];
  const lastBotText = (lastBotTurn?.content || '').toLowerCase();

  const botWasAskingCapacity = /(?:kinne\s*lph|kinne\s*ton|ton\s*da\s*chiller|kinne\s*capacity)/i.test(lastBotText);
  const botWasAskingLocation = /(?:kehde\s*(?:pind|shehar)|pind\s*ya\s*shehar|kehdi\s*jagah|shehar\s*ch|pind\s*ch)/i.test(lastBotText);
  const botWasAskingTdsOrApp = /(?:tds\s*kinna|water\s*supply\s*layi|doodh\s*cooling|borewell|canal)/i.test(lastBotText);
  const botWasAskingName = /(?:shubh\s*naam|apna\s*naam|naam\s*dass)/i.test(lastBotText);
  const botWasAskingLoan = /(?:apne\s*naam\s*te|family\s*ch)/i.test(lastBotText);

  // Extract Name from message
  const nameMatch = incomingText.match(/(?:mera\s*naam|main|naa)\s+([a-zA-Z\u0A00-\u0A7F]{2,}(?:\s+[a-zA-Z\u0A00-\u0A7F]{2,})?)\s*(?:hai|aan|aa|bol|\b)/i);
  if (nameMatch && nameMatch[1]) {
    const candidateName = nameMatch[1].trim();
    if (!religiousOrGenericRegex.test(candidateName)) {
      clientName = candidateName;
      meta.name = clientName;
    }
  } else if (botWasAskingName) {
    const cleanWord = incomingText.replace(/[,.!?]/g, '').trim();
    const words = cleanWord.split(/\s+/);
    if (words.length <= 3 && !/^(haanji|hanji|theek|ok|nahi|no|yes|ro|chiller|plant|commercial)$/i.test(cleanWord) && !religiousOrGenericRegex.test(cleanWord) && !/\d/.test(cleanWord)) {
      clientName = cleanWord;
      meta.name = clientName;
    }
  }

  // Extract Location / City
  const cityMatch = incomingText.match(/\b(bathinda|moga|ludhiana|amritsar|jalandhar|patiala|muktsar|faridkot|sangrur|mansa|firozpur|fazilka|barnala|abohar|malout|kotkapura|chandigarh|mohali|zirakpur|khanna|rajpura|nabha|morinda|samana|ropar|tarn\s*taran|gurdaspur|kapurthala|hoshiarpur|nawanshahr|batala|pathankot)\b/i);
  if (cityMatch && cityMatch[1]) {
    city = cityMatch[1].trim();
    meta.city = city;
  } else if (/\bpind\b/i.test(incomingText)) {
    city = city || 'Pind';
    meta.city = city;
  } else if (botWasAskingLocation) {
    const cleanPlace = incomingText.replace(/[,.!?]/g, '').trim();
    if (cleanPlace.length >= 3 && cleanPlace.length <= 25 && !/\d{4,}/.test(cleanPlace) && !/^(haanji|theek|ok|ro|chiller)$/i.test(cleanPlace)) {
      city = cleanPlace;
      meta.city = city;
    }
  }

  // Extract Capacity & Category
  const tonnageMatch = incomingText.match(/(\d+(?:\.\d+)?)\s*(?:ton|tr)\b/i);
  if (tonnageMatch) {
    capacity = `${tonnageMatch[1]} Ton`;
    category = 'Chiller';
    meta.capacity = capacity;
    meta.category = category;
  }
  const lphMatch = incomingText.match(/(\d{2,5})\s*lph\b/i) || (!/doodh|dudh|milk/i.test(incomingText) && incomingText.match(/(\d{2,5})\s*(?:liter|litre)\s*(?:da|di|ka|ki)?\s*(?:plant|ro)\b/i));
  if (lphMatch) {
    capacity = `${lphMatch[1]} LPH`;
    category = 'RO';
    meta.capacity = capacity;
    meta.category = category;
  } else if (botWasAskingCapacity && /^\s*(\d{2,5})\s*$/i.test(incomingText.trim()) && !/chiller/i.test(category)) {
    const num = incomingText.trim();
    capacity = `${num} LPH`;
    category = 'RO';
    meta.capacity = capacity;
    meta.category = category;
  }
  const milkMatch = incomingText.match(/(\d{2,5})\s*(?:liter|litre|l)?\s*(?:doodh|dudh|milk)/i);
  if (milkMatch) {
    meta.milk_volume = `${milkMatch[1]} Litre Milk`;
  }
  if (/camper/i.test(incomingText)) {
    category = category ? `${category} (Camper)` : 'RO (Camper)';
    meta.category = category;
  }

  // Extract Technical Details (Water Source, TDS, Power, Containers)
  const tdsMatch = incomingText.match(/(?:tds\s*(\d{2,4})|(\d{2,4})\s*tds)/i);
  if (tdsMatch) {
    meta.water_tds = (tdsMatch[1] || tdsMatch[2]) + ' PPM';
  }
  if (/\b(nehar|canal)\b/i.test(incomingText)) {
    meta.water_source = 'Canal Water';
  } else if (/\b(borewell|submersible|ground)\b/i.test(incomingText)) {
    meta.water_source = 'Borewell';
  }
  if (/\b(3-phase|three\s*phase)\b/i.test(incomingText)) {
    meta.power_supply = '3-Phase Available';
  } else if (/\b(single\s*phase|240v)\b/i.test(incomingText)) {
    meta.power_supply = 'Single Phase';
  }
  if (/\b(camper|20\s*l|bottle|bottles)\b/i.test(incomingText)) {
    meta.containers = '20L Campers';
  }
  if (botWasAskingTdsOrApp || tdsMatch || meta.water_source || meta.power_supply || meta.containers || /camper\s*water\s*supply|water\s*supply/i.test(incomingText)) {
    meta.tds_or_app = incomingText.slice(0, 100);
  }

  // Helper for Database Sync & Notification Dispatch
  const syncLeadState = async (leadFields = {}, isQualified = false, inquiryType = 'SALES', subject = null, specialNote = null) => {
    try {
      const isTestPhone = cleanPhone.startsWith('9198765') || cleanPhone.startsWith('9199990') ||
        cleanPhone.startsWith('155501') || cleanPhone.startsWith('9191111') ||
        cleanPhone.startsWith('9192222') || cleanPhone.startsWith('9193333') ||
        cleanPhone.startsWith('9194444') || cleanPhone.startsWith('9195555') ||
        cleanPhone.startsWith('9199999');

      const effectiveCity = (city && city !== 'Punjab') ? city : (leadFields.city && leadFields.city !== 'Punjab' ? leadFields.city : (isQualified ? (city || 'Punjab') : null));
      const dbPayload = {
        tenant_id: tenantId,
        phone: cleanPhone,
        name: clientName || leadFields.name || 'Lead',
        requirement: leadFields.requirement || (category ? `${category} ${capacity ? `(${capacity})` : ''}`.trim() : 'Commercial Setup'),
        city: effectiveCity,
        status: isQualified ? 'QUALIFIED' : (leadFields.status || 'NEW'),
        bot_active: !isTestPhone,
        is_deleted: isTestPhone ? true : false,
        metadata: { ...meta, ...(leadFields.metadata || {}) }
      };

      const existing = await db.get('crm_leads', `tenant_id=eq.${tenantId}&phone=eq.${cleanPhone}`);
      if (existing && existing.length > 0) {
        await db.update('crm_leads', dbPayload, `tenant_id=eq.${tenantId}&phone=eq.${cleanPhone}`);
      } else {
        await db.insert('crm_leads', dbPayload);
      }

      if (isQualified || inquiryType !== 'SALES') {
        const leadData = {
          name: clientName || leadFields.name || 'Qualified Lead',
          phone: cleanPhone,
          requirement: dbPayload.requirement,
          city: city || 'Punjab',
          water_source: meta.water_source || null,
          water_tds: meta.water_tds || null,
          power_supply: meta.power_supply || null,
          containers: meta.containers || null,
          special_note: specialNote || meta.special_note || (isQualified ? 'Commercial requirements confirmed.' : 'Inquiry registered.'),
          last_message: incomingText,
          subject: subject || null,
          inquiry_type: inquiryType,
          timestamp: new Date().toISOString()
        };
        saveLeadToDisk(leadData);
        await dispatchLeadNotification(leadData);
      }
    } catch (err) {
      console.warn('[Sync Lead State Error]:', err.message);
    }
  };

  // 4. HIGH PRIORITY SUPPORT & OPERATIONAL ROUTING
  // Service Thread Follow-up Guard (Anti-Spam / Anti-Duplicate)
  const isExistingServiceThread = Boolean(meta.complaint_alert_dispatched || meta.repair_alert_dispatched || meta.status === 'COMPLAINT' || meta.status === 'REPAIR');
  if (isExistingServiceThread && /(?:technician|kab\s*tak|call|phone|jaldi|kado|status|update|koi\s*aaya\s*nahi|uthaya)/i.test(incomingText)) {
    const serviceFollowReply = "Haanji veer ji, Gurjant Singh ji (+91 94635 83277) te Karan Singh ji (+91 99157 30338) nu tuhada message share kar ditta a, oh jald update kar rahe ne ji.";
    const bubbles = formatHumanSplit(serviceFollowReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // A. Customer Complaint
  const isComplaint = /(?:complaint|kharaab|kharab|problem|dikkat|leak|trip|fault|compressor\s*trip|cooling\s*nahi|paani\s*nahi\s*aaraha)/i.test(incomingText) &&
    !/(?:membrane\s*leak|seal\s*leak|pump\s*leak)/i.test(incomingText) &&
    !/(?:6\s*mahine|kharab\s*ho\s*jandi)/i.test(incomingText);

  if (isComplaint) {
    if (!meta.complaint_alert_dispatched) {
      meta.complaint_alert_dispatched = true;
      meta.repair_alert_dispatched = true;
      meta.status = 'COMPLAINT';
      memory.setLeadClosed(cleanPhone, false, meta, tenantId);
      await syncLeadState({ status: 'COMPLAINT' }, false, 'COMPLAINT', 'Customer Complaint', 'Customer reported an urgent machine breakdown.');
    }
    const compReply = "Haanji veer ji, tension na lo. [[SPLIT]] Gurjant Singh ji (+91 94635 83277) ya Karan Singh ji (+91 99157 30338) nu complaint note karwa dinde a, technician jald call kar ke service check karuga ji.";
    const bubbles = formatHumanSplit(compReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // B. Repair & Maintenance Request
  const isRepair = /(?:repair|mistri|seal\s*leak|membrane\s*leak|membrane\s*change|pump\s*seal|service\s*repair|technician\s*bhej)/i.test(incomingText);
  if (isRepair) {
    if (!meta.repair_alert_dispatched) {
      meta.repair_alert_dispatched = true;
      meta.complaint_alert_dispatched = true;
      meta.status = 'REPAIR';
      memory.setLeadClosed(cleanPhone, false, meta, tenantId);
      await syncLeadState({ status: 'REPAIR' }, false, 'REPAIR', 'Service / Repair', 'Customer requested technician repair for machine leak / service.');
    }
    const repReply = "Theek a veer ji, repair te service request note kar layi a. [[SPLIT]] Senior Technician Gurjant Singh ji (+91 94635 83277) ya Karan Singh ji (+91 99157 30338) rabta kar ke service schedule karange ji.";
    const bubbles = formatHumanSplit(repReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // C. Dealership / Distributorship Inquiry
  const isDealership = /(?:dealership|distributorship|distributor|franchise)/i.test(incomingText);
  if (isDealership) {
    if (!meta.general_alert_dispatched) {
      meta.general_alert_dispatched = true;
      meta.status = 'GENERAL';
      memory.setLeadClosed(cleanPhone, false, meta, tenantId);
      await syncLeadState({ status: 'GENERAL' }, false, 'GENERAL', 'Dealership / Franchise Inquiry', 'Customer inquired about CP System dealership / distributorship.');
    }
    const dealerReply = "Haanji veer ji, dealership te distributorship baare poori policy te details layi Karan Singh ji (+91 99157 30338) naal gal karwa dinde a, tussi apna area te contact detail share kar do ji.";
    const bubbles = formatHumanSplit(dealerReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // D. Job Application
  const isJob = /(?:job\s*vacancy|vacancy|naukri|iti\s*refrigeration|assembly\s*ki\s*koi\s*job|job\s*chahidi)/i.test(incomingText);
  if (isJob) {
    if (!meta.general_alert_dispatched) {
      meta.general_alert_dispatched = true;
      meta.status = 'GENERAL';
      memory.setLeadClosed(cleanPhone, false, meta, tenantId);
      await syncLeadState({ status: 'GENERAL' }, false, 'GENERAL', 'Job Application', 'Candidate applied for technician / assembly job.');
    }
    const jobReply = "Haanji veer ji, Muktsar factory vich technical te assembly staff layi CV WhatsApp te share kar do. [[SPLIT]] Karan Singh ji (+91 99157 30338) check kar ke call karange ji.";
    const bubbles = formatHumanSplit(jobReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // E. Billing / Tax Invoice / Bilti Query
  const isBilling = /(?:gst\s*(?:tax\s*)?invoice|transport\s*bilti|bilti\s*bill|tax\s*invoice|dispatch\s*hua\s*tha.*bill)/i.test(incomingText);
  if (isBilling) {
    if (!meta.general_alert_dispatched) {
      meta.general_alert_dispatched = true;
      meta.status = 'GENERAL';
      memory.setLeadClosed(cleanPhone, false, meta, tenantId);
      await syncLeadState({ status: 'GENERAL' }, false, 'GENERAL', 'Billing Query', 'Customer requested GST invoice and transport bilti bill.');
    }
    const billReply = "Haanji veer ji, invoice te transport bilti dispatch record check karke Karan Singh ji (+91 99157 30338) WhatsApp te share kar dinde ne ji.";
    const bubbles = formatHumanSplit(billReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // 5. CONSULTATIVE SALES FAST-PATH (Charan Sir Audio Blueprint)
  // Pure Greeting
  if (isPureGreeting) {
    return 'Haanji veer ji, dasso';
  }

  // Domestic / Home RO Guard
  const isDomestic = /(?:ghar|gharelu|home|domestic|kitchen|personal|makan)/i.test(incomingText);
  if (isDomestic && /(?:ro|plant|water|purifier)/i.test(incomingText)) {
    return 'Veer ji gharelu (home) RO nahi karde, commercial plants (50 LPH to upar) hi banaunde a ji.';
  }

  // Booking / Sai Pauna / Finalize Order
  const isSaiPauna = /(?:sai\s*pauni|sai\s*pa|booking\s*final|deal\s*done|jagah\s*tayar|advance\s*pauni|booking\s*karo)/i.test(incomingText);
  if (isSaiPauna) {
    if (!meta.was_qualified) {
      meta.was_qualified = true;
      meta.status = 'QUALIFIED';
      memory.setLeadClosed(cleanPhone, true, meta, tenantId);
      await syncLeadState({ status: 'QUALIFIED' }, true, 'SALES', 'Ready to Lock Order (Sai Pauna)', 'Customer ready to finalize booking advance (sai).');
    }
    const saiReply = "Bilkul theek a veer ji! Setup final karn layi thodi sai (booking advance) paani hundi a, baki samaan site te dispatch ho jauga. [[SPLIT]] Karan Singh ji (+91 99157 30338) official invoice te account detail abhi share kar dinde ne ji.";
    const bubbles = formatHumanSplit(saiReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Loan / EMI / PMEGP Scheme (Verbatim Charan Sir)
  const isLoanOrEmi = /(?:emi|loan|kisht|kishtan|budget|paise\s*ghat|finance|pmegp|subsidy)/i.test(incomingText);
  if (isLoanOrEmi && !botWasAskingLoan) {
    const loanReply = "Haanji veer ji, PMEGP sarkari subsidy loan scheme raahi 10 lakh tak da loan ho janda a, jis vich 25% subsidy (2.5 lakh) maaf hundi a ji. [[SPLIT]] Loan tussi apne naam te karwana a ya family ch kise de naam te ji?";
    const bubbles = formatHumanSplit(loanReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Competitor Cheaper Price Objection (Verbatim Charan Sir)
  const isCompetitorSasta = /(?:sasta|cheaper|ludhiana.*(?:sasta|company)|20%\s*sasta|ghat\s*rate|kam\s*rate|discount)/i.test(incomingText);
  if (isCompetitorSasta) {
    const compReply = "Veer ji, saste setup vich halka material te duplicate membrane hundi a jo 6 mahine ch kharab ho jandi a. [[SPLIT]] CP System heavy SS 304 frame, branded pump te guarantee dinda a taan jo plant saalan saal bina dikkat chale.";
    const bubbles = formatHumanSplit(compReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Photo / Video Request
  const isExplicitMediaRequest = /(?:photo|video|pic|pics|image|tasveer|dikhao|bhejo|vej\s*de|kive\s*dikhda)/i.test(incomingText);
  if (isExplicitMediaRequest) {
    let mediaReply = "";
    if (/chiller|chillar/i.test(incomingText) || /chiller/i.test(category)) {
      mediaReply = "Water chiller di photo te working video dekh lo veer ji: [[SPLIT]] 📸 Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1757073586_20250905_165838_0004.png \n🎥 Video: https://www.youtube.com/watch?v=NmKCLdSlzP0 [[SPLIT]] Eh setup kado tak lagwauna plan kar rahe ho ji?";
    } else {
      mediaReply = "Commercial RO plant di photo te working video dekh lo veer ji: [[SPLIT]] 📸 Photo: https://www.cpsystem.in/cps/admin/public/assets/img/product/1756990530_3_20250903_175347_0002.png \n🎥 Video: https://www.youtube.com/watch?v=ssW53Nbj1_c [[SPLIT]] Eh setup kado tak lagwauna plan kar rahe ho ji?";
    }
    const bubbles = formatHumanSplit(mediaReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Camper Models Intent Guard
  const isCamperModels = /(?:kede|keda|kehde|kehda|kehre|which|what)\s*(?:kede|kehde)?\s*(?:camper|campers|models|types)/i.test(incomingText) || /camper\s*(?:options|models|types|list|setup)/i.test(incomingText);
  if (isCamperModels) {
    const camperReply = "Camper business layi mostly 1000 LPH te 2000 LPH commercial RO plants lagde ne ji. [[SPLIT]] Naal heavy SS storage tank te automatic chilling system hunda a, 20L cans easily pack hunde ne.";
    const bubbles = formatHumanSplit(camperReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Village Camper Setup Cost Query (Verbatim Charan Sir: ₹3,70,000 Setup)
  const isPindCostQuery = (/(?:camper\s*plant|camper|pind).*(?:kharcha|rate|price|cost|kinna|kitna)/i.test(incomingText) || /(?:kharcha|rate|price|cost|kinna|kitna).*(?:camper|pind)/i.test(incomingText)) && !/chiller/i.test(incomingText);
  if (isPindCostQuery) {
    let pindReply = "";
    if (city) {
      pindReply = `Veer ji pind ch 1000 LPH camper plant (RO + SS Tank + Chiller) da poora setup lagbhag 3,70,000 da painda a ji. [[SPLIT]] Paani da TDS kinna a ji, ya camper water supply layi setup karna a?`;
    } else {
      pindReply = `Veer ji pind ch 1000 LPH camper plant (RO + SS Tank + Chiller) da poora setup lagbhag 3,70,000 da painda a ji. [[SPLIT]] Eh setup tussi kehde pind ya shehar ch lagwana a ji?`;
    }
    await syncLeadState({ city: city || 'Pind', requirement: 'RO (1000 LPH Camper Setup)' });
    const bubbles = formatHumanSplit(pindReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // Chiller Specific Tonnage Pricing (Quote rate AND ask location, NEVER cut chat)
  const incomingMentionsChiller = /\b(?:chiller|chillar)\b/i.test(incomingText);
  const isPriceQuery = /(?:price|rate|cost|quotation|quote|kharcha|budget|rupaye|rupees|rs\.?|inr|mull|bhaav|kinne|kinney|kine|kiney|kitne|kitna|kinna|kina|kinni|kini)/i.test(incomingText);

  if ((incomingMentionsChiller || /chiller/i.test(category)) && (isPriceQuery || tonnageMatch)) {
    let chillRate = null;
    if (/\b1(?:\.0)?\s*(?:ton|tr)\b/i.test(incomingText) && !/1\.5/i.test(incomingText)) chillRate = "1 Ton online chiller ₹60,000 + 18% GST a ji (Total ₹70,800).";
    else if (/\b1\.5\s*(?:ton|tr)\b/i.test(incomingText)) chillRate = "1.5 Ton online chiller ₹70,000 + 18% GST a ji (Total ₹82,600).";
    else if (/\b2(?:\.0)?\s*(?:ton|tr)\b/i.test(incomingText) && !/2\.5/i.test(incomingText)) chillRate = "2 Ton online chiller ₹80,000 + 18% GST a ji (Total ₹94,400).";
    else if (/\b2\.5\s*(?:ton|tr)\b/i.test(incomingText)) chillRate = "2.5 Ton online chiller ₹95,000 + 18% GST a ji (Total ₹1,12,100).";
    else if (/\b3(?:\.5)?\s*(?:ton|tr)\b/i.test(incomingText)) chillRate = "3.5 Ton circulation chiller ₹1,35,000 + 18% GST a ji (Total ₹1,59,300).";
    else if (/\b5(?:\.0|\.5)?\s*(?:ton|tr)\b/i.test(incomingText)) chillRate = "5 Ton water chiller ₹2,45,000 + 18% GST a ji (Total ₹2,89,100).";

    if (chillRate) {
      let chillFollowup = (city && city !== 'Punjab') ? "Eh setup dairy milk cooling layi dekh rahe ho ya factory machine layi ji?" : "Eh setup tussi kehde shehar ya pind ch lagwana a ji?";
      await syncLeadState({ category: 'Chiller', capacity: capacity || 'Chiller' });
      const bubbles = formatHumanSplit(`${chillRate} [[SPLIT]] ${chillFollowup}`);
      return bubbles.join(' [[SPLIT]] ');
    } else if (!tonnageMatch && !capacity) {
      const chillGeneral = "Chiller da rate capacity te cooling requirement te depend karda a veer ji. [[SPLIT]] Tussi kinne ton ya daily kinne litre doodh cooling layi setup dekh rahe ho ji?";
      await syncLeadState({ category: 'Chiller' });
      const bubbles = formatHumanSplit(chillGeneral);
      return bubbles.join(' [[SPLIT]] ');
    }
  }

  // Chiller Inquiries without Price (only if capacity is NOT known yet)
  if (incomingMentionsChiller && !isPriceQuery && !tonnageMatch && !cityMatch && !capacity) {
    const chillGeneral = "Haanji veer ji, kinne ton da chiller dekh rahe ho ya dairy / machine cooling layi?";
    await syncLeadState({ category: 'Chiller' });
    const bubbles = formatHumanSplit(chillGeneral);
    return bubbles.join(' [[SPLIT]] ');
  }

  // 6. SEQUENTIAL LEAD QUALIFICATION STATE MACHINE
  // A. Check if Lead is Ready for Qualification (All criteria met)
  const hasSiteVisitOrFinalize = /(?:site\s*visit|schedule|visit\s*karo|finalize|deal\s*done|quotation\s*share|quotation\s*bhejo)/i.test(incomingText);
  const isFullyQualifiedNow = Boolean(
    (clientName && city && (capacity || category)) ||
    (clientName && city && (meta.water_tds || meta.water_source || meta.containers || hasSiteVisitOrFinalize)) ||
    (hasSiteVisitOrFinalize && city && (capacity || category))
  );

  if (isFullyQualifiedNow && !meta.was_qualified && !isExistingServiceThread) {
    meta.was_qualified = true;
    meta.status = 'QUALIFIED';
    memory.setLeadClosed(cleanPhone, true, meta, tenantId);
    await syncLeadState({ status: 'QUALIFIED' }, true, 'SALES', 'Qualified Lead (Multi-Turn Complete)', 'Commercial requirements confirmed via sequential funnel.');

    const nameSalutation = clientName ? `${clientName} veer ji` : 'veer ji';
    const qualReply = `Dhanwad ${nameSalutation}! Tuhadi poori detail note kar layi a. [[SPLIT]] Support Coordinator Karan Singh ji (+91 99157 30338) official quotation naal jald rabta karange ji.`;
    const bubbles = formatHumanSplit(qualReply);
    return bubbles.join(' [[SPLIT]] ');
  }

  // B. If Customer Just Answered TDS / Water Source / Application / Site Visit / Milk Cooling
  const customerProvidedTechnicalDetails = Boolean(
    tdsMatch || meta.water_source || meta.containers || meta.milk_volume ||
    /camper\s*water\s*supply|water\s*supply|canal|nehar|borewell|doodh|dudh|milk|single\s*phase|3-phase|three\s*phase/i.test(incomingText)
  );
  if (customerProvidedTechnicalDetails) {
    if (!clientName) {
      const askNameReply = "Zaroor bhaji, tussi apna shubh naam dass do ji, official quotation WhatsApp te share karwa dinde a.";
      await syncLeadState({ status: 'IN_PROGRESS' });
      return askNameReply;
    }
  }

  // C. If Customer Just Answered Location (City / Pind)
  const customerProvidedLocation = Boolean(cityMatch || (botWasAskingLocation && city && city !== 'Punjab'));
  if (customerProvidedLocation) {
    await syncLeadState({ city: city, status: 'IN_PROGRESS' });
    let techAsk = "";
    if (category === 'Chiller') {
      techAsk = "Theek a veer ji. Daily kinne litre doodh cooling layi a ji, te bijli connection single phase a ya three phase?";
    } else {
      techAsk = "Theek a veer ji. Paani da TDS kinna a ji, ya camper water supply layi setup karna a?";
    }
    return techAsk;
  }

  // D. If Customer Just Answered Capacity (e.g. "1000", "1000 LPH", "500 LPH", "2000")
  const customerProvidedCapacity = Boolean(lphMatch || (botWasAskingCapacity && capacity));
  if (customerProvidedCapacity) {
    await syncLeadState({ capacity: capacity, category: 'RO', status: 'IN_PROGRESS' });
    const hasKnownLocation = Boolean(city && city !== 'Punjab');
    if (!hasKnownLocation) {
      const capLocReply = `${capacity || '1000 LPH'} commercial plant bilkul mil jauga veer ji. [[SPLIT]] Eh setup tussi kehde pind ya shehar ch lagwana a ji?`;
      const bubbles = formatHumanSplit(capLocReply);
      return bubbles.join(' [[SPLIT]] ');
    } else {
      const techAsk = "Theek a veer ji. Paani da TDS kinna a ji, ya camper water supply layi setup karna a?";
      return techAsk;
    }
  }

  // E. Broad RO inquiry without capacity
  const isDirectRoMention = /\b(?:ro|r\.o\.?)\b/i.test(incomingText);
  if (isDirectRoMention && !lphMatch && !capacity) {
    const askLphReply = "Haanji veer ji, kinne LPH da plant chahida a?";
    await syncLeadState({ category: 'RO', status: 'IN_PROGRESS' });
    return askLphReply;
  }

  // F. Mentioned Ad or YouTube
  if (/(?:youtube|video|ad|advertisement|fb|meta)\b/i.test(incomingText)) {
    const adReply = "Haanji veer ji, keda plant ya setup dekh rahe ho ji?";
    return adReply;
  }

  // 7. BUILD CLEAN CONVERSATION TURNS FOR LLM FALLBACK
  const contents = [];
  const recentMessages = priorHistory.slice(-4);

  for (const m of recentMessages) {
    const isCustomer = m.direction ? m.direction === 'INBOUND' : m.role === 'user';
    const role = isCustomer ? 'user' : 'model';
    let text = (m.content || '').trim();
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

  let customerTurnText = incomingText;
  if (priorHistory.length === 0 && (clientName || city)) {
    const contextPrefix = `[Known Customer: ${clientName || 'Bhaji'}${city ? ', City: ' + city : ''}]`;
    customerTurnText = `${contextPrefix}\n${incomingText}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: customerTurnText }]
  });

  // 8. GENERATE RESPONSE WITH ULTRA-FAST GROQ PRIMARY, GEMINI/MISTRAL FALLBACK
  let rawReply = await callGroqFallback(CP_SYSTEM_PROMPT, contents, 200);

  const validGeminiKeys = (config.GEMINI_API_KEYS || []).filter(k => k && (k.startsWith('AIzaSy') || k.startsWith('AQ.')));
  if ((!rawReply || !rawReply.trim()) && validGeminiKeys.length > 0) {
    console.log(`⚡ [Groq Exhausted] Attempting Gemini fallback for ${cleanPhone}...`);
    rawReply = await callGemini(CP_SYSTEM_PROMPT, contents, 180);
  }

  if (!rawReply || !rawReply.trim()) {
    console.log(`⚡ [LLM Exhausted] Attempting Mistral AI fallback for ${cleanPhone}...`);
    rawReply = await callMistralFallback(CP_SYSTEM_PROMPT, contents, 180);
  }

  if (!rawReply || !rawReply.trim()) {
    rawReply = `Haanji veer ji, dasso keda setup dekh rahe ho?`;
  }

  // 9. PARSE [[LEAD_UPDATE: ...]] METADATA
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
    cleanReply = cleanReply.replace(/^[,.!?\s🙏]+/, '').trim();
  }

  // Safety guard: if customer asked for 5 Ton (and not 5.5 Ton), mirror strictly as 5 Ton
  if (/(?<![\d.])5\s*(?:ton|tr)\b/i.test(incomingText) && !/5\.5/i.test(incomingText)) {
    cleanReply = cleanReply.replace(/(?<![\d.])5\.5\s*(?:ton|tr)\b/gi, '5 Ton');
  }

  // 100% Ban on religious and formal greetings & fold hands emoji
  cleanReply = cleanReply
    .replace(/\b(?:sat\s*sri\s*akal|ssakal|sasrikaal|sasrikal)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/\b(?:namaste|namaskar|ram\s*ram|radhe\s*radhe|pranam)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/\b(?:good\s*morning|good\s*evening|good\s*afternoon)\s*(?:ji)?\s*[!.,]?\s*/gi, '')
    .replace(/🙏/g, '')
    .trim();

  // Strip robotic 3rd-person corporate branding
  cleanReply = cleanReply
    .replace(/\bCP\s*System\s*(?:ch|kol|de\s*kol|vich)\b/gi, 'apne kol')
    .replace(/\bCP\s*System\s*(?:mein|ke\s*paas)\b/gi, 'apne paas')
    .replace(/\bCP\s*System\s+commercial\b/gi, 'commercial')
    .replace(/\bCP\s*System\s+banaunda\b/gi, 'asi banaunde')
    .replace(/\bCP\s*System\b/gi, 'asi');

  // Strip Financial Hype / Marketing Nonsense across all responses
  cleanReply = cleanReply
    .replace(/[^.!?\n]*(?:profit\s*margin|kamai|munafa)[^.!?\n]*[.!?]?/gi, '')
    .replace(/(?:,|\.|\?|!)*\s*(?:dekh\s*liya\s*(?:ji)?|aur\s*dikhane\s*chahte\s*ho\??|tussi\s*ki\s*sochde\s*ho\??|kuch\s*hor\s*puchna\s*hai\??)[\s.?!]*$/gi, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Strip accidental leading greeting if customer did not greet
  if (!isPureGreeting) {
    cleanReply = cleanReply.replace(/^(?:hello!?|hi!?)\s*/i, '').trim();
  }

  cleanReply = cleanReply.replace(/^[,.!?\s]+/, '').trim();
  cleanReply = ensureSentenceComplete(cleanReply);

  // Anti-Degeneracy Quality Gate
  const isGruntReply = /^(ha|haan|haanji|ji|ok|theek\s*hai|hmm|acha|got\s*it|hlo|hi|yes|no)[\s.!?]*$/i.test(cleanReply.trim());
  if (cleanReply.length < 12 || isGruntReply) {
    if (isPureGreeting) {
      cleanReply = "Haanji veer ji, dasso";
    } else if (/(?:kede|kehde)\s*camper/i.test(incomingText)) {
      cleanReply = "Camper business layi mostly 1000 LPH te 2000 LPH commercial RO plants lagde ne ji. [[SPLIT]] Naal heavy SS storage tank te automatic chilling system hunda a, 20L cans easily pack hunde ne.";
    } else if (/chiller|chillar/i.test(incomingText) || /chiller/i.test(category)) {
      cleanReply = "Haanji veer ji, apne kol online chillers (1 to 2.5 Ton) te heavy circulation chillers (3.5 Ton to upar) available ne.";
    } else if (/ro|plant/i.test(incomingText) || /ro/i.test(category)) {
      cleanReply = "Haanji veer ji, kinne LPH da plant chahida a?";
    } else {
      cleanReply = "Haanji veer ji, dasso keda setup dekh rahe ho?";
    }
  }

  // Apply LLM extracted metadata if any
  if (leadUpdate) {
    const isInvalidExtractedName = (nm) => {
      if (!nm || typeof nm !== 'string') return true;
      const clean = nm.trim();
      if (clean.length < 2 || clean.length > 30 || /^\d+$/.test(clean)) return true;
      return religiousOrGenericRegex.test(clean);
    };

    if (leadUpdate.name && !isInvalidExtractedName(leadUpdate.name)) {
      clientName = leadUpdate.name.trim();
      meta.name = clientName;
    }
    if (leadUpdate.city && leadUpdate.city !== 'null' && leadUpdate.city.length >= 3) {
      city = leadUpdate.city;
      meta.city = city;
    }
    if (leadUpdate.category && leadUpdate.category !== 'null') {
      category = leadUpdate.category;
      meta.category = category;
    }
    if (leadUpdate.capacity && leadUpdate.capacity !== 'null') {
      capacity = leadUpdate.capacity;
      meta.capacity = capacity;
    }

    const wasQualifiedBefore = existingLead?.status === 'QUALIFIED' || meta.was_qualified === true;
    const hasSufficientData = Boolean(city && (category || capacity));
    const isExplicitlyQualified = (leadUpdate.status === 'QUALIFIED' || leadUpdate.intent === 'QUALIFIED');
    const isActionableQualified = hasSufficientData && (
      isExplicitlyQualified ||
      /(?:site\s*visit|visit\s*schedule|finalize|deal\s*done|quotation\s*bhej|order\s*karna|visit\s*karo|quotation\s*send)/i.test(incomingText)
    );

    if (isActionableQualified && !wasQualifiedBefore) {
      meta.was_qualified = true;
      meta.status = 'QUALIFIED';
      memory.setLeadClosed(cleanPhone, true, meta, tenantId);
      await syncLeadState({ status: 'QUALIFIED' }, true, 'SALES', 'Qualified Lead (LLM Update)', 'Commercial requirements confirmed.');
    } else {
      await syncLeadState({ status: 'IN_PROGRESS' });
    }
  }

  // 10. HUMAN SALESMAN MULTI-MESSAGE SPLITTER
  const splitMessages = formatHumanSplit(cleanReply);
  return splitMessages.join(' [[SPLIT]] ');
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
    const naturalSalutation = name ? `Haanji ${name} veer ji,` : 'Haanji veer ji,';
    if (isUtility) {
      return `${naturalSalutation} Chiller setup baare koi update? Quotation ya detail chahidi hove taan dasso ji.`;
    } else {
      return `${naturalSalutation} Project setup baare koi detail chahidi hove taan dasso ji, Karan Singh ji (+91 99157 30338) naal gal karwa dinde a.`;
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
