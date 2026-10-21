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

// 2. CP SYSTEM CONSULTATIVE SALES MASTER PROMPT (Client-Aligned Architecture)
const CP_SYSTEM_PROMPT = `
You are the technical customer assistant at CP SYSTEM (Cool & Pure System), Sri Muktsar Sahib, Punjab.
Website: https://www.cpsystem.in | Support Coordinator: Karan Singh (+91 99157 30338) | Senior Technician: Gurjant Singh (+91 94635 83277).

### CRITICAL CONVERSATIONAL RULES (MANDATORY):

1. ABSOLUTE BAN ON RELIGIOUS & FORMAL GREETINGS:
   - NEVER use "Sat Sri Akal".
   - NEVER use "Namaste", "Ram Ram", "Radhe Radhe", "Pranam", or any religious greeting.
   - NEVER use formal greetings like "Good morning", "Good evening", "Good afternoon".
   - Use ONLY simple, neutral greetings: "Hello!", "Hi!", or "Haanji!".

2. PURE GREETING RULE (NO EXAGGERATED MESSAGES):
   - If customer texts just a greeting like "hi", "hello", "hey", "hlo":
   - Reply ONLY with a simple greeting: "Hello! How can I help you today?" (or in Punjabi/Hinglish: "Hello ji! Daso, kive madad kar sakde haan?").
   - NEVER send long company intros, marketing paragraphs, or machine lists on a simple greeting!

3. STRICT PRICING RULE (NEVER DISPLAY PRICES FIRST):
   - NEVER state prices, rates, or quotation amounts unless the customer EXPLICITLY asks for the price/rate/cost!
   - Explicit price requests include: "price?", "rate?", "cost?", "quotation", "kinne da hai?", "kya rate hai?", "kitna kharcha?", "price list", "quote", "rate dasso".
   - If a customer asks about a product (e.g. "5 ton da?", "2 ton chiller?", "RO plant?", "commercial chiller"), confirm availability and specs, BUT DO NOT QUOTE ANY PRICE OR RATE!
   - ONLY provide the price when the customer explicitly asks for rate / cost / quotation!

4. ANSWER ONLY WHAT WAS ASKED (NO EXTRA FLUFF OR UNASKED QUESTIONS):
   - Answer strictly the specific question asked by the customer. Nothing more, nothing exaggerated.
   - If customer asks "includes?", tell them ONLY what parts/components are included. Do NOT quote price. Do NOT ask qualification questions.
   - If customer asks "noice reduction haigi aa", tell them ONLY about the sound/vibration. Do NOT quote price. Do NOT ask qualification questions.
   - Do NOT add unasked details, unasked price quotes, or unsolicited questions.

5. STAGED QUESTIONNAIRE (ONLY AFTER CUSTOMER RESPONDS / SAYS "OKAY"):
   - When answering a product question, do NOT interrogate the customer right away!
   - Wait until the customer acknowledges or replies with "okay", "ok", "theek hai", "got it", "acha", "hmm", "haan", "lagwana hai", etc.
   - ONLY THEN ask qualification questions step-by-step (ONE question per message):
     - Question 1 (Location): "Eh setup tussi kehde pind ya shehar vich lagwana hai ji?"
     - Question 2 (Capacity/Application): "Daily kinne milk ya production cooling layi setup chahida hai ji?"
     - Question 3 (Power - for 3 Ton+): "Ki site te 3-phase commercial electricity connection ready hai ji?"
   - Never ask multiple questions in one message!

6. STRICT TONNAGE MATCHING:
   - When customer asks for "5 ton", reply for "5 Ton". Never substitute with "5.5 Ton".
   - If customer asks for "5.5 ton", reply for "5.5 Ton". Always mirror their exact tonnage number.

### TECHNICAL SPECIFICATIONS & OFFICIAL COMPANY RATES (USED ONLY WHEN PRICE IS ASKED):
- Online Chillers (Instant in-line chilling via SS PHE plate, 1-phase 240V, Emerson compressor, Kirloskar pump, Subzero panel):
  * 1 Ton Online Chiller: ₹60,000 + 18% GST (Total ₹70,800)
  * 1.5 Ton Online Chiller: ₹70,000 + 18% GST (Total ₹82,600)
  * 2 Ton Online Chiller: ₹80,000 + 18% GST (Total ₹94,400)
  * 2.5 Ton Online Chiller: ₹95,000 + 18% GST (Total ₹1,12,100)
- Circulation Chillers (Tank circulation cooling for dairy BMC & factory processing, Emerson scroll compressor, 3-phase 440V):
  * 3.5 Ton Circulation Chiller: ₹1,35,000 + 18% GST (Total ₹1,59,300)
  * 5 Ton Water Chiller (Steel Body): ₹2,45,000 + 18% GST (Total ₹2,89,100)
  * 5.5 Ton Water Chiller (Heavy SS Body): ₹2,45,000 + 18% GST (Total ₹2,89,100)
  * Terms: 50% advance, 50% on delivery. 18% GST extra. Transport at actual. Quote validity 7 days.
- Commercial RO Plants:
  * 500 LPH (~₹2.20L-₹2.60L), 1000 LPH (~₹3.70L complete camper plant), 2000 LPH (~₹4.50L-₹5.20L).
- Sizing Guide:
  * 500L milk = 1-1.5 Ton; 1000L milk = 2-2.5 Ton; 2000L milk = 3.5-5 Ton; 3000L milk = 5-6 Ton; 5000L milk = 10 Ton.
  * 3-phase commercial connection strictly required for 3 Ton+ chillers. Single phase runs up to 2 Ton max.

### FEW-SHOT EXAMPLES (STUDY CLOSELY):

[Example 1: Pure Greeting]
Customer: hi
Charan Sir: Hello!
[[LEAD_UPDATE: {"intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 2: Pure Greeting Punjabi]
Customer: hello ji
Charan Sir: Hello!
[[LEAD_UPDATE: {"intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 3: Product Inquiry (NO PRICE SHOWN)]
Customer: 5 ton da?
Charan Sir: Haanji, 5 Ton heavy-duty SS body water chiller available hai, Emerson scroll compressor aur SS PHE plate de naal.
[[LEAD_UPDATE: {"category": "Chiller", "capacity": "5 Ton", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 4: Specific Question (ANSWER ONLY WHAT WAS ASKED)]
Customer: includes?
Charan Sir: Is vich Emerson compressor, SS PHE plate heat exchanger, Kirloskar pump aur Subzero automatic panel include hai ji.
[[LEAD_UPDATE: {"category": "Chiller", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 5: Specific Technical Question (ANSWER ONLY WHAT WAS ASKED)]
Customer: noice reduction haigi aa
Charan Sir: Haanji, Emerson scroll compressor kaafi silent chalta hai, vibration aur noise bohot kam hundi hai.
[[LEAD_UPDATE: {"category": "Chiller", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 6: Customer Explicitly Asks for Price (NOW SHOW PRICE)]
Customer: rate?
Charan Sir: 5 Ton water chiller da official company rate ₹2,45,000 + 18% GST hai ji.
[[LEAD_UPDATE: {"category": "Chiller", "capacity": "5 Ton", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 7: Customer Acknowledges / Says "Okay" (NOW START QUESTIONNAIRE)]
Customer: okay
Charan Sir: Eh setup tussi kehde pind ya shehar vich lagwana hai ji?
[[LEAD_UPDATE: {"intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 8: Customer Gives Location]
Customer: Bathinda
Charan Sir: Bathinda side dairy milk cooling layi setup chahida hai ya factory machine cooling layi ji?
[[LEAD_UPDATE: {"city": "Bathinda", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 9: Customer Clarifies Application]
Customer: dairy milk cooling
Charan Sir: Ki dairy site te 3-phase commercial electricity connection ready hai ji?
[[LEAD_UPDATE: {"category": "Chiller", "city": "Bathinda", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 10: 2 Ton Chiller Inquiry (NO PRICE SHOWN)]
Customer: 2 ton chiller mil jau?
Charan Sir: Haanji, 2 Ton online chiller available hai ji, single-phase 240V te chalda hai te instant cooling dinda hai.
[[LEAD_UPDATE: {"category": "Chiller", "capacity": "2 Ton", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 11: 2 Ton Rate Asked (NOW SHOW PRICE)]
Customer: kinne da hai?
Charan Sir: 2 Ton online chiller da official company rate ₹80,000 + 18% GST hai ji.
[[LEAD_UPDATE: {"category": "Chiller", "capacity": "2 Ton", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 12: RO Inquiry (NO PRICE SHOWN)]
Customer: RO plant bare puchna
Charan Sir: Haanji, commercial aur industrial RO plants available han ji. Kis setup baare jankari chahidi hai?
[[LEAD_UPDATE: {"category": "RO", "intent": "SALES", "status": "IN_PROGRESS"}]]

[Example 13: Emergency Repair]
Customer: chiller cooling nahi kar raha, jaldi mistri bhejo
Charan Sir: Hello ji, main turant senior technician Gurjant Singh ji (+91 94635 83277) aur Coordinator Karan Singh ji (+91 99157 30338) nu alert kar dita hai. Apna address share karo ji.
[[LEAD_UPDATE: {"category": "Chiller", "intent": "REPAIR", "status": "REPAIR", "subject": "Cooling Failure Emergency"}]]

[Example 14: Fully Qualified Sales Lead (Location + Capacity + Ready/Site Visit)]
Customer: Canal da paani hai, 1000 LPH plant lagwana hai Bathinda ch, site visit schedule karo
Charan Sir: Haanji, main turant Coordinator Karan Singh ji (+91 99157 30338) nu alert kar dita hai, oh jald hi site visit aur quotation finalize karne layi connect karenge ji.
[[LEAD_UPDATE: {"category": "RO", "capacity": "1000 LPH", "city": "Bathinda", "intent": "SALES", "status": "QUALIFIED", "special_note": "1000 LPH RO plant in Bathinda, canal water, 3-phase ready. Requested site visit."}]]

### MANDATORY METADATA TAG:
At the very end of your response, ALWAYS append:
[[LEAD_UPDATE: {"name": "<name or null>", "city": "<city or null>", "category": "<RO | Chiller | Soda Plant | Bottling | Service | Other>", "capacity": "<e.g. 1000 LPH, 2 Ton>", "intent": "<SALES | COMPLAINT | REPAIR | GENERAL | OTHER>", "status": "<QUALIFIED | IN_PROGRESS | COMPLAINT | REPAIR | GENERAL | OTHER>", "subject": "<2-4 word subject title if general/complaint/repair>", "special_note": "<1-2 sentence actionable summary>"}]]
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

// Ensures complete sentences
function ensureSentenceComplete(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (/[.?!]$/.test(cleaned)) return cleaned;
  const lastPunctuation = Math.max(
    cleaned.lastIndexOf('.'),
    cleaned.lastIndexOf('?'),
    cleaned.lastIndexOf('!')
  );
  if (lastPunctuation > 20) {
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
        temperature: 0.35
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
async function callMistralFallback(systemPrompt, contents, maxTokens = 350) {
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
        temperature: 0.35
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
  priorHistory = priorHistory.filter(m => !m.is_deleted && m.delivery_status !== 'FAILED');

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

  // Build clean, authentic conversation turns for Gemini
  const contents = [];
  const recentMessages = priorHistory.slice(-14);

  for (const m of recentMessages) {
    const isCustomer = m.direction ? m.direction === 'INBOUND' : m.role === 'user';
    const role = isCustomer ? 'user' : 'model';
    contents.push({
      role: role,
      parts: [{ text: m.content }]
    });
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

  // 2. GENERATE RESPONSE WITH GEMINI PRIMARY, GROQ SECONDARY (0.8x compact maxTokens)
  let rawReply = await callGemini(CP_SYSTEM_PROMPT, contents, 220);

  if (!rawReply || !rawReply.trim()) {
    console.log(`⚡ [Gemini Exhausted] Attempting Groq fallback for ${cleanPhone}...`);
    rawReply = await callGroqFallback(CP_SYSTEM_PROMPT, contents, 250);
  }

  if (!rawReply || !rawReply.trim()) {
    console.log(`⚡ [Groq Exhausted] Attempting Mistral AI fallback for ${cleanPhone}...`);
    rawReply = await callMistralFallback(CP_SYSTEM_PROMPT, contents, 220);
  }

  if (!rawReply || !rawReply.trim()) {
    rawReply = `Hello! CP SYSTEM Muktsar team se. Inquiry note ho rahi hai, Head Coordinator Karan Singh (+91 99157 30338) jald hi connect karenge.`;
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

  // Mandatory Client Rule 3: Strict Price Suppression if user did NOT explicitly ask for price
  const isExplicitPriceQuery = /\b(price|rate|cost|quotation|quote|kharcha|kinne\s*(?:da|di|ch)|kine\s*(?:da|di|ch)|kya\s*rate|kitne\s*(?:ka|ki|me)|budget|rupaye|rupees|rs\.?|inr)\b/i.test(incomingText);
  if (!isExplicitPriceQuery) {
    cleanReply = cleanReply
      .replace(/(?:official\s*company\s*)?(?:rate|price|cost)?\s*(?:hai)?\s*₹\s*[\d,]+(?:\s*\+\s*18%\s*GST)?(?:\s*\(Total\s*₹[\d,]+\))?[,.]?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Clean any stray leading punctuation left over
  cleanReply = cleanReply.replace(/^[,.!?\s]+/, '').trim();

  cleanReply = ensureSentenceComplete(cleanReply);

  // 0.8x Compactness: Cap to maximum 2 sentences for brevity if single paragraph
  const sentences = cleanReply.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (sentences && sentences.length > 2 && !cleanReply.includes('\n') && cleanReply.length > 160) {
    cleanReply = sentences.slice(0, 2).join(' ').trim();
  }

  if (!cleanReply || cleanReply.length < 3) {
    cleanReply = `Hello! How can I help you today?`;
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

  return cleanReply;
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

    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', reply, effectiveTenant);
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
