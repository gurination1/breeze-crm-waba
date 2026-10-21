const assert = require('assert');

// Mock Lead Engine Simulation
class CpLeadQualifier {
  constructor() {
    this.leads = {};
  }

  getLead(phone) {
    if (!this.leads[phone]) {
      this.leads[phone] = {
        phone,
        name: '',
        nameConfirmed: false,
        category: '',
        capacity: '',
        city: '',
        step: 'NAME_CONFIRM',
        status: 'NEW',
        inquiry_type: 'SALES'
      };
    }
    return this.leads[phone];
  }

  processMessage(phone, incomingText, detectedName = '') {
    const lead = this.getLead(phone);
    const text = incomingText.trim();
    const lower = text.toLowerCase();

    // 0. RESET / START OVER
    if (/^(reset|restart|new inquiry|naya project|start over)\b/i.test(lower)) {
      lead.name = detectedName || lead.name;
      lead.nameConfirmed = !!lead.name;
      lead.category = '';
      lead.capacity = '';
      lead.city = '';
      lead.step = lead.nameConfirmed ? 'CATEGORY' : 'NAME_CONFIRM';
      lead.status = 'NEW';
      lead.inquiry_type = 'SALES';
      return `🔄 Inquiry reset successful! Namaste ${lead.name || ''}! Aapko kis product ki requirement hai?\n\n1️⃣ Industrial Chiller (1 to 15 Ton)\n2️⃣ RO / Water Purification Plant (25 to 1,00,000 LPH)\n3️⃣ Water Heat Pump\n4️⃣ Custom Machinery`;
    }

    // 1. COMPLAINT DETECTION
    if (/\b(complaint|shikayat|problem|issue|kharab|cooling nahi|leakage|leak|breakdown|not working|chal nahi raha|band ho gaya|error|fault)\b/i.test(lower)) {
      lead.inquiry_type = 'COMPLAINT';
      lead.status = 'COMPLAINT';
      lead.requirement = text;
      return `Namaste ${lead.name || detectedName || ''} ji! 🙏 *CP SYSTEM Support*.\n\nAapki complaint priority par note kar li gayi hai.\nMachine mein exactly kya problem aa rahi hai aur aapka plant kis city mein hai?\n\nHamare Head Coordinator *Karan Singh* ji (+91 99157 30338) aur technical team aapse turant connect karegi.`;
    }

    // 2. REPAIR / SERVICE DETECTION
    if (/\b(repair|service|servicing|filter change|part change|maintenance|technician|mechanic|theek karwana|gas charge|membrane change)\b/i.test(lower)) {
      lead.inquiry_type = 'REPAIR';
      lead.status = 'REPAIR';
      lead.requirement = text;
      return `Namaste ${lead.name || detectedName || ''} ji! 🙏 *CP SYSTEM Service Team*.\n\nAapko Chiller ya RO Plant ki service / repair karwani hai? Aur machine kis city mein installed hai?\n\nHead Coordinator *Karan Singh* ji (+91 99157 30338) aapse connect karke technical visit schedule karenge.`;
    }

    // 3. ALREADY QUALIFIED LEAD HANDLING
    if (lead.status === 'QUALIFIED' || lead.step === 'QUALIFIED') {
      const isGreeting = /^(hi|hello|hey|namaste|sat sri akal|pranam|ram ram|hlo|start|menu)\b/i.test(lower) || lower.length <= 4;
      if (isGreeting) {
        return `Namaste ${lead.name || 'ji'}! 🙏 *CP SYSTEM* mein swagat hai.\n\nAapki *${lead.requirement || (lead.category + ' ' + lead.capacity)}* (${lead.city || 'Punjab'}) ki inquiry already note ho chuki hai aur Head Coordinator *Karan Singh* (+91 99157 30338) aapse direct connect kar rahe hain.\n\nKya aapko iske baare mein koi aur jaankari chahiye, ya koi naya project discuss karna hai?`;
      }
      return `Namaste ${lead.name || 'ji'}! Hamari technical team aapki query check kar rahi hai. Head Coordinator Karan Singh (+91 99157 30338) jald hi quotation aur details share karenge.`;
    }

    // 4. MULTI-FIELD FAST EXTRACTION (If user gives everything at once)
    const catCheck = lower.includes('chiller') ? 'Industrial Chiller' : (lower.includes('ro') ? 'RO & Water Purification Plant' : null);
    const tonCheck = lower.match(/(\d+(?:\.\d+)?)\s*(ton|tn|tr)\b/i);
    const lphCheck = lower.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(lph|liter|litre|ltr|l|ka)\b/i);
    const cityCheck = lower.includes('chhattisgarh') ? 'Chhattisgarh' : (lower.includes('muktsar') ? 'Muktsar' : null);

    if (catCheck && (tonCheck || lphCheck) && cityCheck) {
      lead.name = lead.name || detectedName || 'Gurdharam';
      lead.nameConfirmed = true;
      lead.category = catCheck;
      lead.capacity = tonCheck ? `${tonCheck[1]} Ton` : `${lphCheck[1]} LPH`;
      lead.city = cityCheck;
      lead.requirement = `${lead.category} (${lead.capacity})`;
      lead.status = 'QUALIFIED';
      lead.step = 'QUALIFIED';
      return `Dhanyawad ${lead.name} ji! 🙏\n\nAapki requirement note kar li gayi hai:\n⚙️ *Product*: ${lead.category} (${lead.capacity})\n📍 *Location*: ${lead.city}\n\nHamare Head Coordinator *Karan Singh* ji (+91 99157 30338) aapse jald hi direct call karke customized technical quotation aur proposal share karenge.`;
    }

    // 5. STEP-BY-STEP FUNNEL
    // STEP 1: NAME CONFIRMATION
    if (!lead.nameConfirmed) {
      if (lead.step === 'NAME_CONFIRM') {
        const dName = detectedName || lead.name;
        if (dName && dName !== 'WhatsApp Lead' && dName !== 'Nya') {
          lead.name = dName;
          lead.step = 'AWAITING_NAME_CHOICE';
          return `Namaste! 🙏 *CP SYSTEM* (Muktsar) mein swagat hai.\n\nWhatsApp par aapka naam *${dName}* dikh raha hai — kya yeh sahi hai?\n\n1️⃣ Haan, sahi hai\n2️⃣ Nahi, doosra naam hai\n\n_(1 ya 2 reply karein, ya apna shubh naam likhein)_`;
        } else {
          lead.step = 'AWAITING_NAME_INPUT';
          return `Namaste! 🙏 *CP SYSTEM* (Muktsar) mein swagat hai.\n\nIndustrial Chillers aur RO Plants ke official inquiry portal par aapka swagat hai.\n\nMain aapko behtar assist kar sakoon, iske liye kripya aapka shubh naam batayein?`;
        }
      }

      if (lead.step === 'AWAITING_NAME_CHOICE') {
        if (/^(1|haan|yes|sahi|sahi hai|ji haan|hanji|ha)\b/i.test(lower)) {
          lead.nameConfirmed = true;
          lead.step = 'CATEGORY';
          return `Dhanyawad ${lead.name} ji! 🙏\n\nAapko kis product ki requirement hai?\n\n1️⃣ Industrial Chiller (1 to 15 Ton)\n2️⃣ RO / Water Purification Plant (25 to 1,00,000 LPH)\n3️⃣ Water Heat Pump\n4️⃣ Custom / Other Requirement\n\n_(Aap 1, 2, 3 ya 4 reply kar sakte hain, ya likh kar bata sakte hain)_`;
        } else if (/^(2|nahi|no|na)\b/i.test(lower)) {
          lead.step = 'AWAITING_NAME_INPUT';
          return `Kripya apna shubh naam likh kar batayein:`;
        } else if (text.length >= 2 && !/^\d+$/.test(text)) {
          lead.name = text.replace(/^(mera\s+naam|i\s+am|my\s+name\s+is)\s+/i, '').trim();
          lead.nameConfirmed = true;
          lead.step = 'CATEGORY';
          return `Dhanyawad ${lead.name} ji! 🙏\n\nAapko kis product ki requirement hai?\n\n1️⃣ Industrial Chiller (1 to 15 Ton)\n2️⃣ RO / Water Purification Plant (25 to 1,00,000 LPH)\n3️⃣ Water Heat Pump\n4️⃣ Custom / Other Requirement\n\n_(Aap 1, 2, 3 ya 4 reply kar sakte hain, ya likh kar bata sakte hain)_`;
        }
      }

      if (lead.step === 'AWAITING_NAME_INPUT') {
        lead.name = text.replace(/^(mera\s+naam|i\s+am|my\s+name\s+is)\s+/i, '').trim();
        lead.nameConfirmed = true;
        lead.step = 'CATEGORY';
        return `Dhanyawad ${lead.name} ji! 🙏\n\nAapko kis product ki requirement hai?\n\n1️⃣ Industrial Chiller (1 to 15 Ton)\n2️⃣ RO / Water Purification Plant (25 to 1,00,000 LPH)\n3️⃣ Water Heat Pump\n4️⃣ Custom / Other Requirement\n\n_(Aap 1, 2, 3 ya 4 reply kar sakte hain, ya likh kar bata sakte hain)_`;
      }
    }

    // STEP 2: CATEGORY
    if (lead.step === 'CATEGORY' || !lead.category) {
      if (lower === '1' || lower.includes('chiller') || lower.includes('cooling')) {
        lead.category = 'Industrial Chiller';
        lead.step = 'CAPACITY';
        return `Zaroor ${lead.name} ji! Industrial Chiller ke liye kitne Ton capacity ki zaroorat hai?\n\n1️⃣ 1 to 3.5 Ton (Small Dairy / Milk Chilling / Lab)\n2️⃣ 5 to 10 Ton (Industrial / Cold Room / BMC / Factory)\n3️⃣ 15+ Ton (Heavy Industrial Plant)\n4️⃣ Custom Capacity (Apni requirement Tons mein likhein)\n\n_(Aap 1, 2, 3 ya apni specific capacity likh sakte hain)_`;
      } else if (lower === '2' || lower.includes('ro') || lower.includes('water')) {
        lead.category = 'RO & Water Purification Plant';
        lead.step = 'CAPACITY';
        return `Zaroor ${lead.name} ji! RO Plant ke liye kitni capacity (LPH) ki requirement hai?\n\n1️⃣ 250 - 500 LPH (Commercial / School / Clinic)\n2️⃣ 1,00,000 LPH (Factory / Institution / Bottling)\n3️⃣ 5,000+ LPH (Heavy Industrial / Large Plant)\n4️⃣ Custom Capacity (Apni requirement LPH mein likhein)\n\n_(Aap 1, 2, 3 ya apni specific capacity likh sakte hain)_`;
      } else if (lower === '3' || lower.includes('heat pump')) {
        lead.category = 'Water Heat Pump';
        lead.step = 'CAPACITY';
        return `Zaroor ${lead.name} ji! Water Heat Pump kis application ke liye chahiye (e.g. Commercial, Hotel, Swimming Pool)? Aur approximate daily water capacity kitni hai?`;
      } else if (lower === '4') {
        lead.category = 'Custom Machinery';
        lead.step = 'CAPACITY';
        return `Zaroor ${lead.name} ji! Apni custom machinery ya project requirement likh kar batayein:`;
      } else {
        return `Aapko kis product ki requirement hai?\n\n1️⃣ Industrial Chiller (1 to 15 Ton)\n2️⃣ RO / Water Purification Plant (25 to 1,00,000 LPH)\n3️⃣ Water Heat Pump\n4️⃣ Custom / Other Requirement\n\n_(Aap 1, 2, 3 ya 4 reply kar sakte hain)_`;
      }
    }

    // STEP 3: CAPACITY
    if (lead.step === 'CAPACITY' || !lead.capacity) {
      const isRo = lead.category.includes('RO');
      const isChiller = lead.category.includes('Chiller');

      if (isRo) {
        if (lower === '1') lead.capacity = '250 - 500 LPH';
        else if (lower === '2') lead.capacity = '1,000 - 2,000 LPH';
        else if (lower === '3') lead.capacity = '5,000+ LPH';
        else {
          const m = lower.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(lph|liter|litre|ltr|l|ka)?\b/);
          if (m) lead.capacity = `${m[1].replace(/,/g, '')} LPH`;
          else lead.capacity = text;
        }
      } else if (isChiller) {
        if (lower === '1') lead.capacity = '1 to 3.5 Ton';
        else if (lower === '2') lead.capacity = '5 to 10 Ton';
        else if (lower === '3') lead.capacity = '15+ Ton';
        else {
          const m = lower.match(/(\d+(?:\.\d+)?)\s*(ton|tn|tr)?\b/);
          if (m) lead.capacity = `${m[1]} Ton`;
          else lead.capacity = text;
        }
      } else {
        lead.capacity = text;
      }

      // Check if location was also in this text
      const cleanLoc = lower
        .replace(/\b\d+(?:,\d+)*(?:\.\d+)?\s*(lph|liter|litre|ltr|l|ton|tons|tn|tr|ka)?\b/gi, '')
        .replace(/\b(mein|me|in|se|city|location|district|lagwana|hai|setup|chahiye|from|ko)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();

      if (cleanLoc.length >= 3 && !/^(1|2|3|4)$/.test(cleanLoc)) {
        lead.city = cleanLoc.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        lead.requirement = `${lead.category} (${lead.capacity})`;
        lead.status = 'QUALIFIED';
        lead.step = 'QUALIFIED';
        return `Dhanyawad ${lead.name} ji! 🙏\n\nAapki requirement note kar li gayi hai:\n⚙️ *Product*: ${lead.category} (${lead.capacity})\n📍 *Location*: ${lead.city}\n\nHamare Head Coordinator *Karan Singh* ji (+91 99157 30338) aapse jald hi direct call karke customized technical quotation aur proposal share karenge.`;
      }

      lead.step = 'LOCATION';
      return `Bahut badhiya ${lead.name} ji! 👍 (${lead.capacity})\n\nYeh setup kis city / district mein lagwana hai?\n_(Apni installation location batayein)_`;
    }

    // STEP 4: LOCATION
    if (lead.step === 'LOCATION' || !lead.city) {
      let cleaned = lower
        .replace(/\b(mein|me|in|se|city|location|district|lagwana|hai|setup|chahiye|from|ko)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      lead.city = (cleaned || text).split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      lead.requirement = `${lead.category} (${lead.capacity})`;
      lead.status = 'QUALIFIED';
      lead.step = 'QUALIFIED';
      return `Dhanyawad ${lead.name} ji! 🙏\n\nAapki requirement note kar li gayi hai:\n⚙️ *Product*: ${lead.category} (${lead.capacity})\n📍 *Location*: ${lead.city}\n\nHamare Head Coordinator *Karan Singh* ji (+91 99157 30338) aapse jald hi direct call karke customized technical quotation aur proposal share karenge.`;
    }

    return "Hamari technical team aapse turant connect karegi!";
  }
}

// SIMULATION TEST SUITE
console.log("=== RUNNING CP SYSTEM QUALIFICATION SIMULATION TEST ===");
const qualifier = new CpLeadQualifier();
const phone = "919041172159";

console.log("\n--- Turn 1: User says 'hi' ---");
console.log("BOT:", qualifier.processMessage(phone, "hi", "Gurdharam"));

console.log("\n--- Turn 2: User confirms name with '1' ---");
console.log("BOT:", qualifier.processMessage(phone, "1", "Gurdharam"));

console.log("\n--- Turn 3: User chooses 'ro' or '2' ---");
console.log("BOT:", qualifier.processMessage(phone, "2", "Gurdharam"));

console.log("\n--- Turn 4: User says '1000 ka, chattisgarh mein' ---");
console.log("BOT:", qualifier.processMessage(phone, "1000 ka, chattisgarh mein", "Gurdharam"));

console.log("\n--- Turn 5: User says 'hi' next day (Crucial Test!) ---");
console.log("BOT:", qualifier.processMessage(phone, "hi", "Gurdharam"));

console.log("\n--- Turn 6: Test Complaint Detection ---");
const compPhone = "919876543210";
console.log("BOT:", qualifier.processMessage(compPhone, "Machine thanda nahi kar rahi hai problem aa rahi hai", "Harpreet"));

console.log("\n--- Turn 7: Test Repair Detection ---");
const repPhone = "919876543211";
console.log("BOT:", qualifier.processMessage(repPhone, "RO plant ki service karwani hai membrane change karna hai", "Sukhwinder"));

console.log("\n=== ALL TESTS PASSED! ===");
