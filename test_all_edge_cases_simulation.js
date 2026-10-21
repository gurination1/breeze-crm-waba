/**
 * Comprehensive Edge-Case Simulation Suite for CP System
 * Tests:
 * 1. Qualified Sales Lead -> Sent ONLY to Karan Singh (+91 99157 30338), NEVER to user (+91 90411 72159).
 * 2. Customer Complaint -> Sent to User (+91 90411 72159) AND Karan Singh with Subject & Special Note.
 * 3. Machine Repair Request -> Sent to User (+91 90411 72159) AND Karan Singh with Subject & Special Note.
 * 4. General Inquiry: Dealership -> Sent to User (+91 90411 72159) with Subject: Dealership Inquiry.
 * 5. General Inquiry: Job Application -> Sent to User (+91 90411 72159) with Subject: Job Application.
 * 6. General Inquiry: Billing/Invoice -> Sent to User (+91 90411 72159) with Subject: Billing Query.
 * 7. Anti-Spam De-duplication -> Subsequent messages in same state do NOT re-fire duplicate notifications.
 * 8. Unqualified Prospect -> No premature alerts fired to anyone.
 */

const ai = require('./ai_engine');
const config = require('./config');
const db = require('./db');
const memory = require('./memory');
const whatsapp = require('./whatsapp_api');

async function runEdgeCasesSimulation() {
  console.log('================================================================');
  console.log('🧪 RUNNING CP SYSTEM NOTIFICATION & ROUTING EDGE CASE SUITE 🧪');
  console.log('================================================================\n');

  // Clean test lead records from Supabase DB to ensure fresh evaluation
  try {
    const testPhones = [
      '919876543201', '919876543202', '919876543203', '919876543204',
      '919876543205', '919876543206', '919876543207', '919876543208'
    ];
    await db.del('crm_leads', `phone=in.(${testPhones.join(',')})`);
    await db.del('crm_messages', `lead_phone=in.(${testPhones.join(',')})`);
  } catch (e) {}

  // Intercept whatsapp messages to record all dispatched alerts
  const dispatchedAlerts = [];
  const originalSendText = whatsapp.sendTextMessage;
  const originalSendTemplate = whatsapp.sendTemplateMessage;

  whatsapp.sendTextMessage = async (phoneId, to, text) => {
    dispatchedAlerts.push({ method: 'TEXT', phoneId, to, text, timestamp: Date.now() });
    return { messages: [{ id: 'mock_wamid_' + Date.now() }] };
  };

  whatsapp.sendTemplateMessage = async (phoneId, to, templateName, languageCode, components) => {
    dispatchedAlerts.push({ method: 'TEMPLATE', phoneId, to, templateName, components, timestamp: Date.now() });
    return { messages: [{ id: 'mock_tpl_wamid_' + Date.now() }] };
  };

  const results = [];
  const delay = ms => new Promise(res => setTimeout(res, ms));

  try {
    // -------------------------------------------------------------
    // EDGE CASE 1: QUALIFIED SALES LEAD
    // -------------------------------------------------------------
    console.log('--- TEST 1: Qualified Sales Lead Routing ---');
    dispatchedAlerts.length = 0;
    const phoneLead = '919876543201';
    memory.clearHistory(phoneLead, 'cpsystem');

    // Simulate multi-turn qualification
    await ai.generateAIReply(phoneLead, 'Sat Sri Akal ji, main Bathinda to Jaswant Singh bol reha haan. 1000 LPH RO plant lagwana hai.', 'Jaswant Singh', 'cpsystem');
    await ai.generateAIReply(phoneLead, 'Canal da paani hai veere, TDS lagbhag 500 hai te 3-phase bijli connection hai. 20 litre camper bottles bharne ne. Site visit schedule karo.', 'Jaswant Singh', 'cpsystem');

    const leadAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const sentToAdmin = leadAlerts.some(a => a.to.includes('9041172159'));
    const sentToKaran = leadAlerts.some(a => a.to.includes('9915730338'));

    const test1Pass = sentToKaran && !sentToAdmin;
    console.log(`Dispatched to: ${leadAlerts.map(a => a.to).join(', ') || 'None'}`);
    console.log(`Sent to Karan Singh (99157 30338): ${sentToKaran ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Admin User (90411 72159): ${sentToAdmin ? '❌ VIOLATION (Sent to admin)' : '✅ CLEAN (Never sent to user)'}`);
    results.push({ name: '1. Qualified Sales Lead Routing', passed: test1Pass });

    // -------------------------------------------------------------
    // EDGE CASE 2: CUSTOMER COMPLAINT
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Customer Complaint Alert ---');
    dispatchedAlerts.length = 0;
    const phoneComplaint = '919876543202';
    memory.clearHistory(phoneComplaint, 'cpsystem');

    const compReply = await ai.generateAIReply(
      phoneComplaint,
      'Pichle saal 5 Ton chiller lagwaya si Muktsar to, ohda compressor trip kar reha te cooling nahi kar reha. Bahut doodh kharab ho reha hai, turant complaint note karo!',
      'Gurinder Dairy',
      'cpsystem'
    );
    console.log('Bot Response:', compReply);

    const compAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const compToAdmin = compAlerts.some(a => a.to.includes('9041172159'));
    const compToKaran = compAlerts.some(a => a.to.includes('9915730338'));
    const compHasSubject = compAlerts.some(a => a.text.includes('Subject') || a.text.includes('COMPLAINT'));

    const test2Pass = compToAdmin && compToKaran && compHasSubject;
    console.log(`Complaint alerts sent to: ${compAlerts.map(a => a.to).join(', ')}`);
    console.log(`Alert Content Sample:\n${compAlerts[0]?.text.slice(0, 180)}...\n`);
    console.log(`Sent to Admin User: ${compToAdmin ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Karan Singh: ${compToKaran ? '✅ YES' : '❌ NO'}`);
    results.push({ name: '2. Customer Complaint Alert', passed: test2Pass });

    // -------------------------------------------------------------
    // EDGE CASE 3: REPAIR & MAINTENANCE
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Repair & Maintenance Service Alert ---');
    dispatchedAlerts.length = 0;
    const phoneRepair = '919876543203';
    memory.clearHistory(phoneRepair, 'cpsystem');

    const repReply = await ai.generateAIReply(
      phoneRepair,
      'Hamare RO plant ki 4040 membrane aur high pressure pump ka seal leak kar raha hai. Patiala mein technician bhej kar service repair karwana hai.',
      'Sukhdev Singh',
      'cpsystem'
    );
    console.log('Bot Response:', repReply);

    const repAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const repToAdmin = repAlerts.some(a => a.to.includes('9041172159'));
    const repToKaran = repAlerts.some(a => a.to.includes('9915730338'));
    const repHasSubject = repAlerts.some(a => a.text.includes('REPAIR') || a.text.includes('Repair'));

    const test3Pass = repToAdmin && repToKaran && repHasSubject;
    console.log(`Repair alerts sent to: ${repAlerts.map(a => a.to).join(', ')}`);
    console.log(`Alert Content Sample:\n${repAlerts[0]?.text.slice(0, 180)}...\n`);
    console.log(`Sent to Admin User: ${repToAdmin ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Karan Singh: ${repToKaran ? '✅ YES' : '❌ NO'}`);
    results.push({ name: '3. Repair & Maintenance Request', passed: test3Pass });

    // -------------------------------------------------------------
    // EDGE CASE 4: GENERAL INQUIRY - DEALERSHIP / FRANCHISE
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: General Inquiry (Dealership / Franchise) ---');
    dispatchedAlerts.length = 0;
    const phoneDealer = '919876543204';
    memory.clearHistory(phoneDealer, 'cpsystem');

    const dealerReply = await ai.generateAIReply(
      phoneDealer,
      'Sat Sri Akal ji, main Amritsar aur Gurdaspur area vich CP System di dealership aur distributorship lena chahunda haan. Ki process hai?',
      'Raman Preet',
      'cpsystem'
    );
    console.log('Bot Response:', dealerReply);

    const dealerAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const dealerToAdmin = dealerAlerts.some(a => a.to.includes('9041172159'));
    const dealerSubject = dealerAlerts.some(a => a.text.includes('Dealership') || a.text.includes('Subject'));
    const dealerNote = dealerAlerts.some(a => a.text.includes('Special Note'));

    const test4Pass = dealerToAdmin && dealerSubject && dealerNote;
    console.log(`Dealer alert sent to: ${dealerAlerts.map(a => a.to).join(', ')}`);
    console.log(`Alert Content Sample:\n${dealerAlerts[0]?.text.slice(0, 200)}...\n`);
    console.log(`Subject Included: ${dealerSubject ? '✅ YES' : '❌ NO'}`);
    console.log(`Special Note Included: ${dealerNote ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Admin User: ${dealerToAdmin ? '✅ YES' : '❌ NO'}`);
    results.push({ name: '4. General Inquiry: Dealership', passed: test4Pass });

    // -------------------------------------------------------------
    // EDGE CASE 5: GENERAL INQUIRY - JOB APPLICATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: General Inquiry (Job Application) ---');
    dispatchedAlerts.length = 0;
    const phoneJob = '919876543205';
    memory.clearHistory(phoneJob, 'cpsystem');

    const jobReply = await ai.generateAIReply(
      phoneJob,
      'Sir maine ITI refrigeration and air conditioning kiya hua hai, kya Muktsar factory mein AC technician ya plant assembly ki koi job vacancy hai?',
      'Manpreet Sharma',
      'cpsystem'
    );
    console.log('Bot Response:', jobReply);

    const jobAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const jobToAdmin = jobAlerts.some(a => a.to.includes('9041172159'));
    const jobSubject = jobAlerts.some(a => a.text.includes('Job') || a.text.includes('Career') || a.text.includes('Subject'));

    const test5Pass = jobToAdmin && jobSubject;
    console.log(`Job alert sent to: ${jobAlerts.map(a => a.to).join(', ')}`);
    console.log(`Subject Included: ${jobSubject ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Admin User: ${jobToAdmin ? '✅ YES' : '❌ NO'}`);
    results.push({ name: '5. General Inquiry: Job Application', passed: test5Pass });

    // -------------------------------------------------------------
    // EDGE CASE 6: GENERAL INQUIRY - BILLING / INVOICE QUERY
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: General Inquiry (Billing / Invoice Query) ---');
    dispatchedAlerts.length = 0;
    const phoneBill = '919876543206';
    memory.clearHistory(phoneBill, 'cpsystem');

    const billReply = await ai.generateAIReply(
      phoneBill,
      'Hamara chiller dispatch hua tha pichle hafte, uska GST tax invoice aur transport bilti bill share kar dijiye.',
      'Sharma Industries',
      'cpsystem'
    );
    console.log('Bot Response:', billReply);

    const billAlerts = dispatchedAlerts.filter(a => a.method === 'TEXT');
    const billToAdmin = billAlerts.some(a => a.to.includes('9041172159'));
    const billSubject = billAlerts.some(a => a.text.includes('Bill') || a.text.includes('Invoice') || a.text.includes('Accounts') || a.text.includes('Subject'));

    const test6Pass = billToAdmin && billSubject;
    console.log(`Bill alert sent to: ${billAlerts.map(a => a.to).join(', ')}`);
    console.log(`Subject Included: ${billSubject ? '✅ YES' : '❌ NO'}`);
    console.log(`Sent to Admin User: ${billToAdmin ? '✅ YES' : '❌ NO'}`);
    results.push({ name: '6. General Inquiry: Billing / Invoice', passed: test6Pass });

    // -------------------------------------------------------------
    // EDGE CASE 7: ANTI-SPAM DE-DUPLICATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Anti-Spam De-Duplication on Subsequent Messages ---');
    dispatchedAlerts.length = 0;
    // Customer sends another follow-up message on the same complaint thread
    await ai.generateAIReply(
      phoneComplaint,
      'Main call kar raha tha, phone nahi uthaya kisine. Jaldi batao kab tak aayega technician?',
      'Gurinder Dairy',
      'cpsystem'
    );

    const spamCount = dispatchedAlerts.filter(a => a.method === 'TEXT').length;
    const test7Pass = spamCount === 0;
    console.log(`Subsequent message alerts triggered: ${spamCount}`);
    console.log(`De-duplication active: ${test7Pass ? '✅ PASS (Zero duplicate spam)' : '❌ FAIL'}`);
    results.push({ name: '7. Anti-Spam De-duplication', passed: test7Pass });

    // -------------------------------------------------------------
    // EDGE CASE 8: UNQUALIFIED CHAT IN PROGRESS (PROSPECTING)
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Unqualified Initial Chat (No False Alerts) ---');
    dispatchedAlerts.length = 0;
    const phoneProspect = '919876543208';
    memory.clearHistory(phoneProspect, 'cpsystem');

    await ai.generateAIReply(phoneProspect, 'Sat Sri Akal ji, machine baare dasso', 'Aman', 'cpsystem');
    const prospectAlertCount = dispatchedAlerts.filter(a => a.method === 'TEXT').length;
    const test8Pass = prospectAlertCount === 0;
    console.log(`Alerts fired on greeting: ${prospectAlertCount}`);
    console.log(`No premature alert: ${test8Pass ? '✅ PASS' : '❌ FAIL'}`);
    results.push({ name: '8. Unqualified Prospect (No false alert)', passed: test8Pass });

  } finally {
    // Restore original functions
    whatsapp.sendTextMessage = originalSendText;
    whatsapp.sendTemplateMessage = originalSendTemplate;
  }

  console.log('\n================================================================');
  console.log('📊 SIMULATION SUMMARY 📊');
  console.log('================================================================');
  let allPassed = true;
  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.name}: ${r.passed ? 'PASSED' : 'FAILED'}`);
    if (!r.passed) allPassed = false;
  }
  console.log('================================================================');
  console.log(`Result: ${allPassed ? '🎉 ALL 8 EDGE CASES PASSED PERFECTLY!' : '⚠️ SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

runEdgeCasesSimulation().catch(err => {
  console.error('Simulation crash:', err);
  process.exit(1);
});
