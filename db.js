const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000
});

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uejeoznlhfqsyknoleib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlamVvem5saGZxc3lrbm9sZWliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTcyNjAyOCwiZXhwIjoyMTA3MzAyMDI4fQ.6r0FOb7QbpSstcR4Hqgs1dkJh07Hfyw_RvMt3E2AwaA';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'sbp_42ace3aee6dbbb909d8b808f10a6dbbbe2becaa3';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'uejeoznlhfqsyknoleib';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

async function querySql(sql) {
  try {
    const res = await axios.post(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      { query: sql },
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 10000
      }
    );
    return res.data;
  } catch (err) {
    console.error('[DB Query Error]', err.response?.data || err.message);
    throw err;
  }
}

async function get(table, queryParams = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
  const res = await axios.get(url, { headers, httpsAgent, timeout: 8000 });
  return res.data;
}

async function insert(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await axios.post(url, data, { headers, httpsAgent, timeout: 8000 });
  return res.data;
}

async function update(table, data, queryParams) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
  const res = await axios.patch(url, data, { headers, httpsAgent, timeout: 8000 });
  return res.data;
}

async function del(table, queryParams) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams}`;
  const res = await axios.delete(url, { headers, httpsAgent, timeout: 8000 });
  return res.data;
}

// Log audit action
async function logAudit(actorUsername, actorRole, tenantId, action, details = {}) {
  try {
    await insert('crm_audit_logs', {
      actor_username: actorUsername,
      actor_role: actorRole,
      tenant_id: tenantId,
      action: action,
      details: details,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Audit Log Error]', err.message);
  }
}

// Append-only, tamper-proof billing ledger recording
async function recordBillableEngagement({ tenantId, leadPhone, clientName, city, engagementType, messagePreview }) {
  try {
    if (!tenantId || !leadPhone || tenantId === 'spam_archive' || tenantId === 'test_archive' || tenantId === 'disconnected_30338') {
      return;
    }
    const cleanPhone = String(leadPhone).replace(/\D/g, '');
    if (cleanPhone.length < 10) return;

    const billingMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-10'
    const safePreview = messagePreview ? String(messagePreview).slice(0, 150) : null;
    const engType = engagementType || 'BROADCAST';

    // If clientName or city is not provided, try to fetch from crm_leads
    let finalName = clientName || null;
    let finalCity = city || null;

    if (!finalName || !finalCity) {
      try {
        const leadRes = await get('crm_leads', `tenant_id=eq.${tenantId}&phone=eq.${cleanPhone}&limit=1`);
        if (leadRes?.[0]) {
          if (!finalName && leadRes[0].name) finalName = leadRes[0].name;
          if (!finalCity && leadRes[0].city) finalCity = leadRes[0].city;
        }
      } catch (e) {}
    }

    const existing = await get('crm_billing_ledger', `tenant_id=eq.${tenantId}&lead_phone=eq.${cleanPhone}&billing_month=eq.${billingMonth}&limit=1`);
    if (existing && existing.length > 0) {
      const row = existing[0];
      const mergedChannels = Array.from(new Set([...(row.channels || []), engType]));
      await update('crm_billing_ledger', `id=eq.${row.id}`, {
        message_count: (row.message_count || 1) + 1,
        last_engaged_at: new Date().toISOString(),
        last_message_preview: safePreview || row.last_message_preview,
        client_name: finalName || row.client_name,
        city: finalCity || row.city,
        channels: mergedChannels
      });
    } else {
      await insert('crm_billing_ledger', {
        tenant_id: tenantId,
        lead_phone: cleanPhone,
        client_name: finalName || null,
        city: finalCity || null,
        billing_month: billingMonth,
        engagement_type: engType,
        channels: [engType],
        rate_inr: 5.00,
        message_count: 1,
        first_engaged_at: new Date().toISOString(),
        last_engaged_at: new Date().toISOString(),
        last_message_preview: safePreview || null
      });
    }
  } catch (err) {
    console.error('[Billing Ledger Record Error]:', err.message);
  }
}

module.exports = {
  querySql,
  get,
  insert,
  update,
  del,
  logAudit,
  recordBillableEngagement
};
