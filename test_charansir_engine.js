const ai = require('./ai_engine');
const db = require('./db');
const memory = require('./memory');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING CHARAN SIR CONSULTATIVE SALES ENGINE 🧪');
  console.log('====================================================\n');

  const testPhone = '919876543210';
  const tenantId = 'cpsystem';

  // Clear memory and reset lead
  memory.clearHistory(testPhone, tenantId);
  try {
    await db.del('crm_leads', `tenant_id=eq.${tenantId}&phone=eq.${testPhone}`);
  } catch(e) {}

  const scenarios = [
    {
      label: '1. Inbound greeting from Meta ad',
      text: 'Sat Sri Akal ji, main tuhanu YouTube te dekheya si'
    },
    {
      label: '2. Pind inquiry & location given',
      text: 'Mera naam Harpreet Singh hai, Bathinda de pind vich camper plant lagwana si. Kharcha kinna aunda?'
    },
    {
      label: '3. Budget hesitation / asking for EMI or loan',
      text: 'Paise thode ghat ne bhaji, koi EMI ya loan di scheme hai?'
    },
    {
      label: '4. Asking about competitor cheaper pricing',
      text: 'Par veere, Ludhiana wali ek company 20% sasta de rahi hai'
    },
    {
      label: '5. Ready to lock order ("Sai Pauna")',
      text: 'Bilkul sahi gal hai veere, tussi sahi keha. Jagah tayar hai, booking final karo'
    }
  ];

  for (const s of scenarios) {
    console.log(`\n💬 [Scenario: ${s.label}]`);
    console.log(`👤 Customer: "${s.text}"`);
    const reply = await ai.generateAIReply(testPhone, s.text, 'Harpreet Singh', tenantId, '1345576425313536');
    console.log(`🤖 Bot Reply:\n${reply}\n`);
    console.log('----------------------------------------------------');
  }

  // Check lead updated in Supabase
  const updatedLeads = await db.get('crm_leads', `tenant_id=eq.${tenantId}&phone=eq.${testPhone}`);
  console.log('\n📊 [Supabase Lead Record After Interaction]:');
  console.log(JSON.stringify(updatedLeads?.[0] || {}, null, 2));

  console.log('\n✅ All Scenarios Tested Successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
