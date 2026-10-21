const ai = require('./ai_engine');
const memory = require('./memory');
const db = require('./db');

async function simulateChat(productName, phone, turns) {
  console.log(`\n============================================================`);
  console.log(`🧪 PRODUCT TEST: ${productName} (Phone: ${phone})`);
  console.log(`============================================================`);
  
  memory.clearHistory(phone, 'cpsystem');
  try {
    await db.del('crm_leads', `tenant_id=eq.cpsystem&phone=eq.${phone}`);
  } catch(e) {}

  for (let i = 0; i < turns.length; i++) {
    const userText = turns[i];
    console.log(`\n[Turn ${i + 1}] 👤 User: "${userText}"`);
    
    const reply = await ai.generateAIReply(
      phone,
      userText,
      'Test User',
      'cpsystem',
      '1345576425313536'
    );
    
    console.log(`[Turn ${i + 1}] 🤖 Bot:\n${reply}`);
  }
}

async function runAllTests() {
  // 1. Commercial RO Plant
  await simulateChat('Commercial RO Plant', '919811111001', [
    'RO plant bare puchna c',
    '1000 LPH da lagwana',
    'Kotkapura de pind ch lagwana',
    'TDS 1200 aunda bore da',
    'Kuldeep Singh'
  ]);

  // 2. Dairy Milk Chiller
  await simulateChat('Dairy Milk Chiller', '919811111002', [
    'chiller da rate dasso dairy waste',
    'daily 1500 litre doodh hunda morning evening',
    'single phase bijli hai te location Sri Muktsar Sahib',
    'Mandeep Brar'
  ]);

  // 3. 20L Camper Plant Setup (Village Business)
  await simulateChat('20L Camper Plant Business', '919811111003', [
    'asi pind ch 20 litre camper da pani supply da kam start karna, kinna kharcha aunda?',
    'koi sarkari loan ya subsidy mildi hai ispe?',
    'Moga kol pind hai, apne naam te loan lena',
    'Avtar Singh'
  ]);

  // 4. Cold Room
  await simulateChat('Commercial Cold Room', '919811111004', [
    'cold room banwana c',
    'dairy te paneer store karn waste 10x10 da',
    'Fazilka',
    'single phase bijli hai',
    'Gurpreet'
  ]);

  // 5. Commercial Heat Pump
  await simulateChat('Commercial Heat Pump', '919811111005', [
    'heat pump da ki rate hai?',
    'hotel waste chahida roz 5000 litre garam paani layi',
    'Jalandhar',
    'three phase connection hai',
    'Rohit Kumar'
  ]);

  // 6. Domestic / Home RO (Should decline politely)
  await simulateChat('Domestic / Home RO (Negative Test)', '919811111006', [
    'ghar layi kitchen ch chhota RO lagwana, kinne da miluga?',
    'tussi domestic nahi karde?'
  ]);

  // 7. Vague Rate List inquiry
  await simulateChat('Vague Inbound Inquiry', '919811111007', [
    'rate list bhejo',
    'plant di',
    'commercial ro'
  ]);
}

runAllTests().then(() => {
  console.log('\n============================================================');
  console.log('✅ All Product Simulations Complete.');
  console.log('============================================================');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
