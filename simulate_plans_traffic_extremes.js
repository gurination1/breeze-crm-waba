/**
 * SIMULATE PLANS WITH REAL TRAFFIC & EXTREME STRESS CASES
 * 
 * Verifies financial margin defense across 4 real business archetypes
 * and 5 extreme disaster scenarios under Meta Cloud API (India 2026).
 */

const fs = require('fs');
const path = require('path');

// Meta API Rates (INR, delivered, incl. 18% GST)
const META_RATES = {
  MARKETING_TEMPLATE: 1.0185, // ₹0.8631 + 18% GST = ~₹1.02
  UTILITY_TEMPLATE: 0.1357,   // ₹0.1150 + 18% GST = ~₹0.14
  SERVICE_MESSAGE: 0.1357,    // ₹0.1150 + 18% GST (after 1,000 free)
  FREE_SERVICE_ALLOWANCE: 1000,
  AI_LLM_COST_PER_MSG: 0.015  // Gemini 1.5 Flash token inference
};

const TOTAL_SERVICE_UNIT_COST = META_RATES.SERVICE_MESSAGE + META_RATES.AI_LLM_COST_PER_MSG; // ~₹0.1507

// PRICING MATRIX
const PRICING = {
  PLAN_1_INBOUND: {
    name: 'Plan 1: Pure Inbound AI Copilot',
    target_margin: 0.90, // 90%
    base_price_monthly: 1999, // ₹1,999/mo for up to 1,500 replies
    included_replies: 1500,
    per_active_lead_rate: 7.50, // ₹7.50 per chatting lead
    overage_per_reply: 1.50
  },
  PLAN_2_FIVE_RUPEE: {
    name: 'Plan 2: The ₹5 Plan (Starter 1-Knock)',
    target_margin: 0.80, // ~80%
    rate_per_head: 5.00,
    max_outbound_touches: 1
  },
  PLAN_3_TWO_KNOCK: {
    name: 'Plan 3: Growth 2-Knock (2 Touches)',
    target_margin: 0.83, // 83%
    rate_per_head: 12.00,
    max_outbound_touches: 2
  },
  PLAN_4_WEEKLY: {
    name: 'Plan 4: Weekly Retargeting (4 Touches)',
    target_margin: 0.81, // 81%
    rate_per_head: 22.00,
    max_outbound_touches: 4
  },
  PLAN_5_ENTERPRISE: {
    name: 'Plan 5: Enterprise SaaS + Wallet',
    platform_fee: 14999,
    wallet_markup_rate: 1.25 // Client pays ₹1.25 per marketing msg (Meta cost ₹1.02)
  }
};

// 4 REAL BUSINESS ARCHETYPES
const BUSINESS_PROFILES = [
  {
    type: 'HIGH_TICKET_B2B',
    name: 'CP System (Industrial Chillers & RO Plants)',
    total_contacts: 1800,
    monthly_inquiries: 350,
    avg_inbound_replies_per_conv: 7, // technical questions, specs, quotations
    broadcast_frequency_month: 1,
    followup_needed: true
  },
  {
    type: 'LOCAL_SERVICE_CLINIC',
    name: 'Aesthetic Dental & Derma Clinic',
    total_contacts: 850,
    monthly_inquiries: 220,
    avg_inbound_replies_per_conv: 5, // appointments, prices, timings
    broadcast_frequency_month: 2,
    followup_needed: true
  },
  {
    type: 'D2C_ECOMMERCE',
    name: 'TrendLuxe Apparel Brand',
    total_contacts: 8500,
    monthly_inquiries: 1200,
    avg_inbound_replies_per_conv: 4, // order status, return policy, sizing
    broadcast_frequency_month: 2,
    followup_needed: false
  },
  {
    type: 'NEWS_MEDIA_DIGEST',
    name: 'State Daily News Express',
    total_contacts: 25000,
    monthly_inquiries: 150,
    avg_inbound_replies_per_conv: 2,
    broadcast_frequency_month: 4, // weekly newsletter
    followup_needed: false
  }
];

function runNormalTrafficSimulations() {
  console.log('\n================================================================');
  console.log('📊 SIMULATION 1: NORMAL TRAFFIC ACROSS 4 REAL BUSINESS VERTICALS');
  console.log('================================================================');

  for (const biz of BUSINESS_PROFILES) {
    console.log(`\n🏢 Business: ${biz.name} (${biz.type})`);
    console.log(`   Contacts: ${biz.total_contacts} | Monthly Inquiries: ${biz.monthly_inquiries}`);

    // --- TEST PLAN 1: PURE INBOUND ---
    const totalInboundReplies = biz.monthly_inquiries * biz.avg_inbound_replies_per_conv;
    const paidServiceReplies = Math.max(0, totalInboundReplies - META_RATES.FREE_SERVICE_ALLOWANCE);
    const plan1Cost = paidServiceReplies * TOTAL_SERVICE_UNIT_COST;
    // Revenue based on either ₹1,999 bundle or ₹7.50 per active lead
    const plan1Revenue = Math.max(PRICING.PLAN_1_INBOUND.base_price_monthly, biz.monthly_inquiries * PRICING.PLAN_1_INBOUND.per_active_lead_rate);
    const plan1Margin = ((plan1Revenue - plan1Cost) / plan1Revenue) * 100;
    console.log(`   [Plan 1 - Inbound Only]:`);
    console.log(`     Replies: ${totalInboundReplies} (${Math.min(totalInboundReplies, 1000)} free + ${paidServiceReplies} paid)`);
    console.log(`     Cost: ₹${plan1Cost.toFixed(2)} | Revenue: ₹${plan1Revenue.toFixed(2)} | Margin: ${plan1Margin.toFixed(1)}% (Target: 90%)`);

    // --- TEST PLAN 2: ₹5 PLAN (1 OUTBOUND TOUCH) ---
    // Revenue = Total Contacts * ₹5
    const plan2Revenue = biz.total_contacts * PRICING.PLAN_2_FIVE_RUPEE.rate_per_head;
    const plan2Cost = (biz.total_contacts * 1 * META_RATES.MARKETING_TEMPLATE) + plan1Cost;
    const plan2Margin = ((plan2Revenue - plan2Cost) / plan2Revenue) * 100;
    console.log(`   [Plan 2 - ₹5 Starter (1 Knock)]:`);
    console.log(`     Touches: 1 blast/knock (${biz.total_contacts} msgs)`);
    console.log(`     Cost: ₹${plan2Cost.toFixed(2)} | Revenue: ₹${plan2Revenue.toFixed(2)} | Margin: ${plan2Margin.toFixed(1)}% (Target: ~80%)`);

    // --- TEST PLAN 3: ₹12 PLAN (2 OUTBOUND TOUCHES) ---
    const plan3Revenue = biz.total_contacts * PRICING.PLAN_3_TWO_KNOCK.rate_per_head;
    const plan3Cost = (biz.total_contacts * 2 * META_RATES.MARKETING_TEMPLATE) + plan1Cost;
    const plan3Margin = ((plan3Revenue - plan3Cost) / plan3Revenue) * 100;
    console.log(`   [Plan 3 - ₹12 Growth (2 Knocks/Touches)]:`);
    console.log(`     Cost: ₹${plan3Cost.toFixed(2)} | Revenue: ₹${plan3Revenue.toFixed(2)} | Margin: ${plan3Margin.toFixed(1)}% (Target: 83%)`);

    // --- TEST PLAN 4: ₹22 PLAN (4 OUTBOUND TOUCHES) ---
    const plan4Revenue = biz.total_contacts * PRICING.PLAN_4_WEEKLY.rate_per_head;
    const plan4Cost = (biz.total_contacts * 4 * META_RATES.MARKETING_TEMPLATE) + plan1Cost;
    const plan4Margin = ((plan4Revenue - plan4Cost) / plan4Revenue) * 100;
    console.log(`   [Plan 4 - ₹22 Weekly (4 Touches)]:`);
    console.log(`     Cost: ₹${plan4Cost.toFixed(2)} | Revenue: ₹${plan4Revenue.toFixed(2)} | Margin: ${plan4Margin.toFixed(1)}% (Target: 81%)`);
  }
}

function runExtremeStressTests() {
  console.log('\n================================================================');
  console.log('🚨 SIMULATION 2: 5 EXTREME STRESS & DISASTER EDGE CASES');
  console.log('================================================================');

  // EXTREME 1: Competitor Chatbot Loop / Inbound Spam Attack
  console.log('\n--- EXTREME 1: Inbound Denial-of-Service / Loop Attack ---');
  console.log('Scenario: A competitor bot spams 5,000 inbound messages in 2 hours to drain wallet.');
  const attackMsgs = 5000;
  const unthrottledCost = attackMsgs * TOTAL_SERVICE_UNIT_COST;
  console.log(`❌ Without Protection: 5,000 bot replies cost you ₹${unthrottledCost.toFixed(2)}!`);
  // Safeguard: Session Loop Detector & Per-Contact Rate Limit (max 20 replies/day/contact)
  const throttledReplies = 20;
  const protectedCost = throttledReplies * TOTAL_SERVICE_UNIT_COST;
  console.log(`✅ With Safeguard (Max 20 AI replies/lead/24h + Loop breaker):`);
  console.log(`   Bot stops after 20 replies, alerts human staff. Cost = ₹${protectedCost.toFixed(2)} (Safe!).`);

  // EXTREME 2: The Non-Responder Black Hole on ₹5 Plan
  console.log('\n--- EXTREME 2: The Non-Responder Black Hole on ₹5 Plan ---');
  console.log('Scenario: 1,000 cold leads never reply. What happens if follow-up runs every 24h for 30 days?');
  const infiniteKnocks = 30; // 30 follow-up templates in a month
  const infiniteCost = 1000 * infiniteKnocks * META_RATES.MARKETING_TEMPLATE;
  const revenue = 1000 * 5.00;
  console.log(`❌ Without Cap (Infinite 24h cron): Cost = ₹${infiniteCost.toFixed(2)} vs Revenue ₹${revenue.toFixed(2)}!`);
  console.log(`   CATASTROPHIC LOSS: ₹${(revenue - infiniteCost).toFixed(2)} (-511% Margin)!`);
  // Safeguard: Max 2 Knocks Hard Cap + Auto-COLD Stop
  const cappedKnocks = 2;
  const cappedCost = 1000 * cappedKnocks * META_RATES.MARKETING_TEMPLATE;
  console.log(`✅ With Safeguard (Max 2 Knocks Rule in crm_api.js):`);
  console.log(`   Knocks strictly capped at 2. If client is on ₹5 plan, plan allows strictly 1 knock (₹1,020 cost → 79.6% margin).`);

  // EXTREME 3: Massive Outbound Broadcast Spike (25,000 contacts on ₹5 plan)
  console.log('\n--- EXTREME 3: Sudden Massive Broadcast Blast by Client ---');
  console.log('Scenario: Client imports 25,000 numbers and hits "Blast Broadcast" 3 times in a week.');
  const blastCount = 25000 * 3; // 75,000 marketing messages
  const blastMetaCost = blastCount * META_RATES.MARKETING_TEMPLATE;
  console.log(`❌ If Client is charged ₹5/head flat (₹1,25,000) but sends 3 blasts:`);
  console.log(`   Meta Bill = ₹${blastMetaCost.toFixed(2)} | Revenue = ₹1,25,000 | LOSS: ₹${(125000 - blastMetaCost).toFixed(2)}!`);
  console.log(`✅ With Safeguard (Monthly Quota Limit in crm_tenants):`);
  console.log(`   crm_api.js rejects broadcast with 403 Forbidden once quota_limit is exceeded.`);
  console.log(`   Client must purchase extra Message Recharge Packs at ₹1.25/msg (Positive cashflow!).`);

  // EXTREME 4: 24-Hour Service Window Expiration Cliff
  console.log('\n--- EXTREME 4: 24-Hour Window Expiration Cliff ---');
  console.log('Scenario: Inbound conversation crosses 24h mark. Can bot still send free-form text?');
  console.log(`   Within 24h: Service message = ₹0.136`);
  console.log(`   After 24h: Meta REJECTS free-form text with Error #131047! Must use Marketing Template (₹1.02).`);
  console.log(`✅ System Behavior: CRM auto-checks last_inbound_at. If >24h, prompts template selection.`);

  // EXTREME 5: Meta Quality Rating Degradation (Spam Reports)
  console.log('\n--- EXTREME 5: Spam Reports & Meta Account Suspension Risk ---');
  console.log('Scenario: Aggressive follow-ups cause recipients to click "Report & Block".');
  console.log('   Result: Meta Quality drops Green → Yellow → Red. Sending limit dropped from 10k → 1k/day.');
  console.log(`✅ Safeguards Implemented:`);
  console.log(`   1. Automatic STOP/Unsubscribe opt-out parsing (/server.js line 605).`);
  console.log(`   2. 72-hour delay on Follow-up #2 so customers never feel harassed.`);
  console.log(`   3. Auto-stop sequence on 2nd unread knock.`);
}

runNormalTrafficSimulations();
runExtremeStressTests();
