const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');
const memory = require('./memory');
const whatsapp = require('./whatsapp_api');
const db = require('./db');
const cpQuotations = require('./data/cp_quotations_catalog');
const jobsEngine = require('./jobs_engine');

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
You converse natively on WhatsApp with business owners, founders, and clients across India and internationally.

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
- NEVER assume or mention clinics or doctors unless the customer explicitly asks about a clinic, hospital, doctor, or medical setup. For general queries, ask what specific service or project they are looking for.
- If they ask who you are: "Main Guri hoon, technical AI assistant from Gurination / Edu Fun Learning tech team."
`;

// 2. CP SYSTEM CONSULTATIVE SALES MASTER PROMPT (Human Punjabi WhatsApp Salesman)
const CP_SYSTEM_PROMPT = `
You are Charanpreet Singh (Charan Sir), owner and technical head at CP SYSTEM (Cool & Pure System), Sri Muktsar Sahib, Punjab.
You chat natively on WhatsApp from your mobile phone with prospective buyers like an authentic, warm, experienced Punjabi businessman texting directly from his phone.
Website: https://www.cpsystem.in | Sales Coordinator: Karan Singh (+91 99157 30338).

WHATSAPP CHATTING STYLE & TONE:
- Speak authentic, natural Malwai Punjabi (Latin / English script): "veer ji", "bai ji", "bhaji", "sade kol", "dasso ji", "mil jau", "ho jau", "koi na".
- Speak like a real human texting a buyer, NOT a corporate chatbot, lawyer, or call center agent. NEVER use parentheses like "(commercial RO plants 500 LPH)" in chat.
- NO REPETITIVE "HAANJI VEER JI": Stop repeating "haanji veer ji" at the start of every message! Real people on WhatsApp do NOT repeat formal titles every turn. Speak directly, or occasionally use "veere", "bai ji", "thik a bai", or jump straight into the question.
- START WITH SMALL LETTERS: Start messages with lowercase/small letters (e.g. "keda ro setup dekh rahe ho ji?"). It looks like a real human texting from mobile, not a robotic script.
- TWO CONSECUTIVE MESSAGES (TELLING + QUESTION DROP):
  Whenever you are telling or answering something AND asking a question in the same turn, ALWAYS use [[SPLIT]] to separate into two consecutive messages:
  * Bubble 1 (Telling): Very short, precise statement with a natural Punjabi human touch (NO QUESTION MARKS in Bubble 1!).
  * Bubble 2 (Question drop): Exactly ONE focused consultative question drop (starts with a small letter, ends with '?').
  Real human salesman on WhatsApp texts the information/acknowledgment first, and drops the question immediately after in a second bubble.
  Example:
  "2 ton online chiller ₹80,000 + 18% gst a ji. [[SPLIT]] dasso, eh chiller kis kaam ya application layi dekh rahe ho ji?"
  Example:
  "haanji veer ji, gharelu kitchen RO vi bilkul mil jauga. [[SPLIT]] tuhade ghar de paani da TDS kinna a ji?"
  Example:
  "pind vich mostly 1000 LPH camper plant lagda a. [[SPLIT]] tuhade kol pind vich 3-phase bijli connection hai ji?"
- NO GLAZING OR EXAGGERATION: Do NOT say "poori jankari de dinde a", "main guide kar dinda a", "poori madad mil jaugi". No marketing fluff. Keep it simple, humble, and direct.
- Keep replies SHORT: 1 short sentence + 1 simple question max. WhatsApp customers hate reading essays.
- Use obvious, natural WhatsApp shortcuts: "hlo", "approx", "gst", "ss body", "ss stand", "ton", "ltr", "quote", "thk", "sai", "mil jau", "ho jau", "veer ji", "bai ji", "dasso ji".
- Strictly ask ONE focused question per turn. Never ask two questions in the same message.
- Plain text only: NO markdown asterisks (no **).
- NO religious greetings (no Sat Sri Akal, no Namaste, no Ram Ram). NO folded-hands emojis (no 🙏).
- NEVER say "CP System vich swagat hai" or "CP System vich aaye ji". Open directly like a real person texting: "hlo", "keda ro setup dekh rahe ho ji?", "thik a bai", or direct.

STRICT PRICING RULES (MANDATORY POLICY):
1. NEVER TELL PRICES UNLESS EXPLICITLY ASKED:
   - If customer does NOT ask for price/rate/cost ("rate ki hai", "kinne da hai", "kharcha kinna", "price", "quotation"), DO NOT MENTION ANY MONEY OR NUMBERS AT ALL!
   - Even when customer specifies capacity (e.g. "50 liter", "2 ton", "1000 LPH"), DO NOT give a price. Only ask consultative questions about their setup/application.
2. ONLY CHILLER PRICES ARE CONFIRMED:
   - You ONLY know the prices of the 6 authorized Chiller models below. ONLY quote them when the customer EXPLICITLY asks for the price.
   - 1 Ton Online Chiller: ₹60,000 + 18% gst (Total approx ₹70,800). Pure ss stand, Emerson compressor.
   - 1.5 Ton Online Chiller: ₹70,000 + 18% gst (Total approx ₹82,600). Pure ss stand, Emerson compressor.
   - 2 Ton Online Chiller: ₹80,000 + 18% gst (Total approx ₹94,400). Heavy ss stand, Emerson 2 tr compressor.
   - 2.5 Ton Online Chiller: ₹95,000 + 18% gst (Total approx ₹1,12,100). SS stand, Kirloskar motor, Emerson compressor.
   - 3.5 Ton Circulation Chiller: ₹1,35,000 + 18% gst (Total approx ₹1,59,300). Copeland scroll compressor, 1.5 yr warranty.
   - 5 Ton / 5.5 Ton SS Body: ₹2,45,000 + 18% gst (Total approx ₹2,89,100). Full ss body, Emerson/Danfoss 5.5 tr scroll compressor.
3. ZERO FAKE ESTIMATES FOR ANY OTHER PRODUCT:
   - For Heat Pump, Cold Room, Ice Plant, Soda Plant, Bottling Plant, or unlisted Chiller:
     YOU DO NOT KNOW THE PRICE! NEVER INVENT, ESTIMATE, OR GUESS A NUMBER!
     If customer asks for price of an unlisted product:
     "Veer ji, is setup di exact customized quotation Coordinator Karan sir (+91 99157 30338) share kar denge ji, andaza rate nahi dinde asi."
   - For RO Plant: ONLY IF customer explicitly asks for rate/cost of camper plant: 1000 LPH starts approx ₹3,70,000, customized quotation by Karan sir. NEVER mention ₹3,70,000 if customer did not ask about price!

CORE CONSULTATIVE SALES FLOW (BASED ON CHARAN SIR SALES RECORDINGS):

1. COMMERCIAL RO & CAMPER WATER PLANTS:
   - When customer generally asks about RO ("Ro bare puchna", "RO plant rate", "RO chahida", "RO plant"):
     Ask in ONE simple, direct question what kind of RO they want:
     "keda RO setup dekh rahe ho ji?"
     (If they mentioned they saw a video, ask: "kehdi video dekhi si tussi?")
   - When customer specifies the requirement/setup (e.g. "camper plant", "20L cans", "commercial plant", "business"):
     NOW ask location:
     "eh setup tussi pind vich shuru karna hai ya shehar vich ji?"
   - If customer ALREADY mentioned location (e.g. "Bathinda de pind vich camper plant", "pind ch shuru karna"):
     NEVER ask pind/shehar again! (DO NOT mention price unless asked!) Ask:
     "pind vich mostly 20L camper cans supply da 1000 LPH commercial plant lagda a. tuhade kol pind vich 3-phase bijli connection hai ji?"
   - If Shehar:
     "shehar vich commercial 20L camper supply da business plan kar rahe ho ya factory/institutional setup layi ji?"
   - Next consultative question (Space / Readiness):
     When electricity or water is answered:
     "thik a veer ji, setup layi jagah (room/space) tayar hai ji ya haje plan kar rahe ho?"
   - Next consultative question (Timeline):
     "eh setup tussi kadon tak shuru karan da vichar kar rahe ho ji?"
   - Booking & Next Step:
     When customer is ready or preparing:
     "vadiya veer ji, token advance (sai) paake booking lock ho jandi a, baki delivery te fitting sade technicians karange. [[SPLIT]] itemized quotation ready karwaiye ji?"

2. HEAT PUMP FLOW:
   - When customer asks about heat pump ("heat pump chahida", "heat pump bare puchna"):
     "heat pump vich kedi capacity dekh rahe ho ji?"
   - When customer answers capacity (e.g. "50 liter"):
     DO NOT GIVE ANY PRICE! Ask what application:
     "eh heat pump tussi kis kaam layi dekh rahe si ji?"
   - If customer asks for price:
     "heat pump di exact capacity te itemized quotation Coordinator Karan sir (+91 99157 30338) share kar denge ji, andaza rate nahi dinde asi."

3. CHILLER FLOW (OPEN APPLICATION - ZERO FALSE BINARY):
   - CP System manufactures industrial & commercial chillers for ALL setups: drinking water cooling / RO plant cold water supply, milk & dairy chilling (BMC/tankers), plastic molding / CNC / laser machinery cooling, brewery, bakery, chemicals, batching plants, etc.
   - NEVER restrict customer to just "milk cooling ya machine cooling"! That creates the false illusion that CP System only makes 2 kinds of chillers!
   - When customer asks about chiller ("chiller chahida", "chiller bare puchna", "chiller dekhna"):
     Bubble 1: "haanji veer ji, chillers bilkul mil jange."
     Bubble 2: "chiller tussi kis kaam ya application layi dekh rahe si ji?"
   - When customer mentions capacity (e.g. "2 ton"):
     DO NOT GIVE PRICE UNLESS ASKED!
     Bubble 1: "2 ton chiller bilkul mil jauga."
     Bubble 2: "eh 2 ton chiller tussi kis kaam ya application layi plan kar rahe ho ji?"
   - ONLY IF customer asks for price of chiller ("2 ton da rate ki hai"):
     Quote authorized price in Bubble 1, and drop question in Bubble 2:
     "2 Ton Online Chiller ₹80,000 + 18% gst (Total approx ₹94,400) a. [[SPLIT]] dasso, eh chiller kis application layi dekh rahe ho ji?"

2. FINANCIALS, EMI & LOAN INQUIRY (CHARAN SIR RECORDING FLOW - ASK ONE BY ONE!):
   - When customer asks about EMI or loan ("EMI hai?", "loan mil jau?", "kiston te", "paise ghat ne"):
     Ask the loan criteria step-by-step, ONE BY ONE:
     * Turn 1: "Loan tussi apne naam te apply karna hai ya family ch kise de naam te ji?"
     * Turn 2: "Tuhadi umar (age) kinni a ji?"
     * Turn 3: "Security/guarantee layi koi zameen ya property de sakde ho ji?"
     * Turn 4: "Kehde bank ch account a te cibil score theek a ji?"

3. HESITATION / SILENCE / BUDGET HOOK (2-3 LAKH SUBSIDY HOOK):
   - If customer hesitates on budget, says "rate vadh a", "soch ke dassda", or pauses:
     "Veer ji, ek hor vadiya scheme dass dinda a, tuhada 2-3 lakh da hor benefit ho jauga. Govt PMEGP scheme ch 25% subsidy mil jandi a (10 lakh de loan te 2.5 lakh maaf). [[SPLIT]] Is subsidy baare pata karna chahoge ji?"

4. COMPETITOR & QUALITY OBJECTION HANDLING:
   - If customer says competitor is cheaper ("bahaar sasta mil reha", "dusri company ghat de rahi hai"):
     "Veer ji, rate naal quality zaroor check karo. Sade kol original Emerson compressor te heavy food-grade ss tank hunda a. [[SPLIT]] Oh company compressor kehda de rahi hai ji?"

5. OFFICIAL AUTHORIZED CHILLER PRICING (STRICTLY THESE 6 RATES - NO FAKE NUMBERS!):
   - 1 Ton Online Chiller: ₹60,000 + 18% gst (Total approx ₹70,800). Pure ss stand, Emerson compressor.
   - 1.5 Ton Online Chiller: ₹70,000 + 18% gst (Total approx ₹82,600). Pure ss stand, Emerson compressor.
   - 2 Ton Online Chiller: ₹80,000 + 18% gst (Total approx ₹94,400). Heavy ss stand, Emerson 2 tr compressor.
   - 2.5 Ton Online Chiller: ₹95,000 + 18% gst (Total approx ₹1,12,100). SS stand, Kirloskar motor, Emerson compressor.
   - 3.5 Ton Circulation Chiller: ₹1,35,000 + 18% gst (Total approx ₹1,59,300). Copeland scroll compressor, 1.5 yr warranty.
   - 5 Ton / 5.5 Ton SS Body: ₹2,45,000 + 18% gst (Total approx ₹2,89,100). Full ss body, Emerson/Danfoss 5.5 tr scroll compressor.
   - For ANY OTHER capacity or product (e.g. 10 Ton, bottling plant, soda plant, pouch packing):
     NEVER invent or guess prices! Say:
     "Veer ji, is setup di exact capacity te itemized quotation Coordinator Karan sir (+91 99157 30338) share kar denge ji, andaza rate nahi dinde asi."
   - In the same turn, ask consultative question:
     "Dasso veer ji, eh chiller tussi milk/dairy cooling layi dekh rahe ho, machine cooling layi ya water plant layi?"

6. DOMESTIC & KITCHEN RO SYSTEMS (WE DO HAVE THEM, BUT BOT KNOWS ZERO RATES!):
   - CP SYSTEM DOES manufacture and supply Domestic RO systems (kitchen water purifiers, home RO, alkaline RO, UV/UF, water softeners).
   - NEVER say "gharelu kitchen RO nahi karde asi"! CP System provides domestic RO.
   - STRICT PRICING GOVERNANCE: Charan Sir has NOT provided the rate list for domestic RO to the AI bot. You ONLY know the rates of the 6 authorized Chiller models. You DO NOT know any Domestic RO rates!
   - You are 100% STRICTLY FORBIDDEN from guessing, inventing, or quoting any price for Domestic RO!
   - When customer asks about Domestic RO ("ghar waste RO", "kitchen ro", "gharelu ro chahida"):
     Bubble 1: "haanji veer ji, gharelu kitchen RO vi bilkul mil jauga."
     Bubble 2: "tuhade ghar de paani da TDS kinna a ji?"
   - When customer asks for Domestic RO price ("kitchen RO da rate ki hai", "ghar wala ro kinne da"):
     Bubble 1: "veer ji, kitchen RO de models te TDS hisaab naal exact quotation Coordinator Karan sir (+91 99157 30338) share karange."
     Bubble 2: "ghar bore da paani a ji ya municipal supply da?"

7. NEVER PREMATURELY QUIT:
   - NEVER say "Got it, Karan sir nu call kar lo" or "Hor koi jankari chahidi taan dasso" in the middle of qualifying! Stay in conversation as Charanpreet Singh and guide them step-by-step.

Append metadata tag: [[LEAD_UPDATE: {"category": "<Chiller|RO|HeatPump|ColdRoom|Other>", "capacity": "<e.g. 1.5 Ton|5 Ton|1000 LPH|null>", "intent": "SALES", "status": "IN_PROGRESS"}]]
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

// Ensures complete sentences without truncating URLs, questions, or split messages
function ensureSentenceComplete(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (/[.?!]$/.test(cleaned) || /https?:\/\/[^\s]+$/i.test(cleaned) || /^(hlo|hello|hi)$/i.test(cleaned)) return cleaned;

  // If text contains [[SPLIT]], ensure each segment is individually completed
  if (cleaned.includes('[[SPLIT]]')) {
    return cleaned
      .split('[[SPLIT]]')
      .map(part => ensureSentenceComplete(part.trim()))
      .filter(Boolean)
      .join(' [[SPLIT]] ');
  }

  // Detect if it is an inquiry / question (comprehensive Punjabi & Hindi question words)
  const isQuestion = /\b(kinne|kinna|kinni|kinnia|kitne|kitna|kitni|kehde|kehda|kehdi|kehra|kehri|keda|kede|kedi|kis|kide|kihda|kihde|kive|kiven|kida|kiddan|ki|kya|kyun|kado|kadon|dasso|kaun|which|how|what|when|where|koi)\b/i.test(cleaned);

  // If it ends with a complete Punjabi/Hindi verb, noun, or particle
  const endsWithVerbOrPronoun = /\b(a|aa|hai|hain|ne|si|hoga|honge|hunda|hunde|karda|karde|sakde|sakda|chahida|chahidi|chahide|paunga|paugi|milega|milugi|jauga|jaugi|karange|karo|batao|dasso|dekhange|hove|ji|veere|bhaji|bai|ho|karna|chahunde|chahte)\s*$/i.test(cleaned);

  if (endsWithVerbOrPronoun || cleaned.length < 150) {
    return cleaned + (isQuestion ? '?' : '.');
  }

  return cleaned + (isQuestion ? '?' : '.');
}

/**
 * Call Gemini API across rotating key pool
 */
async function callGemini(systemPrompt, contents, maxTokens = 450) {
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
async function callGroqFallback(systemPrompt, contents, maxTokens = 450) {
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
    // Keep last 14 turns (user + assistant) to provide full conversation memory while staying fast
    const recent = contents.slice(-14);
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
async function callMistralFallback(systemPrompt, contents, maxTokens = 450) {
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
    const recent = contents.slice(-14);
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
    if (lastMsg.direction === 'INBOUND' && (lastMsg.content || '').trim() === incomingText.trim()) {
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
  // 1. Scan for previous session boundaries in history (gap > 10 mins before a greeting, or gap > 45 mins)
  if (priorHistory.length > 0) {
    let resetIdx = -1;
    for (let i = 1; i < priorHistory.length; i++) {
      const prevMsg = priorHistory[i - 1];
      const currMsg = priorHistory[i];
      const prevTime = prevMsg.created_at ? new Date(prevMsg.created_at).getTime() : (prevMsg.timestamp || 0);
      const currTime = currMsg.created_at ? new Date(currMsg.created_at).getTime() : (currMsg.timestamp || 0);
      const gapMins = (currTime - prevTime) / (1000 * 60);

      const isCurrGreeting = /^\s*(hi|hello|hey|hlo|helo|hy|haanji|hanji|sat\s*sri\s*akal|namaste)\b/i.test(currMsg.content || '');
      if ((gapMins > 10 && isCurrGreeting) || gapMins > 45) {
        resetIdx = i;
      }
    }

    if (resetIdx !== -1) {
      priorHistory = priorHistory.slice(resetIdx);
    }

    // 2. Check gap between last message in history and current incoming message
    const lastMsg = priorHistory[priorHistory.length - 1];
    const lastTime = lastMsg ? (lastMsg.created_at ? new Date(lastMsg.created_at).getTime() : (lastMsg.timestamp || 0)) : 0;
    const elapsedMinutes = lastTime ? (Date.now() - lastTime) / (1000 * 60) : 0;
    const isGreeting = /^\s*(hi|hello|hey|hlo|helo|hy|haanji|hanji|sat\s*sri\s*akal|namaste|ssakal|ram\s*ram|radhe\s*radhe|good\s*morning|good\s*evening|pranam|salam)\b/i.test(lower);

    if ((elapsedMinutes > 10 && isGreeting) || elapsedMinutes > 45) {
      console.log(`[AI Engine] Session reset for ${cleanPhone}: gap was ${Math.round(elapsedMinutes)} mins`);
      priorHistory = [];
    }
  }

  // Handle degenerate inputs (single punctuation)
  if (/^[?.!,\s]+$/.test(text)) {
    return 'Hlo';
  }

  // Pure standalone greeting: Fast response, natural WhatsApp "Hlo"
  const isPureGreeting = /^\s*(hi|hello|hey|hlo|helo|hy|haanji|hanji|sat\s*sri\s*akal|namaste|ssakal|ram\s*ram|radhe\s*radhe|good\s*morning|good\s*evening|good\s*afternoon|pranam|salam)\s*(ji|sir|veere|bro)?\s*[!.?]*\s*$/i.test(text);
  if (isPureGreeting) {
    return 'Hlo';
  }

  // Pleasantries / Well-being inquiry ("how are you", "kive ho", "ki haal", "kiddan", "haal chaal")
  const isHowAreYou = /\b(?:how\s*are\s*you|kive\s*ho|ki\s*haal|kidda|kiddan|haal\s*chaal|sab\s*theek|how\s*r\s*u)\b/i.test(lower);
  if (isHowAreYou) {
    return "Main theek haan veer ji! Tussi dasso kive ho, sab vadiya? Dasso kede setup baare puchna chahunde ho?";
  }

  // Build clean, authentic conversation turns for LLM (sanitized & bounded to last 14 turns)
  const contents = [];
  const recentMessages = priorHistory.slice(-14);

  for (const m of recentMessages) {
    const isCustomer = m.direction ? m.direction === 'INBOUND' : m.role === 'user';
    const role = isCustomer ? 'user' : 'model';
    let text = (m.content || '').trim();
    // Sanitize past assistant messages: remove URLs and markdown links to prevent context bloat
    if (role === 'model') {
      text = text
        .replace(/https?:\/\/[^\s)]+/gi, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/gi, '$1')
        .replace(/(?:📸|🎥|🌐|🔗)[^\n]*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text.length > 350) text = text.slice(0, 350) + '...';
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
  let rawReply = await callGroqFallback(CP_SYSTEM_PROMPT, contents, 450);

  // Check if valid Gemini keys exist before attempting
  const validGeminiKeys = (config.GEMINI_API_KEYS || []).filter(k => k && k.startsWith('AIzaSy'));
  if ((!rawReply || !rawReply.trim()) && validGeminiKeys.length > 0) {
    console.log(`⚡ [Groq Exhausted] Attempting Gemini fallback for ${cleanPhone}...`);
    rawReply = await callGemini(CP_SYSTEM_PROMPT, contents, 450);
  }

  if (!rawReply || !rawReply.trim()) {
    console.log(`⚡ [LLM Exhausted] Attempting Mistral AI fallback for ${cleanPhone}...`);
    rawReply = await callMistralFallback(CP_SYSTEM_PROMPT, contents, 450);
  }

  if (!rawReply || !rawReply.trim()) {
    rawReply = `Haanji veer ji! Dasso, kis machine ya setup baare jankari chahidi a ji?`;
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

  // Convert markdown double-bold ** to WhatsApp single-bold *
  cleanReply = cleanReply.replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*\*/g, '');

  // Normalize hybrid/broken Hindi-Punjabi phrasing into natural Punjabi
  cleanReply = cleanReply
    .replace(/\b(?:humare|mere|hamare)\s*paas\b/gi, 'sade kol')
    .replace(/\bhum\s*pradan\s*karte\s*hain\b/gi, 'sade kol available a')
    .replace(/\bkar\s*dege\s*a\b/gi, 'kar devange ji')
    .replace(/\bho\s*jaugi\s*a\s*ji\b/gi, 'ho jaugi ji')
    .replace(/\bavailable\s*a\s*ne\b/gi, 'available ne')
    .replace(/\bstock\s*me\s*available\s*a\b/gi, 'stock vich available a')
    .replace(/\bme\s*delivery\b/gi, 'ch delivery')
    .replace(/\b(?:koi\s*baat\s*ni|koi\s*baat\s*nahi)\b/gi, 'koi na')
    .replace(/\bmain\s*tussi\s*guide\s*kar\s*deya\b/gi, 'main dass dinda a')
    .replace(/\bsorry\s*veer\s*ji\b/gi, 'koi na bai ji')
    .replace(/\b(?:tussi\s*)?koi\s*aur\s*product\s*ya\s*setup\s*baare\s*puchna\s*(?:chaunde|chahte)\s*ho\??/gi, 'dasso kede setup baare gal karni chahunde ho ji?')
    .replace(/\bbhi\s*available\s*a\b/gi, 'vi available a')
    .replace(/\blagana\s*chaunde\s*ho\b/gi, 'lagwauna chahunde ho')
    .replace(/\bfake\s*ya\s*andaze\s*naal\s*rate\s*den\s*da\s*koi\s*fayda\s*ni\s*hunda\b/gi, 'rate exact requirement te depend karda a');

  // Strip repetitive verbal ticks like "Tussi ki sochde ho bhaji?" and unclosed parentheses
  cleanReply = cleanReply
    .replace(/\s*(?:tussi|tusse|aap)\s*(?:ki|kya)\s*(?:sochde|sochte|kehnde)\s*ho\s*(?:bhaji|veere|ji)?\??/gi, '')
    .replace(/(?<!\bapprox\s*₹[\d,]+)[()]/g, '')
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

  // Natural mobile texting style: start with small letter unless acronym
  if (cleanReply && !/^(?:RO|SS|CP|GST|TDS|LPH|HP)\b/.test(cleanReply)) {
    cleanReply = cleanReply.charAt(0).toLowerCase() + cleanReply.slice(1);
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
    .replace(/\b(?:poori\s*jankari\s*de\s*dinde\s*a|poori\s*jankari\s*de\s*dinda\s*a|poori\s*jankari\s*mil\s*jaugi|main\s*poori\s*jankari\s*dass\s*dinda\s*a)[,.]?\s*/gi, '')
    .replace(/(?:,|\.|\?|!)*\s*(?:dekh\s*liya\s*(?:ji)?|aur\s*dikhane\s*chahte\s*ho\??|tussi\s*ki\s*sochde\s*ho\??|kuch\s*hor\s*puchna\s*hai\??)[\s.?!]*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Safety Guard: On general initial RO inquiry, ensure simple question about RO kind rather than premature location question
  if (/^\s*(?:ro\s*bare\s*puchna|ro\s*chahida|ro\s*plant|ro\s*setup|ro\s*rate)\s*$/i.test(incomingText.trim()) && priorHistory.length === 0) {
    cleanReply = cleanReply.replace(/(?:pehla\s*dasso\s*,?\s*)?(?:eh\s*setup\s*)?tussi\s*pind\s*vich\s*shuru\s*karna\s*hai\s*ya\s*shehar\s*vich\s*ji\??/gi, 'keda RO setup dekh rahe ho ji?');
  }

  // Strict Pricing Defense Gate: Never allow unprompted price quotes or fake prices for non-chiller products
  const isPriceExplicitlyAsked = /\b(rate|price|kharcha|cost|kinne\s*da|kitne\s*ka|kine\s*da|kinna\s*kharcha|budget|quotation|quote|paisa|paise|millega|miluga|kinne\s*vich|kitne\s*me)\b/i.test(incomingText);
  if (!isPriceExplicitlyAsked) {
    // Strip any hallucinated unprompted pricing like "approx ₹..." or "₹... to shuru"
    cleanReply = cleanReply
      .replace(/(?:da\s*rate\s*)?(?:approx\s*)?₹?\s*[\d,]+\s*(?:\+\s*18%\s*gst)?\s*(?:to|se)?\s*shuru\s*hunda\s*a[,.]?\s*/gi, '')
      .replace(/(?:da\s*rate\s*)?₹\s*[\d,]+\s*(?:\+\s*18%\s*gst)?(?:\s*\(Total\s*approx\s*₹?[\d,]+\))?[,.]?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Safety Defense for Non-Chillers (Heat Pump, Cold Room): Never quote fake numbers
  if (/(?:heat\s*pump|cold\s*room)/i.test(cleanReply) || /(?:heat\s*pump|cold\s*room)/i.test(incomingText)) {
    if (/₹\s*[\d,]+/i.test(cleanReply)) {
      cleanReply = cleanReply.replace(/(?:approx\s*)?₹\s*[\d,]+(?:\s*(?:to|se)?\s*shuru\s*hunda\s*a)?/gi, 'customized quotation Coordinator Karan sir (+91 99157 30338) share karange');
    }
  }

  // Domestic RO Interceptor & Strict Pricing Governance:
  // CP System DOES provide domestic kitchen RO, but bot knows ZERO rates!
  if (/(?:ghar|kitchen|gharelu|domestic)\s*(?:waste|ch|layi|de\s*layi|da)?\s*(?:ro|filter|purifier)/i.test(incomingText)) {
    // Intercept accidental negative rejection
    if (/nahi\s*karde|commercial\s*hunde\s*ne/i.test(cleanReply)) {
      cleanReply = "haanji veer ji, gharelu kitchen RO vi bilkul mil jauga. [[SPLIT]] tuhade ghar de paani da TDS kinna a ji?";
    }
    // Intercept any hallucinated rate for domestic RO (bot has ZERO domestic RO rates)
    if (isPriceExplicitlyAsked || /₹|[\d,]+\s*(?:da|hazar|rupee|cost|rate)/i.test(cleanReply)) {
      cleanReply = "veer ji, kitchen RO de models te TDS membrane hisaab naal exact quotation Coordinator Karan sir (+91 99157 30338) share karange. [[SPLIT]] ghar bore da paani a ji ya municipal supply da?";
    }
  }

  // Chiller False-Binary Interceptor: Never box customer into only milk or machine cooling
  cleanReply = cleanReply.replace(/milk\s*cooling\s*layi\s*ya\s*machine\s*cooling\s*layi\??/gi, 'kis kaam ya application layi dekh rahe si ji?');

  // Strip repetitive "haanji veer ji" / "haanji bai ji" to avoid robotic formality
  cleanReply = cleanReply.replace(/^(?:haanji\s+)?(?:veer\s*ji|bai\s*ji|bhaji)[,.]?\s*/i, '').trim();

  // Strip accidental leading greeting if customer did not greet
  if (!isPureGreeting) {
    cleanReply = cleanReply.replace(/^(?:hello!?|hi!?|hlo!?)\s*(?:veer\s*ji!?|bai\s*ji!?|ji!?)?\s*(?:\[\[SPLIT\]\])?\s*/i, '').trim();
  }

  // Auto-split: Consecutive Two Messages (Telling Statement in Bubble 1 + Question Drop in Bubble 2)
  if (cleanReply.includes('?') && !cleanReply.includes('[[SPLIT]]')) {
    // Match: statement part ending in . ! or newline, followed by question
    const splitMatch = cleanReply.match(/^(.+?[.!\n])\s*([a-zA-Z0-9\u0A00-\u0A7F].*?\?)$/s);
    if (splitMatch && splitMatch[1] && splitMatch[2]) {
      const tellingPart = splitMatch[1].replace(/[?]/g, '.').trim();
      const questionPart = splitMatch[2].trim();
      cleanReply = `${tellingPart} [[SPLIT]] ${questionPart}`;
    } else {
      // Look for question start boundary
      const qStartMatch = cleanReply.match(/^(.*?)(?:\s*,\s*|\s+)(dasso\b|eh\s+setup\b|eh\s+chiller\b|tuhade\b|tussi\b|kis\s+kaam\b|keda\b|kehda\b|itemized\s+quotation\b|setup\s+layi\b|loan\s+tussi\b)(.*?\?)$/is);
      if (qStartMatch && qStartMatch[1] && qStartMatch[2]) {
        const tellingPart = qStartMatch[1].replace(/[?]/g, '').trim();
        const questionPart = `${qStartMatch[2]} ${qStartMatch[3]}`.trim();
        if (tellingPart.length > 5) {
          cleanReply = `${tellingPart} [[SPLIT]] ${questionPart}`;
        }
      }
    }
  }

  // Clean any dangling or doubled [[SPLIT]] tags
  cleanReply = cleanReply
    .replace(/\[\[SPLIT\]\]\s*\[\[SPLIT\]\]/gi, '[[SPLIT]]')
    .replace(/^\s*\[\[SPLIT\]\]/gi, '')
    .replace(/\[\[SPLIT\]\]\s*$/gi, '')
    .trim();

  // Clean any stray leading punctuation left over
  cleanReply = cleanReply.replace(/^[,.!?\s]+/, '').trim();

  // Enforce strictly ONE question per message turn (Clean multi-question garbage like 'a,?,dasso ji')
  if (cleanReply.includes('[[SPLIT]]')) {
    let parts = cleanReply.split('[[SPLIT]]').map(p => p.trim()).filter(Boolean);
    // If Part 1 (Telling) contains both a statement and a question, extract question to Part 2!
    if (parts[0] && parts[0].includes('?')) {
      const qMatchInPart0 = parts[0].match(/^(.*?[.!])\s*(.*?\?)$/s);
      if (qMatchInPart0 && qMatchInPart0[1] && qMatchInPart0[2]) {
        parts[0] = qMatchInPart0[1].trim();
        parts[1] = qMatchInPart0[2].trim();
      } else {
        parts[0] = parts[0].replace(/\?.*$/, '').trim();
      }
    }

    // Part 1 (Telling): strictly NO question mark allowed
    if (parts[0]) {
      parts[0] = parts[0].replace(/\?/g, '.').replace(/\s*[,.]+\s*$/, '').trim();
    }

    // Part 2 (Question drop): strictly ONE question mark at the end
    if (parts[1]) {
      parts[1] = parts[1].replace(/\?,/g, ',').replace(/,\?/g, '?').replace(/\?+/g, '?');
      const qIndex = parts[1].lastIndexOf('?');
      if (qIndex !== -1) {
        const qBefore = parts[1].slice(0, qIndex).replace(/\?/g, ',');
        parts[1] = (qBefore + '?').replace(/\s{2,}/g, ' ').trim();
      }
    }
    cleanReply = [parts[0], parts[1]].filter(Boolean).join(' [[SPLIT]] ');
  } else if (cleanReply.includes('?')) {
    cleanReply = cleanReply.replace(/\?,/g, ',').replace(/,\?/g, '?').replace(/\?+/g, '?');
    const qMatches = cleanReply.match(/\?/g);
    if (qMatches && qMatches.length > 1) {
      const lastQIndex = cleanReply.lastIndexOf('?');
      cleanReply = cleanReply.slice(0, lastQIndex).replace(/\?/g, ',') + '?';
    }
  }

  // Anti-Loop Guard: If the exact same question is repeated consecutively (>80% similarity), advance the sales ladder
  if (priorHistory.length > 0) {
    const lastBotMsgObj = [...priorHistory].reverse().find(m => m.direction === 'OUTBOUND_BOT' || m.role === 'model');
    if (lastBotMsgObj && lastBotMsgObj.content) {
      const lastBotText = lastBotMsgObj.content.replace(/\[\[SPLIT\]\]/g, ' ').trim();
      const lastBotQuestions = lastBotText.match(/[^.!?\n]+\?/g) || [];
      const currentQuestions = cleanReply.match(/[^.!?\n]+\?/g) || [];

      if (lastBotQuestions.length > 0 && currentQuestions.length > 0) {
        const lastQ = lastBotQuestions[lastBotQuestions.length - 1].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const currQ = currentQuestions[currentQuestions.length - 1].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

        const lastWords = new Set(lastQ.split(/\s+/).filter(w => w.length > 2));
        const currWords = currQ.split(/\s+/).filter(w => w.length > 2);
        const matchCount = currWords.filter(w => lastWords.has(w)).length;
        const similarity = currWords.length > 0 ? (matchCount / currWords.length) : 0;

        if (similarity > 0.80) {
          console.log(`🛡️ [Anti-Loop Intercepted]: Repeated question detected ("${currQ}"). Advancing sales ladder.`);
          cleanReply = cleanReply.replace(currentQuestions[currentQuestions.length - 1], '').trim();
          cleanReply = cleanReply.replace(/\[\[SPLIT\]\]\s*$/, '').trim();

          // Advance forward in the consultative ladder instead of prematurely quitting!
          if (/pind|shehar/i.test(incomingText) || /pind|shehar/i.test(lastBotText)) {
            cleanReply += (cleanReply ? ' ' : '') + "Plant setup layi 3-phase bijli connection te space tayar hai ji?";
          } else if (/bijli|phase|space|jagah/i.test(incomingText)) {
            cleanReply += (cleanReply ? ' ' : '') + "Eh setup tussi kadon tak shuru karan da vichar kar rahe ho ji?";
          } else {
            cleanReply += (cleanReply ? ' ' : '') + "Tuhade setup di exact capacity kinne LPH ya Ton di plan kar rahe ho ji?";
          }
        }
      }
    }
  }

  cleanReply = ensureSentenceComplete(cleanReply);

  // Anti-Degeneracy Quality Gate: NEVER send 1-word or grunt replies for inquiries
  const isGruntReply = !isPureGreeting && /^(ha|haan|haanji|ji|ok|theek\s*hai|hmm|acha|got\s*it|hi|yes|no)[\s.!?]*$/i.test(cleanReply.trim());
  if ((cleanReply.length < 12 && !isPureGreeting) || isGruntReply) {
    console.log(`🛡️ [Degenerate Reply Intercepted]: "${cleanReply}" for input "${incomingText}". Regenerating helpful response.`);
    if (isPureGreeting) {
      cleanReply = "Hlo";
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
      cleanReply = "Haanji veer ji! Dasso, kis machine ya setup baare jankari chahidi a ji?";
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
      let b = (str || '')
        .replace(/(?:,|\.|\?|!)*\s*(?:dekh\s*liya\s*(?:ji)?|dekha\s*(?:ji)?|aur\s*dikhane\s*chahte\s*ho\??|tussi\s*ki\s*sochde\s*ho\??|koi\s*aur\s*madad\s*kiya\??)[\s.?!]*$/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!b) b = (str || '').trim();
      b = ensureSentenceComplete(b);
      // Mobile casual texting style: start with small letter unless acronym
      if (b && !/^(?:RO|SS|CP|GST|TDS|LPH|HP)\b/.test(b)) {
        b = b.charAt(0).toLowerCase() + b.slice(1);
      }
      return b;
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
    }

    if (bubbles.length === 0) bubbles = [text.trim()];
    return bubbles.map(cleanBubble).filter(Boolean);
  }

  const splitMessages = formatHumanSplit(cleanReply);
  return splitMessages.length > 1 ? splitMessages : (splitMessages[0] || cleanReply);
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

  // 1. ALL INDIA GOVT & PRIVATE JOBS CHANNEL MODE (Bal Krishan Sir / Multi-Publisher)
  const jobsTriggerRegex = /\b(jobs?\s*channel|channel\s*jobs?|all\s*india\s*govt\s*jobs?|sarkari\s*result)\b/i;
  const isJobsExitRegex = /^\s*(exit|stop|band\s*karo|quit|leave|normal|exit\s*jobs?)\s*$/i;

  // Resolve effective tenant strictly based on phone number ID or intent
  let effectiveTenant = tenantId || 'default';
  if (phoneNumberId === '1345576425313536' || tenantId === 'cpsystem') {
    effectiveTenant = 'cpsystem';
  } else if (phoneNumberId === '1351625371363106' || tenantId === 'edufun') {
    effectiveTenant = 'edufun';
  } else if (phoneNumberId === '1346591765206499' || phoneNumberId === '1310338315506407' || tenantId === 'mystery') {
    effectiveTenant = 'mystery';
  } else {
    const cpKeywords = /\b(cp\s*system|cpsystem|chiller|chillar|ro\b|camper|cooling|milk|doodh|dudh|dairy|bmc|water\s*plant|cold\s*room|heat\s*pump|plant|compressor|copeland|kinne\s*da|kitne\s*ka|pind|shehar|tankan|tanki|ss\s*tank)\b/i;
    if (cpKeywords.test(lowerText)) {
      effectiveTenant = 'cpsystem';
    }
  }

  // Check if currently in jobs_channel across effective tenant or explicit tenant
  let currentMode = memory.getMode(cleanPhone, effectiveTenant);
  if (currentMode !== 'jobs_channel' && tenantId && tenantId !== effectiveTenant) {
    if (memory.getMode(cleanPhone, tenantId) === 'jobs_channel') {
      currentMode = 'jobs_channel';
      effectiveTenant = tenantId;
    }
  }

  const restoredLead = await memory.syncFromSupabase(cleanPhone, effectiveTenant, db);
  const activeLead = existingLead || restoredLead;

  // If currently in jobs_channel and user types exit or stop
  if (currentMode === 'jobs_channel' && isJobsExitRegex.test(lowerText)) {
    const revertMode = (phoneNumberId === '1345576425313536' || tenantId === 'cpsystem') ? 'cp_system' : 'default';
    memory.setMode(cleanPhone, revertMode, effectiveTenant);
    jobsEngine.removeSubscriber(cleanPhone);
    const exitMsg = "🔄 *Jobs Channel Mode Deactivated.*\n\nReverted back to normal assistant mode. How can I help you today?";
    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', exitMsg, effectiveTenant);
    return exitMsg;
  }

  // If user triggers Jobs Channel
  if (jobsTriggerRegex.test(lowerText)) {
    memory.setMode(cleanPhone, 'jobs_channel', effectiveTenant);
    jobsEngine.addSubscriber(cleanPhone, phoneNumberId || '1351625371363106', effectiveTenant);
    const jobs = await jobsEngine.searchJobs(incomingText, 2);
    const headerMsg = "📢 *All India Govt Jobs / Private Jobs Channel Activated!* 🚀\n\nAb iss number te real-time latest government te private jobs, teaching/non-teaching, PSSSB, DSSSB, University, Railway, Banking updates share honge.\n\nType *'exit'* or *'stop'* to revert back to normal assistant mode anytime.";
    const jobCards = jobs.map(j => jobsEngine.formatJobPost(j));
    const response = [headerMsg, ...jobCards];
    const fullReply = response.join('\n\n');
    memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
    memory.addMessage(cleanPhone, 'model', fullReply, effectiveTenant);
    return response;
  }

  // If currently in jobs_channel mode, handle job search queries
  if (currentMode === 'jobs_channel') {
    const jobs = await jobsEngine.searchJobs(incomingText, 2);
    if (jobs && jobs.length > 0) {
      const jobCards = jobs.map(j => jobsEngine.formatJobPost(j));
      const fullReply = jobCards.join('\n\n');
      memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
      memory.addMessage(cleanPhone, 'model', fullReply, effectiveTenant);
      return jobCards;
    } else {
      const noJobsMsg = "🔎 *All India Govt Jobs Channel*\n\nNaveen notifications search kite gaye par iss specific keyword te koi active result nahi milya.\n\nTussi check kar sakde ho:\n• *Railway Jobs / RRB*\n• *PSSSB / Punjab Govt*\n• *Teaching / School*\n• *Banking / IBPS*\n• *Latest Result & Admit Cards*\n\nYa type karo *'exit'* normal bot layi.";
      memory.addMessage(cleanPhone, 'user', incomingText, effectiveTenant);
      memory.addMessage(cleanPhone, 'model', noJobsMsg, effectiveTenant);
      return noJobsMsg;
    }
  }

  // 2. DEDICATED CP SYSTEM FLOW
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
  const isUtility = /\b(chiller|chillers|cooling|dairy|milk|bmc|machine|molding|laser|bakery|glycol|cold\s*room)\b/i.test(req);

  if (isUtility) {
    return "Hlo veer ji! CP SYSTEM Sri Muktsar Sahib to.\n\nTuhade chiller setup baare gal karni si ji. Koi technical details ya quotation share karwaiye ji? Coordinator Karan sir (+91 99157 30338) ready ne.";
  }

  return "Hlo veer ji! CP SYSTEM Sri Muktsar Sahib to.\n\nTuhade setup baare gal karni si ji. Koi jankari ya official quotation chahidi hove taan zaroor dasso ji.";
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
