const db = require('./db');

async function migrateExclusiveCpSystem() {
  console.log('🚀 [Migration] Making CP System CRM 100% exclusive for +91 97792 20581...');

  // 1. Numbers belonging to Karan's old line (99157 30338) that were logged under cpsystem
  const oldPersonalPhones = [
    '917657985701', // Baba Deep Singh Ji
    '918289000505', // SANDHU
    '919501313587', // Amrit Gill
    '919888224325', // Amrit Bhangu
    '919915775419', // Navjot Singh
    '916280273749', // Gold Prince
    '917009109306', // Akku worker
    '917657917901', // Client on 30338
    '919872936991'  // Neetu
  ];

  for (const phone of oldPersonalPhones) {
    const rawClean = phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
    // Migrate leads
    await db.update('crm_leads', {
      tenant_id: 'disconnected_30338',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: 'Exclusive 9779220581 Purge'
    }, `tenant_id=eq.cpsystem&phone=in.(${phone},${rawClean},91${rawClean})`);

    // Migrate messages
    await db.update('crm_messages', {
      tenant_id: 'disconnected_30338',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: 'Exclusive 9779220581 Purge'
    }, `tenant_id=eq.cpsystem&lead_phone=in.(${phone},${rawClean},91${rawClean})`);

    console.log(`✅ Migrated personal contact ${phone} to disconnected_30338`);
  }

  // 2. WhatsApp Official Channel Spam (919999041935)
  await db.update('crm_leads', {
    tenant_id: 'spam_archive',
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: 'Spam Filter'
  }, `tenant_id=eq.cpsystem&phone=like.*9999041935*`);
  await db.update('crm_messages', {
    tenant_id: 'spam_archive',
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: 'Spam Filter'
  }, `tenant_id=eq.cpsystem&lead_phone=like.*9999041935*`);
  console.log('✅ Migrated WhatsApp broadcast spam (919999041935) to spam_archive');

  // 3. Move Mystery DeMysters (916280834006) to mystery tenant
  await db.update('crm_leads', {
    tenant_id: 'mystery',
    is_deleted: true
  }, `tenant_id=eq.cpsystem&phone=like.*6280834006*`);
  await db.update('crm_messages', {
    tenant_id: 'mystery',
    is_deleted: true
  }, `tenant_id=eq.cpsystem&lead_phone=like.*6280834006*`);
  console.log('✅ Moved 916280834006 to mystery tenant');

  // 4. Test dummy leads from development
  const testPhones = [
    '919999999999', '919876543213', '919876543212', '919876543211',
    '919876534329', '919876527727', '919876568764', '919876531341',
    '919876536089', '919999988888', '919555555555', '919444444444',
    '919222222222', '919333333333', '919111111111', '919876543210',
    '919041334006', '7658020086', '919779630338', '919888877777'
  ];

  for (const phone of testPhones) {
    const rawClean = phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
    await db.update('crm_leads', {
      tenant_id: 'test_archive',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: 'Test Lead Cleanup'
    }, `tenant_id=eq.cpsystem&phone=in.(${phone},${rawClean},91${rawClean})`);

    await db.update('crm_messages', {
      tenant_id: 'test_archive',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: 'Test Lead Cleanup'
    }, `tenant_id=eq.cpsystem&lead_phone=in.(${phone},${rawClean},91${rawClean})`);
  }
  console.log('✅ Migrated test dummy numbers to test_archive');

  // 5. Clean crm_saved_contacts under cpsystem
  const removedSavedContacts = ['919915775419', '916280273749', '919041334006', '919779630338', '919876543210', '916280834006'];
  for (const p of removedSavedContacts) {
    const rawClean = p.startsWith('91') && p.length === 12 ? p.slice(2) : p;
    await db.del('crm_saved_contacts', `tenant_id=eq.cpsystem&phone=in.(${p},${rawClean})`);
  }
  console.log('✅ Cleaned obsolete contacts from crm_saved_contacts');

  // 6. Fix name of 917009091075 from emoji '🤑' to 'Harpreet (Muktsar)'
  await db.update('crm_leads', {
    name: 'Harpreet (Muktsar)',
    whatsapp_profile_name: 'Harpreet',
    city: 'Muktsar',
    requirement: '1000 LPH RO camper plant',
    status: 'IN_PROGRESS'
  }, `tenant_id=eq.cpsystem&phone=like.*7009091075*`);
  console.log('✅ Cleaned lead 917009091075 name to "Harpreet (Muktsar)"');

  // 7. Verify remaining cpsystem leads
  const remaining = await db.get('crm_leads', 'tenant_id=eq.cpsystem&is_deleted=neq.true');
  console.log(`\n🎉 Verification: CP System CRM now has ${remaining.length} exclusive active leads:`);
  remaining.forEach(l => console.log(`  +${l.phone} | ${l.name} | ${l.requirement} | ${l.city || 'Punjab'}`));
}

migrateExclusiveCpSystem().then(() => {
  console.log('Migration completed successfully.');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
