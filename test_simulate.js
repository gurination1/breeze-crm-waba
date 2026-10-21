const ai = require('./ai_engine');
const whatsapp = require('./whatsapp_api');
const config = require('./config');

async function testPipeline() {
  console.log('--- Testing Enterprise WABA AI Engine ---');

  const testPhone = '919041172159';
  const testQuery = 'Hi, hume clinic ke liye WhatsApp bot aur appointment booking system chahiye. Kya charges aur timeline hai?';

  console.log(`\nSimulating User Message from ${testPhone}: "${testQuery}"`);
  console.log('Generating AI response with Gemini Enterprise Prompt...');
  
  const startTime = Date.now();
  const reply = await ai.generateAIReply(testPhone, testQuery, 'Gurdharam');
  const elapsed = Date.now() - startTime;

  console.log(`\n✅ Generated AI Reply in ${elapsed}ms:`);
  console.log('----------------------------------------------------');
  console.log(reply);
  console.log('----------------------------------------------------');

  // Dispatch live WhatsApp message to verify real delivery
  console.log(`\nDispatching actual live WhatsApp Cloud API message to ${testPhone}...`);
  try {
    const res = await whatsapp.sendTextMessage(config.DEFAULT_PHONE_ID, testPhone, reply);
    console.log(`✅ Live Message Sent Successfully!`);
    console.log(`WAMID:`, res.messages?.[0]?.id);
  } catch (err) {
    console.error('❌ Live dispatch error:', err.message);
  }
}

testPipeline();
