const ai = require('./ai_engine');
const memory = require('./memory');

async function runDeepCritique() {
  console.log("====================================================");
  console.log("   DEEP CHAT SIMULATION & BRUTAL CRITIQUE ENGINE   ");
  console.log("====================================================\n");

  let totalTurns = 0;
  let passedCritique = 0;
  let failedCritique = 0;

  function critique(turnDesc, botReply, rules) {
    totalTurns++;
    const text = Array.isArray(botReply) ? botReply.join(" | ") : botReply;
    console.log(`🤖 Bot Reply: "${text}"`);

    let passed = true;
    for (const r of rules) {
      if (r.type === 'FORBIDDEN_REGEX' && r.regex.test(text)) {
        console.error(`❌ FAILED CRITIQUE [${r.desc}]: Found "${text.match(r.regex)[0]}"`);
        passed = false;
      }
      if (r.type === 'REQUIRED_REGEX' && !r.regex.test(text)) {
        console.error(`❌ FAILED CRITIQUE [${r.desc}]: Did not match expected pattern`);
        passed = false;
      }
    }

    if (passed) {
      console.log(`✅ PASSED: All critique rules satisfied.`);
      passedCritique++;
    } else {
      failedCritique++;
    }
  }

  // --- JOURNEY 1: The Heat Pump Journey (User's Exact WhatsApp Failure Case) ---
  console.log("\n>>> JOURNEY 1: Heat Pump Inquiry (Testing Zero Unprompted Pricing & Zero Fake Numbers)");
  const phone1 = "919999000001";
  memory.clearHistory(phone1, "cpsystem");

  console.log("\n👤 Customer Turn 1: 'Spelling mistake c mnu heat pump hi chahida'");
  let reply = await ai.handleCpSystemInteraction(phone1, "Spelling mistake c mnu heat pump hi chahida", "TestUser", "cpsystem");
  critique("Heat pump turn 1", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /₹\s*[\d,]+/, desc: 'No unprompted price' },
    { type: 'REQUIRED_REGEX', regex: /heat\s*pump/i, desc: 'Mentions heat pump' }
  ]);
  memory.addMessage(phone1, "user", "Spelling mistake c mnu heat pump hi chahida", "cpsystem");
  memory.addMessage(phone1, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 2: '50 liter'");
  reply = await ai.handleCpSystemInteraction(phone1, "50 liter", "TestUser", "cpsystem");
  critique("Heat pump turn 2 (Capacity answered)", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /₹\s*[\d,]+/, desc: 'CRITICAL: No fake price! (e.g. ₹25,000)' },
    { type: 'FORBIDDEN_REGEX', regex: /25\s*,?000/, desc: 'CRITICAL: No hallucinated 25000' },
    { type: 'FORBIDDEN_REGEX', regex: /ghar\s*layi/i, desc: 'No unprompted kitchen/home assumption' },
    { type: 'REQUIRED_REGEX', regex: /\?/, desc: 'Must ask consultative question' }
  ]);

  // --- JOURNEY 2: RO Plant Inquiry From Scratch ---
  console.log("\n>>> JOURNEY 2: Commercial RO Plant Ladder");
  const phone2 = "919999000002";
  memory.clearHistory(phone2, "cpsystem");

  console.log("\n👤 Customer Turn 1: 'Ro bare puchna'");
  reply = await ai.handleCpSystemInteraction(phone2, "Ro bare puchna", "TestUser", "cpsystem");
  critique("RO Turn 1", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /poori\s*jankari/i, desc: 'No glazing (poori jankari)' },
    { type: 'FORBIDDEN_REGEX', regex: /pind\s*vich\s*shuru/i, desc: 'No premature location question' },
    { type: 'FORBIDDEN_REGEX', regex: /₹/, desc: 'No unprompted price' },
    { type: 'REQUIRED_REGEX', regex: /keda\s*ro/i, desc: 'Asks what kind of RO' }
  ]);
  memory.addMessage(phone2, "user", "Ro bare puchna", "cpsystem");
  memory.addMessage(phone2, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 2: '20L camper cans supply da camper plant lagwana'");
  reply = await ai.handleCpSystemInteraction(phone2, "20L camper cans supply da camper plant lagwana", "TestUser", "cpsystem");
  critique("RO Turn 2 (Camper specified)", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /₹\s*[\d,]+/, desc: 'No unprompted price dumping' },
    { type: 'REQUIRED_REGEX', regex: /pind.*shehar|shehar.*pind/i, desc: 'Now asks location (pind or shehar)' }
  ]);
  memory.addMessage(phone2, "user", "20L camper cans supply da camper plant lagwana", "cpsystem");
  memory.addMessage(phone2, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 3: 'pind vich'");
  reply = await ai.handleCpSystemInteraction(phone2, "pind vich", "TestUser", "cpsystem");
  critique("RO Turn 3 (Pind answered)", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /shehar\s*vich/i, desc: 'Never ask location again' },
    { type: 'REQUIRED_REGEX', regex: /3-phase|bijli/i, desc: 'Asks 3-phase electricity question' }
  ]);
  memory.addMessage(phone2, "user", "pind vich", "cpsystem");
  memory.addMessage(phone2, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 4: 'camper plant da kharcha kinna aunda?' (Explicitly Asking Price)");
  reply = await ai.handleCpSystemInteraction(phone2, "camper plant da kharcha kinna aunda?", "TestUser", "cpsystem");
  critique("RO Turn 4 (Asking Price)", reply, [
    { type: 'REQUIRED_REGEX', regex: /3,70,000|3\.70|Karan/i, desc: 'Mentions 3,70,000 or Karan Sir custom quote' }
  ]);

  // --- JOURNEY 3: Chiller Inquiry Without Asking Price First ---
  console.log("\n>>> JOURNEY 3: Chiller Inquiry (No Price When Not Asked)");
  const phone3 = "919999000003";
  memory.clearHistory(phone3, "cpsystem");

  console.log("\n👤 Customer Turn 1: 'Chiller chahida hai'");
  reply = await ai.handleCpSystemInteraction(phone3, "Chiller chahida hai", "TestUser", "cpsystem");
  critique("Chiller Turn 1", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /₹/, desc: 'No unprompted price' },
    { type: 'REQUIRED_REGEX', regex: /kaam|setup|kedi|keda|chiller/i, desc: 'Asks application or chiller type' }
  ]);
  memory.addMessage(phone3, "user", "Chiller chahida hai", "cpsystem");
  memory.addMessage(phone3, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 2: 'dairy cooling waste 2 ton'");
  reply = await ai.handleCpSystemInteraction(phone3, "dairy cooling waste 2 ton", "TestUser", "cpsystem");
  critique("Chiller Turn 2 (Capacity specified, Price NOT asked)", reply, [
    { type: 'FORBIDDEN_REGEX', regex: /₹\s*80,000|₹\s*94,400/, desc: 'DO NOT dump price when not asked!' },
    { type: 'REQUIRED_REGEX', regex: /\?/, desc: 'Asks consultative follow up' }
  ]);
  memory.addMessage(phone3, "user", "dairy cooling waste 2 ton", "cpsystem");
  memory.addMessage(phone3, "model", Array.isArray(reply) ? reply.join(" ") : reply, "cpsystem");

  console.log("\n👤 Customer Turn 3: '2 ton chiller da rate ki hai?' (Explicitly Asked Price)");
  reply = await ai.handleCpSystemInteraction(phone3, "2 ton chiller da rate ki hai?", "TestUser", "cpsystem");
  critique("Chiller Turn 3 (Price explicitly asked)", reply, [
    { type: 'REQUIRED_REGEX', regex: /80,000/, desc: 'Quotes official ₹80,000' },
    { type: 'REQUIRED_REGEX', regex: /18%\s*gst/i, desc: 'Mentions 18% GST' }
  ]);

  console.log("\n====================================================");
  console.log(`CRITIQUE SUMMARY: ${passedCritique}/${totalTurns} turns passed.`);
  console.log("====================================================");

  if (failedCritique > 0) {
    console.error(`❌ ${failedCritique} turns FAILED critique.`);
    process.exit(1);
  } else {
    console.log("🎉 ALL TURNS PERFECTLY ALIGNED WITH RULES & BLUEPRINT!");
    process.exit(0);
  }
}

runDeepCritique().catch(e => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
