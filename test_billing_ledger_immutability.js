const assert = require('assert');
const db = require('./db');

async function runBillingTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING BILLING LEDGER IMMUTABILITY & REVENUE DEFENSE SUITE 🧪');
  console.log('================================================================');

  const testTenant = 'test_billing_defense';
  const testPhone = '919999888877';
  const testMonth = '2026-10';

  try {
    // 1. Initial Billable Engagement Record
    console.log('\n--- TEST 1: Record Billable Broadcast Engagement ---');
    await db.recordBillableEngagement({
      tenantId: testTenant,
      leadPhone: testPhone,
      clientName: 'Test Dairy Farm',
      city: 'Moga',
      engagementType: 'BROADCAST',
      messagePreview: 'Special 10% Discount on 10 Ton Chiller'
    });

    const rows1 = await db.get('crm_billing_ledger', `tenant_id=eq.${testTenant}&lead_phone=eq.${testPhone}&billing_month=eq.${testMonth}`);
    assert.strictEqual(rows1.length, 1, 'Should have exactly 1 ledger record');
    assert.strictEqual(Number(rows1[0].rate_inr), 5.00, 'Rate should be 5.00 INR');
    assert.strictEqual(rows1[0].message_count, 1, 'Message count should be 1');
    assert.strictEqual(rows1[0].client_name, 'Test Dairy Farm', 'Client name should match');
    assert.strictEqual(rows1[0].city, 'Moga', 'City should match');
    console.log('✅ TEST 1 PASSED: Broadcast recorded at ₹5.00 flat rate.');

    // 2. Subsequent Messages to Same Head in Same Month (Flat Rate Defense)
    console.log('\n--- TEST 2: Multiple Follow-ups to Same Head in Same Month ---');
    await db.recordBillableEngagement({
      tenantId: testTenant,
      leadPhone: testPhone,
      clientName: 'Test Dairy Farm',
      city: 'Moga',
      engagementType: 'FOLLOWUP',
      messagePreview: 'Following up regarding quotation'
    });

    await db.recordBillableEngagement({
      tenantId: testTenant,
      leadPhone: testPhone,
      clientName: 'Test Dairy Farm',
      city: 'Moga',
      engagementType: 'OUTBOUND_BOT',
      messagePreview: 'Bot auto-response on specification'
    });

    const rows2 = await db.get('crm_billing_ledger', `tenant_id=eq.${testTenant}&lead_phone=eq.${testPhone}&billing_month=eq.${testMonth}`);
    assert.strictEqual(rows2.length, 1, 'Should STILL be exactly 1 unique billed head');
    assert.strictEqual(Number(rows2[0].rate_inr), 5.00, 'Rate must remain ₹5.00 flat');
    assert.strictEqual(rows2[0].message_count, 3, 'Message count should have incremented to 3');
    console.log('Channels logged:', rows2[0].channels);
    console.log('✅ TEST 2 PASSED: 3 messages sent to same client in month = STILL 1 Billed Head (₹5.00).');

    // 3. Lead Deletion Resistance (Zero Revenue Loss)
    console.log('\n--- TEST 3: Anti-Tamper & Lead Deletion Resistance ---');
    // Simulate lead created in crm_leads and then deleted
    await db.querySql(`
      INSERT INTO public.crm_leads (tenant_id, phone, name, requirement, city, is_deleted)
      VALUES ('${testTenant}', '${testPhone}', 'Test Dairy Farm', 'Chiller', 'Moga', false)
      ON CONFLICT (tenant_id, phone) DO UPDATE SET is_deleted = false;
    `);

    // Simulate client soft-deleting lead
    await db.querySql(`
      UPDATE public.crm_leads
      SET is_deleted = true, deleted_at = NOW()
      WHERE tenant_id = '${testTenant}' AND phone = '${testPhone}';
    `);

    // Check billing ledger
    const rows3 = await db.get('crm_billing_ledger', `tenant_id=eq.${testTenant}&lead_phone=eq.${testPhone}&billing_month=eq.${testMonth}`);
    assert.strictEqual(rows3.length, 1, 'Billing ledger record must NEVER be deleted');
    assert.strictEqual(Number(rows3[0].rate_inr), 5.00, 'Rate must remain intact');
    console.log('✅ TEST 3 PASSED: Lead was deleted in CRM, but Billing Ledger remained 100% intact with ₹5.00 preserved!');

    // 4. Multiple Unique Clients Aggregation
    console.log('\n--- TEST 4: Multi-Client Ledger Aggregation ---');
    const secondPhone = '919999888866';
    await db.recordBillableEngagement({
      tenantId: testTenant,
      leadPhone: secondPhone,
      clientName: 'Second Farm Agro',
      city: 'Bathinda',
      engagementType: 'BROADCAST',
      messagePreview: 'Diwali greeting broadcast'
    });

    const allTestRows = await db.get('crm_billing_ledger', `tenant_id=eq.${testTenant}&billing_month=eq.${testMonth}`);
    assert.strictEqual(allTestRows.length, 2, 'Should have exactly 2 distinct billed heads');
    const totalBilled = allTestRows.length * 5.00;
    assert.strictEqual(totalBilled, 10.00, 'Total bill should be ₹10.00 for 2 heads');
    console.log(`✅ TEST 4 PASSED: 2 unique heads aggregated to ₹${totalBilled.toFixed(2)}.`);

    // Cleanup test tenant data so production DB remains pristine
    await db.querySql(`DELETE FROM public.crm_billing_ledger WHERE tenant_id = '${testTenant}';`);
    await db.querySql(`DELETE FROM public.crm_leads WHERE tenant_id = '${testTenant}';`);
    console.log('🧹 Cleaned up test tenant records.');

    console.log('\n================================================================');
    console.log('🎉 ALL BILLING LEDGER TESTS PASSED WITH 100% SUCCESS! 🎉');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Billing Ledger Test Failed:', err);
    process.exit(1);
  }
}

runBillingTests();
