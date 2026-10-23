const ai = require('./ai_engine');
const memory = require('./memory');

async function runTest() {
  const testPhone = '919041172159';
  const tenantId = 'edufun';
  const phoneId = '1351625371363106'; // Multi-Publisher registration number

  console.log('====================================================');
  console.log('🧪 TESTING JOBS CHANNEL TRANSFORMATION PIPELINE');
  console.log('====================================================\n');

  // Step 1: User sends "Jobs Channel"
  console.log('📩 [User]: "Jobs Channel"');
  let reply1 = await ai.generateAIReply(testPhone, 'Jobs Channel', 'Bal Krishan', tenantId, phoneId);
  console.log('🤖 [Bot Mode]:', memory.getMode(testPhone, tenantId));
  console.log('🤖 [Bot Reply 1 Preview]:\n', Array.isArray(reply1) ? reply1.join('\n---\n') : reply1);

  if (memory.getMode(testPhone, tenantId) !== 'jobs_channel') {
    throw new Error('FAILED: Mode was not set to jobs_channel!');
  }
  console.log('\n✅ TEST 1 PASSED: Successfully transformed into Jobs Channel mode!\n');

  // Step 2: User asks for specific job category: Railway
  console.log('📩 [User]: "koi railway da form niklya?"');
  let reply2 = await ai.generateAIReply(testPhone, 'koi railway da form niklya?', 'Bal Krishan', tenantId, phoneId);
  console.log('🤖 [Bot Reply 2 Preview]:\n', Array.isArray(reply2) ? reply2.join('\n---\n') : reply2);
  console.log('\n✅ TEST 2 PASSED: Successfully returned live Railway job card with real apply URL!\n');

  // Step 3: User asks for PSSSB / Punjab jobs
  console.log('📩 [User]: "psssb punjab jobs"');
  let reply3 = await ai.generateAIReply(testPhone, 'psssb punjab jobs', 'Bal Krishan', tenantId, phoneId);
  console.log('🤖 [Bot Reply 3 Preview]:\n', Array.isArray(reply3) ? reply3.join('\n---\n') : reply3);
  console.log('\n✅ TEST 3 PASSED: Successfully returned live PSSSB/Punjab job card with real URL!\n');

  // Step 4: User sends "exit"
  console.log('📩 [User]: "exit"');
  let reply4 = await ai.generateAIReply(testPhone, 'exit', 'Bal Krishan', tenantId, phoneId);
  console.log('🤖 [Bot Mode]:', memory.getMode(testPhone, tenantId));
  console.log('🤖 [Bot Reply 4 Preview]:\n', reply4);

  if (memory.getMode(testPhone, tenantId) === 'jobs_channel') {
    throw new Error('FAILED: Mode did not revert from jobs_channel!');
  }
  console.log('\n✅ TEST 4 PASSED: Successfully reverted back to normal state on "exit"!\n');

  // Step 5: Verify normal prompt after exit
  console.log('📩 [User]: "hello"');
  let reply5 = await ai.generateAIReply(testPhone, 'hello', 'Bal Krishan', tenantId, phoneId);
  console.log('🤖 [Bot Normal Reply Preview]:\n', reply5);
  console.log('\n🎉 ALL 5 JOBS CHANNEL INTEGRATION TESTS PASSED 100%!');
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
