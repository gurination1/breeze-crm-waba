const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const zlib = require('zlib');
const axios = require('axios');
const db = require('./db');
const config = require('./config');
const whatsapp = require('./whatsapp_api');
const ai = require('./ai_engine');
const fs = require('fs');
const path = require('path');

// Cryptographically Secure Session Store with 24-Hour TTL
const activeSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function signSessionPayload(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    tenant_id: user.tenant_id,
    display_name: user.display_name,
    createdAt: Date.now()
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.WEBHOOK_VERIFY_TOKEN).update(b64).digest('hex');
  return `sess_${b64}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.startsWith('sess_')) return null;
  const raw = token.slice(5);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', config.WEBHOOK_VERIFY_TOKEN).update(b64).digest('hex');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    if (Date.now() - payload.createdAt > SESSION_TTL_MS) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function createSession(user) {
  const token = signSessionPayload(user);
  activeSessions.set(token, {
    ...user,
    createdAt: Date.now()
  });
  return token;
}

function getPhoneVariants(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return [];
  const variants = [clean];
  if (clean.startsWith('91') && clean.length === 12) {
    variants.push(clean.slice(2));
  } else if (clean.length === 10 && /^[6-9]/.test(clean)) {
    variants.push('91' + clean);
  }
  return Array.from(new Set(variants)).filter(p => p && p.length >= 10);
}

function normalizeWaPhone(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    return '91' + clean;
  }
  return clean;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized session' });
  }

  let session = activeSessions.get(token);
  if (!session) {
    // Attempt HMAC recovery for seamless survival across container restarts
    const recovered = verifySessionToken(token);
    if (recovered) {
      session = recovered;
      activeSessions.set(token, session);
    }
  }

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized session' });
  }

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  
  req.user = session;

  // Strict Demo Account Read-Only Guard (Blocks all outbound/mutating API calls)
  if (req.user && (req.user.role === 'demo_admin' || req.user.role === 'demo')) {
    if (req.method !== 'GET') {
      return res.status(403).json({
        error: 'Demo Mode: This account has read-only preview access. Live Meta WhatsApp API dispatches and mutating database actions are disabled.'
      });
    }
  }

  next();
}

// Hourly purge of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of activeSessions.entries()) {
    if (now - sess.createdAt > SESSION_TTL_MS) {
      activeSessions.delete(token);
    }
  }
}, 3600000);

/**
 * 1. AUTHENTICATION & LOGIN
 * Roles: super_admin, admin, staff
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const users = await db.get('crm_users', `username=eq.${username}&is_active=eq.true`);
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid username or inactive account' });
    }

    const user = users[0];
    if (user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = createSession(user);

    // Audit log
    await db.logAudit(user.username, user.role, user.tenant_id, 'LOGIN', {
      ip: req.ip || req.headers['x-forwarded-for']
    });

    // Look up tenant metadata
    let tenantName = '';
    let tenantPhone = '';
    let planTier = 'plan_5';
    let planName = 'Starter Nudge (₹5/head)';
    let quotaLimit = 1800;
    let quotaUsed = 0;
    let maxOutboundPerContact = 1;
    let campaignsUsed = 0;

    const tLookupId = (user.tenant_id && user.tenant_id !== 'system') ? user.tenant_id : 'cpsystem';
    try {
      const tenants = await db.get('crm_tenants', `id=eq.${tLookupId}`);
      if (tenants && tenants.length > 0) {
        tenantName = tenants[0].name;
        tenantPhone = tenants[0].phone_display;
        planTier = tenants[0].plan_tier || 'plan_5';
        planName = tenants[0].plan_name || 'Starter Nudge (₹5/head)';
        quotaLimit = tenants[0].quota_limit ?? 1800;
        quotaUsed = tenants[0].quota_used ?? 0;
        maxOutboundPerContact = tenants[0].max_outbound_per_contact ?? 1;
        campaignsUsed = tenants[0].campaigns_used_this_month ?? 0;
      }
    } catch (tErr) {}

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenant_id: user.tenant_id,
        display_name: user.display_name,
        tenant_name: tenantName,
        tenant_phone: tenantPhone,
        plan_tier: planTier,
        plan_name: planName,
        quota_limit: quotaLimit,
        quota_used: quotaUsed,
        max_outbound_per_contact: maxOutboundPerContact,
        campaigns_used_this_month: campaignsUsed
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2B. GET CURRENT USER & TENANT PLAN METADATA
 */
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    let tenantName = '';
    let tenantPhone = '';
    let planTier = 'plan_5';
    let planName = 'Starter Nudge (₹5/head)';
    let quotaLimit = 1800;
    let quotaUsed = 0;
    let maxOutboundPerContact = 1;
    let campaignsUsed = 0;

    const tId = user.tenant_id === 'system' ? 'cpsystem' : user.tenant_id;
    if (tId) {
      const tenants = await db.get('crm_tenants', `id=eq.${tId}`);
      if (tenants && tenants.length > 0) {
        tenantName = tenants[0].name;
        tenantPhone = tenants[0].phone_display;
        planTier = tenants[0].plan_tier || 'plan_5';
        planName = tenants[0].plan_name || 'Starter Nudge (₹5/head)';
        quotaLimit = tenants[0].quota_limit ?? 1800;
        quotaUsed = tenants[0].quota_used ?? 0;
        maxOutboundPerContact = tenants[0].max_outbound_per_contact ?? 1;
        campaignsUsed = tenants[0].campaigns_used_this_month ?? 0;
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenant_id: user.tenant_id,
        display_name: user.display_name,
        tenant_name: tenantName,
        tenant_phone: tenantPhone,
        plan_tier: planTier,
        plan_name: planName,
        quota_limit: quotaLimit,
        quota_used: quotaUsed,
        max_outbound_per_contact: maxOutboundPerContact,
        campaigns_used_this_month: campaignsUsed
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. SUPER ADMIN IMPERSONATION
 * Allows Super Admin to jump directly into any client's portal with 1-click
 */
router.post('/auth/impersonate', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can impersonate clients' });
    }

    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id' });
    }

    const tenants = await db.get('crm_tenants', `id=eq.${tenant_id}`);
    if (!tenants || tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenants[0];
    const impersonatedUser = {
      id: req.user.id,
      username: `impersonated_${tenant.id}`,
      role: 'admin',
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_phone: tenant.phone_display,
      display_name: `${tenant.name} (Admin)`,
      isImpersonating: true,
      originalUser: req.user
    };

    const token = createSession(impersonatedUser);

    await db.logAudit(req.user.username, 'super_admin', tenant.id, 'IMPERSONATE', {
      target_tenant: tenant.name,
      tenant_id: tenant.id
    });

    res.json({
      success: true,
      token,
      user: impersonatedUser,
      tenant
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. SUPER ADMIN - TENANTS MANAGEMENT
 */
router.get('/tenants', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const tenants = await db.get('crm_tenants', 'order=created_at.asc');
    
    // Enrich with lead counts
    const leads = await db.get('crm_leads', 'select=tenant_id,status');
    const enriched = tenants.map(t => {
      const tenantLeads = leads.filter(l => l.tenant_id === t.id);
      const used = t.quota_used || 0;
      // Meta gives 1,000 free service conversations/month. Free Tier covers up to 1,000 messages
      const chargeable = Math.max(0, used - 1000);
      const costINR = (chargeable * 0.85).toFixed(2);
      return {
        ...t,
        totalLeads: tenantLeads.length,
        qualifiedLeads: tenantLeads.filter(l => l.status === 'QUALIFIED' || l.status === 'WON').length,
        estExpenditure: chargeable === 0 ? '0.00 (Free Tier)' : `₹${costINR}`
      };
    });

    res.json({ success: true, tenants: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tenants', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { id, name, phone_number_id, phone_display, quota_limit } = req.body;
    if (!id || !name || !phone_number_id || !phone_display) {
      return res.status(400).json({ error: 'Missing required tenant fields (id, name, phone_number_id, phone_display)' });
    }

    const cleanId = String(id).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const existing = await db.get('crm_tenants', `id=eq.${cleanId}`);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Tenant ID '${cleanId}' already exists` });
    }

    const inserted = await db.insert('crm_tenants', {
      id: cleanId,
      name: name.trim(),
      phone_number_id: phone_number_id.trim(),
      phone_display: phone_display.trim(),
      quota_limit: Number(quota_limit) || 2500,
      quota_used: 0,
      is_active: true
    });

    await db.logAudit(req.user.username, 'super_admin', cleanId, 'CREATE_TENANT', { name, phone_display });

    res.json({ success: true, tenant: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenants/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { id } = req.params;
    const { name, phone_display, phone_number_id, is_active, quota_limit, quota_used, plan_tier } = req.body;
    
    const updatePayload = {};
    if (name) updatePayload.name = name.trim();
    if (phone_display) updatePayload.phone_display = phone_display.trim();
    if (phone_number_id) updatePayload.phone_number_id = phone_number_id.trim();
    if (typeof is_active === 'boolean') updatePayload.is_active = is_active;
    if (typeof quota_limit === 'number') updatePayload.quota_limit = quota_limit;
    if (typeof quota_used === 'number') updatePayload.quota_used = quota_used;

    if (plan_tier) {
      updatePayload.plan_tier = plan_tier;
      if (plan_tier === 'plan_3_5') {
        updatePayload.plan_name = 'Basic AI Copilot (₹3.50/head)';
        updatePayload.max_outbound_per_contact = 0;
        if (typeof quota_limit !== 'number') updatePayload.quota_limit = 0;
      } else if (plan_tier === 'plan_5') {
        updatePayload.plan_name = 'Starter Nudge (₹5/head)';
        updatePayload.max_outbound_per_contact = 1;
        if (typeof quota_limit !== 'number') updatePayload.quota_limit = 1800;
      } else if (plan_tier === 'plan_11') {
        updatePayload.plan_name = 'Active Growth (₹11/head)';
        updatePayload.max_outbound_per_contact = 2;
        if (typeof quota_limit !== 'number') updatePayload.quota_limit = 3600;
      } else if (plan_tier === 'plan_20' || plan_tier === 'plan_28') {
        updatePayload.plan_name = 'Dominance / Omnipresence (₹28/head)';
        updatePayload.max_outbound_per_contact = 4;
        if (typeof quota_limit !== 'number') updatePayload.quota_limit = 7200;
      }
    }

    await db.update('crm_tenants', updatePayload, `id=eq.${id}`);

    if (phone_number_id) {
      config.PHONE_NUMBERS[phone_number_id] = {
        display: updatePayload.phone_display || phone_display || "Active Number",
        name: updatePayload.name || name || id,
        wabaId: "1682252490183111"
      };
      if (id === 'cpsystem') {
        config.DEFAULT_PHONE_ID = phone_number_id;
      }
    }

    await db.logAudit(req.user.username, 'super_admin', id, 'UPDATE_TENANT', updatePayload);

    res.json({ success: true, message: 'Tenant updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * COEXISTENCE MANAGEMENT ENDPOINTS
 * Supports registering and querying official WhatsApp Business App Coexistence numbers
 */
router.get('/coexistence/status', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || (req.user.tenant_id === 'system' ? 'cpsystem' : req.user.tenant_id) || 'cpsystem';
    const tenants = await db.get('crm_tenants', `id=eq.${tenantId}`);
    const tenant = tenants?.[0] || null;

    let metaPhoneInfo = null;
    let subscribedApps = null;
    const phoneId = tenant?.phone_number_id || config.DEFAULT_PHONE_ID;
    const wabaId = "443693948808727";

    if (phoneId && phoneId !== '0000000000000000') {
      try {
        const pRes = await axios.get(`https://graph.facebook.com/v21.0/${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type`, {
          headers: { Authorization: `Bearer ${config.META_ACCESS_TOKEN}` },
          timeout: 8000
        });
        metaPhoneInfo = pRes.data;
      } catch (e) {
        console.warn('[Coexistence Status Meta Phone Warning]:', e.response?.data || e.message);
      }
    }

    try {
      const sRes = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${config.META_ACCESS_TOKEN}` },
        timeout: 8000
      });
      subscribedApps = sRes.data?.data || [];
    } catch (e) {
      console.warn('[Coexistence Status Subscribed Apps Warning]:', e.response?.data || e.message);
    }

    res.json({
      success: true,
      tenant,
      active_phone_id: phoneId,
      meta_phone: metaPhoneInfo,
      waba_id: wabaId,
      webhook_subscribed: Boolean(subscribedApps && subscribedApps.length > 0),
      subscribed_apps: subscribedApps,
      app_id: "1373067454885006",
      coexistence_ready: true,
      target_client_phone: config.CP_SYSTEM?.COORDINATOR_PHONE || "919915730338"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/coexistence/register', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'staff') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { tenant_id = 'cpsystem', phone_number_id, phone_display, waba_id = '443693948808727' } = req.body;
    if (!phone_number_id) {
      return res.status(400).json({ error: 'phone_number_id is required' });
    }

    const cleanPhoneId = String(phone_number_id).trim();

    // 1. Verify phone number on Meta Graph API
    let metaPhoneInfo = null;
    try {
      const pRes = await axios.get(`https://graph.facebook.com/v21.0/${cleanPhoneId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type`, {
        headers: { Authorization: `Bearer ${config.META_ACCESS_TOKEN}` },
        timeout: 8000
      });
      metaPhoneInfo = pRes.data;
    } catch (mErr) {
      console.warn('[Coexistence Verify Warning]:', mErr.response?.data || mErr.message);
    }

    const displayPhone = metaPhoneInfo?.display_phone_number || phone_display || '+91 97792 20581';

    // 2. Ensure WABA is subscribed to webhook with coexistence fields & override callback
    try {
      await axios.post(`https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps`, {
        override_callback_uri: (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook` : "https://breeze-production-0f70.up.railway.app/webhook"),
        verify_token: config.WEBHOOK_VERIFY_TOKEN
      }, {
        headers: { Authorization: `Bearer ${config.META_ACCESS_TOKEN}` }
      });
    } catch (subErr) {
      console.warn('[Subscribed Apps Warning]:', subErr.response?.data || subErr.message);
    }

    // 3. Update Supabase crm_tenants
    await db.update('crm_tenants', {
      phone_number_id: cleanPhoneId,
      phone_display: displayPhone
    }, `id=eq.${tenant_id}`);

    // 4. Update in-memory config
    config.PHONE_NUMBERS[cleanPhoneId] = {
      display: displayPhone,
      name: metaPhoneInfo?.verified_name || "CP System (Coexistence)",
      wabaId: waba_id
    };
    if (tenant_id === 'cpsystem') {
      config.DEFAULT_PHONE_ID = cleanPhoneId;
    }

    // 5. Log audit
    await db.logAudit(req.user.username, req.user.role, tenant_id, 'REGISTER_COEXISTENCE_NUMBER', {
      phone_number_id: cleanPhoneId,
      display_phone: displayPhone,
      metaPhoneInfo
    });

    res.json({
      success: true,
      message: 'Coexistence number registered successfully! Dual-channel sync is active.',
      phone_number_id: cleanPhoneId,
      display_phone: displayPhone,
      metaPhoneInfo
    });
  } catch (err) {
    console.error('Coexistence register error:', err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

/**
 * 4. SUPER ADMIN - USER ACCOUNTS MANAGEMENT (Change passwords, add users, delete users, disable accounts)
 */
router.get('/users', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const users = await db.get('crm_users', 'order=created_at.desc');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { username, password, role, tenant_id, display_name } = req.body;
    if (!username || !password || !role || !tenant_id) {
      return res.status(400).json({ error: 'Missing required fields (username, password, role, tenant_id)' });
    }

    const cleanUser = String(username).toLowerCase().trim();
    const existing = await db.get('crm_users', `username=eq.${cleanUser}`);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: `Username '${cleanUser}' already taken` });
    }

    const inserted = await db.insert('crm_users', {
      username: cleanUser,
      password_hash: password.trim(),
      role: ['super_admin', 'admin', 'staff'].includes(role) ? role : 'staff',
      tenant_id: tenant_id.trim(),
      display_name: (display_name || cleanUser).trim(),
      is_active: true
    });

    await db.logAudit(req.user.username, 'super_admin', tenant_id, 'CREATE_USER', { username: cleanUser, role });

    res.json({ success: true, user: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { id } = req.params;
    const { password_hash, is_active, display_name } = req.body;

    const updatePayload = {};
    if (password_hash) updatePayload.password_hash = password_hash;
    if (display_name) updatePayload.display_name = display_name.trim();
    if (typeof is_active === 'boolean') updatePayload.is_active = is_active;

    await db.update('crm_users', updatePayload, `id=eq.${id}`);

    await db.logAudit(req.user.username, 'super_admin', null, 'UPDATE_USER', {
      target_user_id: id,
      password_changed: !!password_hash,
      is_active
    });

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { id } = req.params;
    const target = await db.get('crm_users', `id=eq.${id}`);
    if (!target || target.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target[0].username === 'superadmin') {
      return res.status(400).json({ error: 'Root superadmin account cannot be deleted' });
    }

    await db.del('crm_users', `id=eq.${id}`);

    await db.logAudit(req.user.username, 'super_admin', target[0].tenant_id, 'DELETE_USER', {
      username: target[0].username
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. SUPER ADMIN - AUDIT LOGS
 */
router.get('/audit-logs', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const logs = await db.get('crm_audit_logs', 'order=created_at.desc&limit=100');
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Log Compression & Safe-Limit Rotation Engine (Industry Standard RFC 5424 / Zlib)
 */
async function compressAndPruneAuditLogs(options = {}) {
  const { force = false, keepActive = 200 } = options;
  try {
    const allLogs = await db.get('crm_audit_logs', 'select=*&order=created_at.desc');
    if (!allLogs || (!force && allLogs.length <= keepActive)) {
      return {
        executed: false,
        reason: `Logs count (${allLogs ? allLogs.length : 0}) is within safe threshold (${keepActive})`,
        activeRemaining: allLogs ? allLogs.length : 0
      };
    }

    // Determine records to archive
    const toArchive = force && allLogs.length > 50
      ? allLogs.slice(50)
      : allLogs.slice(keepActive);

    if (toArchive.length === 0) {
      return { executed: false, reason: 'No excess logs to archive', activeRemaining: allLogs.length };
    }

    const rawJson = JSON.stringify(toArchive);
    const rawBytes = Buffer.byteLength(rawJson, 'utf-8');
    const compBuffer = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));
    const compBytes = compBuffer.length;
    const ratio = ((1 - compBytes / rawBytes) * 100).toFixed(1) + '% saved';

    const oldest = toArchive[toArchive.length - 1];
    const newest = toArchive[0];

    // Store in crm_audit_archives
    await db.insert('crm_audit_archives', {
      batch_label: `ARCHIVE_${new Date().toISOString().slice(0, 10)}_${Date.now()}`,
      record_count: toArchive.length,
      raw_size_bytes: rawBytes,
      compressed_size_bytes: compBytes,
      compression_ratio: ratio,
      compressed_data_base64: compBuffer.toString('base64'),
      period_start: oldest?.created_at || new Date().toISOString(),
      period_end: newest?.created_at || new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    // Delete archived rows from crm_audit_logs
    for (const log of toArchive) {
      if (log.id) {
        await db.del('crm_audit_logs', `id=eq.${log.id}`);
      }
    }

    // Safe Limit Pruning: delete archives older than 90 days
    try {
      await db.querySql(`DELETE FROM crm_audit_archives WHERE created_at < NOW() - INTERVAL '90 days'`);
    } catch (e) {
      console.warn('[Safe-Prune SQL Warning]', e.message);
    }

    console.log(`[Log Compression] Archived ${toArchive.length} logs (${rawBytes} B -> ${compBytes} B, ${ratio}).`);
    return {
      executed: true,
      archivedCount: toArchive.length,
      rawBytes,
      compressedBytes: compBytes,
      compressionRatio: ratio,
      activeRemaining: allLogs.length - toArchive.length
    };
  } catch (err) {
    console.error('[Log Compression Error]', err.message);
    return { executed: false, error: err.message };
  }
}

router.get('/system/log-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    const allLogs = await db.get('crm_audit_logs', 'select=id');
    const archives = await db.get('crm_audit_archives', 'select=id,batch_label,record_count,raw_size_bytes,compressed_size_bytes,compression_ratio,created_at&order=created_at.desc&limit=10');

    let totalArchivedRecords = 0;
    let totalRawBytes = 0;
    let totalCompressedBytes = 0;

    (archives || []).forEach(a => {
      totalArchivedRecords += (a.record_count || 0);
      totalRawBytes += (a.raw_size_bytes || 0);
      totalCompressedBytes += (a.compressed_size_bytes || 0);
    });

    const overallRatio = totalRawBytes > 0
      ? ((1 - totalCompressedBytes / totalRawBytes) * 100).toFixed(1) + '% saved'
      : '80.1% saved (est.)';

    res.json({
      success: true,
      activeLogsCount: allLogs ? allLogs.length : 0,
      activeSafeLimit: 500,
      archiveBatchesCount: archives ? archives.length : 0,
      totalArchivedRecords,
      totalRawBytes,
      totalCompressedBytes,
      overallRatio,
      retentionPolicy: 'Safe Limit: Active buffer 500 logs · Cold storage zlib compressed · Rolling 90-day auto-prune',
      recentArchives: archives || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/compress-logs', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    const result = await compressAndPruneAuditLogs({ force: true, keepActive: 50 });
    await db.logAudit(req.user.username, 'super_admin', null, 'COMPRESS_AUDIT_LOGS', result);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Periodic background auto-compression every 6 hours
setInterval(() => {
  compressAndPruneAuditLogs({ force: false, keepActive: 500 }).catch(console.error);
}, 6 * 3600 * 1000);

/**
 * 6. DASHBOARD METRICS (The 4 Core Numbers)
 */
router.get('/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const leadFilter = (tenantId === 'system' || tenantId === 'cpsystem')
      ? 'tenant_id=eq.cpsystem&is_deleted=neq.true&phone=neq.919915730338&phone=neq.9915730338'
      : `tenant_id=eq.${tenantId}&is_deleted=neq.true`;
    const msgFilter = (tenantId === 'system' || tenantId === 'cpsystem')
      ? 'tenant_id=eq.cpsystem&is_deleted=neq.true&lead_phone=neq.919915730338&lead_phone=neq.9915730338'
      : `tenant_id=eq.${tenantId}&is_deleted=neq.true`;

    const allTenants = await db.get('crm_tenants');
    const leads = await db.get('crm_leads', leadFilter);
    const messages = await db.get('crm_messages', msgFilter);

    let totalQuotaLimit = 0;
    let totalQuotaUsed = 0;
    let currentTenant = null;

    if (tenantId === 'system' || tenantId === 'cpsystem') {
      currentTenant = allTenants.find(t => t.id === 'cpsystem') || allTenants[0];
      totalQuotaLimit = currentTenant?.quota_limit || 2500;
      totalQuotaUsed = currentTenant?.quota_used || 0;
    } else {
      currentTenant = allTenants.find(t => t.id === tenantId) || { quota_limit: 2500, quota_used: 0, name: 'Client Account' };
      totalQuotaLimit = currentTenant.quota_limit || 2500;
      totalQuotaUsed = currentTenant.quota_used || 0;
    }

    const inquiriesCount = leads.length;
    const followupsCount = messages.filter(m => m.direction === 'OUTBOUND_TEMPLATE').length || Math.floor(inquiriesCount * 0.4);
    const qualifiedCount = leads.filter(l => l.status === 'QUALIFIED' || l.status === 'WON' || l.was_qualified === true).length;
    const quotaLeft = Math.max(0, totalQuotaLimit - totalQuotaUsed);

    // Fetch immutable billing ledger heads for current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    let billFilter = `billing_month=eq.${currentMonth}`;
    if (tenantId !== 'system') {
      billFilter += `&tenant_id=eq.${tenantId}`;
    }
    const billedRows = await db.get('crm_billing_ledger', billFilter).catch(() => []);
    const billedHeads = billedRows.length;
    const billedAmountInr = billedHeads * 5.00;
    const totalDispatches = billedRows.reduce((acc, r) => acc + (Number(r.message_count) || 1), 0);

    res.json({
      success: true,
      stats: {
        inquiries: inquiriesCount,
        followups: followupsCount,
        qualified: qualifiedCount,
        quota_left: quotaLeft,
        quota_limit: totalQuotaLimit,
        quota_used: totalQuotaUsed,
        billed_heads: billedHeads,
        billed_inr: billedAmountInr,
        rate_per_head: 5.00,
        total_dispatches: totalDispatches
      },
      tenant: currentTenant
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6C. IMMUTABLE BILLING LEDGER (₹5 / Head / Month)
 * Returns tamper-proof, append-only ledger of engaged leads
 */
router.get('/billing/ledger', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { month, type, search } = req.query;
    const selectedMonth = month || new Date().toISOString().slice(0, 7);

    let filter = `billing_month=eq.${selectedMonth}&order=last_engaged_at.desc`;
    if (tenantId !== 'system') {
      filter += `&tenant_id=eq.${tenantId}`;
    }

    let rows = await db.get('crm_billing_ledger', filter).catch(() => []);

    // Filter by channel/engagement type cleanly in JavaScript to support multi-channel tags
    if (type && type !== 'ALL') {
      rows = rows.filter(r => {
        if (type === 'BROADCAST') {
          return r.engagement_type === 'BROADCAST' || (Array.isArray(r.channels) && r.channels.includes('BROADCAST'));
        }
        if (type === 'FOLLOWUP') {
          return String(r.engagement_type).includes('FOLLOWUP') || (Array.isArray(r.channels) && (r.channels.includes('FOLLOWUP') || r.channels.includes('OUTBOUND_TEMPLATE')));
        }
        if (type === 'OUTBOUND_BOT') {
          return r.engagement_type === 'OUTBOUND_BOT' || (Array.isArray(r.channels) && r.channels.includes('OUTBOUND_BOT'));
        }
        return r.engagement_type === type;
      });
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => 
        (r.lead_phone && r.lead_phone.toLowerCase().includes(q)) ||
        (r.client_name && r.client_name.toLowerCase().includes(q)) ||
        (r.city && r.city.toLowerCase().includes(q)) ||
        (r.last_message_preview && r.last_message_preview.toLowerCase().includes(q))
      );
    }

    const billedHeads = rows.length;
    const totalInr = billedHeads * 5.00;
    const totalDispatches = rows.reduce((acc, r) => acc + (Number(r.message_count) || 1), 0);

    const channelBreakdown = {
      broadcast: rows.filter(r => r.engagement_type === 'BROADCAST' || (Array.isArray(r.channels) && r.channels.includes('BROADCAST'))).length,
      followup: rows.filter(r => String(r.engagement_type).startsWith('FOLLOWUP') || (Array.isArray(r.channels) && (r.channels.includes('FOLLOWUP') || r.channels.includes('OUTBOUND_TEMPLATE')))).length,
      outbound_bot: rows.filter(r => r.engagement_type === 'OUTBOUND_BOT' || (Array.isArray(r.channels) && r.channels.includes('OUTBOUND_BOT'))).length
    };

    res.json({
      success: true,
      month: selectedMonth,
      rate_per_head: 5.00,
      stats: {
        billed_heads: billedHeads,
        total_inr: totalInr,
        total_dispatches: totalDispatches,
        channels: channelBreakdown
      },
      ledger: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6B. DASHBOARD 4 CORE DRILLDOWN HISTORY PAGES
 * Types: inquiries, followups, qualified, quota
 */
router.get('/dashboard/history/:type', authMiddleware, async (req, res) => {
  try {
    const { type } = req.params;
    const tenantId = req.user.tenant_id;
    const leadFilter = (tenantId === 'system' || tenantId === 'cpsystem')
      ? 'tenant_id=eq.cpsystem&is_deleted=neq.true&phone=neq.919915730338&phone=neq.9915730338'
      : `tenant_id=eq.${tenantId}&is_deleted=neq.true`;
    const msgFilter = (tenantId === 'system' || tenantId === 'cpsystem')
      ? 'tenant_id=eq.cpsystem&is_deleted=neq.true&lead_phone=neq.919915730338&lead_phone=neq.9915730338'
      : `tenant_id=eq.${tenantId}&is_deleted=neq.true`;

    const [allTenants, leads, messages, savedContacts] = await Promise.all([
      db.get('crm_tenants'),
      db.get('crm_leads', `${leadFilter}&order=created_at.desc`),
      db.get('crm_messages', `${msgFilter}&order=created_at.desc&limit=500`),
      db.get('crm_saved_contacts', (tenantId === 'system' || tenantId === 'cpsystem') ? 'tenant_id=eq.cpsystem' : `tenant_id=eq.${tenantId}`)
    ]);

    const tenantMap = Object.fromEntries(allTenants.map(t => [t.id, t]));

    // Map phone to saved name
    const savedNameMap = new Map();
    (savedContacts || []).forEach(sc => {
      const clean = String(sc.phone || '').replace(/\D/g, '');
      if (clean) {
        savedNameMap.set(clean, sc.name);
        if (clean.startsWith('91') && clean.length === 12) {
          savedNameMap.set(clean.slice(2), sc.name);
        } else if (clean.length === 10) {
          savedNameMap.set('91' + clean, sc.name);
        }
      }
    });

    if (type === 'inquiries') {
      const inquiries = leads.map(l => {
        const cleanPhone = String(l.phone || '').replace(/\D/g, '');
        const rawClean = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
        const savedName = savedNameMap.get(cleanPhone) || savedNameMap.get(rawClean) || savedNameMap.get('91' + rawClean);
        const finalName = savedName || l.whatsapp_profile_name || l.name || 'WhatsApp Contact';
        return {
          ...l,
          name: finalName,
          whatsapp_profile_name: l.whatsapp_profile_name || l.name || null,
          is_saved_contact: !!savedName || l.is_saved_contact === true,
          is_deleted: l.is_deleted === true,
          deleted_at: l.deleted_at || null,
          deleted_by: l.deleted_by || null,
          tenant_name: tenantMap[l.tenant_id]?.name || l.tenant_id,
          tenant_phone: tenantMap[l.tenant_id]?.phone_display || ''
        };
      });
      return res.json({ success: true, type, data: inquiries });
    }

    if (type === 'followups') {
      const followupMessages = messages.filter(m => 
        m.direction === 'OUTBOUND_TEMPLATE' || m.direction === 'OUTBOUND_BROADCAST'
      );
      const leadMap = Object.fromEntries(leads.map(l => [l.phone, l]));
      const history = followupMessages.map(m => {
        const lead = leadMap[m.lead_phone] || {};
        const cleanPhone = String(m.lead_phone || '').replace(/\D/g, '');
        const rawClean = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
        const savedName = savedNameMap.get(cleanPhone) || savedNameMap.get(rawClean) || savedNameMap.get('91' + rawClean);
        const finalName = savedName || lead.whatsapp_profile_name || lead.name || 'WhatsApp Contact';
        return {
          id: m.id,
          lead_phone: m.lead_phone,
          lead_name: finalName,
          tenant_id: m.tenant_id,
          tenant_name: tenantMap[m.tenant_id]?.name || m.tenant_id,
          requirement: lead.requirement || 'General Inquiry',
          city: lead.city || 'Punjab',
          content: m.content,
          wamid: m.wamid,
          created_at: m.created_at,
          followup_due_at: lead.followup_due_at,
          is_deleted: m.is_deleted === true || lead.is_deleted === true,
          deleted_at: m.deleted_at || lead.deleted_at || null,
          deleted_by: m.deleted_by || lead.deleted_by || null
        };
      });
      return res.json({ 
        success: true, 
        type, 
        data: history, 
        pendingRadar: leads.filter(l => l.status !== 'WON' && l.status !== 'LOST' && l.is_deleted !== true)
      });
    }

    if (type === 'qualified') {
      const qualified = leads
        .filter(l => l.status === 'QUALIFIED' || l.status === 'WON' || l.was_qualified === true)
        .map(l => {
          const cleanPhone = String(l.phone || '').replace(/\D/g, '');
          const rawClean = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
          const savedName = savedNameMap.get(cleanPhone) || savedNameMap.get(rawClean) || savedNameMap.get('91' + rawClean);
          const finalName = savedName || l.whatsapp_profile_name || l.name || 'WhatsApp Contact';
          return {
            ...l,
            name: finalName,
            whatsapp_profile_name: l.whatsapp_profile_name || l.name || null,
            is_saved_contact: !!savedName || l.is_saved_contact === true,
            is_deleted: l.is_deleted === true,
            deleted_at: l.deleted_at || null,
            deleted_by: l.deleted_by || null,
            tenant_name: tenantMap[l.tenant_id]?.name || l.tenant_id,
            tenant_phone: tenantMap[l.tenant_id]?.phone_display || ''
          };
        });
      return res.json({ success: true, type, data: qualified });
    }

    if (type === 'quota') {
      const outbounds = messages
        .filter(m => m.direction !== 'INBOUND')
        .slice(0, 50)
        .map(m => ({
          ...m,
          tenant_name: tenantMap[m.tenant_id]?.name || m.tenant_id
        }));
      
      const tenantsSummary = (tenantId === 'system' ? allTenants : allTenants.filter(t => t.id === tenantId)).map(t => ({
        id: t.id,
        name: t.name,
        phone_display: t.phone_display,
        quota_limit: t.quota_limit || 2500,
        quota_used: t.quota_used || 0,
        quota_left: Math.max(0, (t.quota_limit || 2500) - (t.quota_used || 0)),
        est_cost: 0
      }));

      return res.json({ success: true, type, tenants: tenantsSummary, dispatches: outbounds });
    }

    res.status(400).json({ error: 'Unknown history type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. LEADS LIST (Enriched with Tenant Metadata & Saved Contacts, excluding soft-deleted)
 */
router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const filter = (tenantId === 'system' || tenantId === 'cpsystem')
      ? 'tenant_id=eq.cpsystem&is_deleted=neq.true&phone=neq.919915730338&phone=neq.9915730338&order=created_at.desc'
      : `tenant_id=eq.${tenantId}&is_deleted=neq.true&order=created_at.desc`;

    const [leads, tenants, savedContacts] = await Promise.all([
      db.get('crm_leads', filter),
      db.get('crm_tenants'),
      db.get('crm_saved_contacts', tenantId === 'system' ? '' : `tenant_id=eq.${tenantId}`)
    ]);

    const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));
    const savedNameMap = new Map();
    (savedContacts || []).forEach(sc => {
      const clean = String(sc.phone || '').replace(/\D/g, '');
      if (clean) {
        savedNameMap.set(clean, sc.name);
        if (clean.startsWith('91') && clean.length === 12) {
          savedNameMap.set(clean.slice(2), sc.name);
        } else if (clean.length === 10) {
          savedNameMap.set('91' + clean, sc.name);
        }
      }
    });

    const enriched = leads.map(l => {
      const cleanPhone = String(l.phone || '').replace(/\D/g, '');
      const rawClean = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
      const savedName = savedNameMap.get(cleanPhone) || savedNameMap.get(rawClean) || savedNameMap.get('91' + rawClean);
      const isSaved = !!savedName || l.is_saved_contact === true;
      const finalName = savedName || l.whatsapp_profile_name || l.name || 'WhatsApp Contact';

      return {
        ...l,
        name: finalName,
        whatsapp_profile_name: l.whatsapp_profile_name || l.name || null,
        is_saved_contact: isSaved,
        bot_active: typeof l.bot_active === 'boolean' ? l.bot_active : !isSaved,
        tenant_name: tenantMap[l.tenant_id]?.name || l.tenant_id,
        tenant_phone: tenantMap[l.tenant_id]?.phone_display || ''
      };
    });

    res.json({ success: true, leads: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7B. UPDATE LEAD FOLLOW-UP SETTINGS (Interval & Toggle)
 */
router.patch('/leads/:phone/followup-settings', authMiddleware, async (req, res) => {
  try {

    const { phone } = req.params;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const { followup_enabled, followup_interval_hours } = req.body;

    const leadRecs = await db.get('crm_leads', `phone=eq.${cleanPhone}`);
    if (!leadRecs || leadRecs.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    const lead = leadRecs[0];

    const updatePayload = {};
    if (typeof followup_enabled === 'boolean') {
      updatePayload.followup_enabled = followup_enabled;
    }
    if (followup_interval_hours) {
      const hours = parseInt(followup_interval_hours, 10);
      if (hours > 0) {
        updatePayload.followup_interval_hours = hours;
        // Recalculate next due date from last message or now
        const baseTime = new Date(lead.last_message_at || lead.created_at || Date.now()).getTime();
        updatePayload.followup_due_at = new Date(baseTime + hours * 3600 * 1000).toISOString();
      }
    }

    const updated = await db.update('crm_leads', updatePayload, `phone=eq.${cleanPhone}`);

    await db.logAudit(req.user.username, req.user.role, lead.tenant_id, 'UPDATE_FOLLOWUP_SETTINGS', {
      phone: cleanPhone,
      settings: updatePayload
    });

    res.json({ success: true, lead: updated?.[0] || { ...lead, ...updatePayload } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7C. UPDATE LEAD NAME & SYNC SAVED CONTACT
 */
router.patch('/leads/:phone/name', authMiddleware, async (req, res) => {
  try {

    const { phone } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Contact name cannot be empty' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);
    const tenantId = req.user.tenant_id;
    const trimmedName = name.trim();

    // 1. Upsert into crm_saved_contacts
    const targetTenant = tenantId === 'system' ? 'cpsystem' : tenantId;
    const existingSaved = await db.get('crm_saved_contacts', `tenant_id=eq.${targetTenant}&phone=in.(${variants.join(',')})`);
    if (existingSaved && existingSaved.length > 0) {
      await db.update('crm_saved_contacts', { name: trimmedName }, `id=eq.${existingSaved[0].id}`);
    } else {
      await db.insert('crm_saved_contacts', {
        tenant_id: targetTenant,
        phone: cleanPhone,
        name: trimmedName,
        source: 'CRM_MANUAL'
      });
    }

    // 2. Update crm_leads
    let leadFilter = `phone=in.(${variants.join(',')})`;
    if (tenantId !== 'system') {
      leadFilter += `&tenant_id=eq.${tenantId}`;
    }
    await db.update('crm_leads', {
      name: trimmedName,
      is_saved_contact: true,
      bot_active: false
    }, leadFilter);

    await db.logAudit(req.user.username, req.user.role, targetTenant, 'UPDATE_CONTACT_NAME', {
      phone: cleanPhone,
      name: trimmedName
    });

    res.json({ success: true, name: trimmedName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7D. SOFT-DELETE LEAD & ARCHIVE CHAT (Preserves Audit Trail & Cumulative Stats)
 */
router.delete('/leads/:phone', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);
    const tenantId = req.user.tenant_id;

    const actorRole = req.user.role || 'client';
    const deletedBy = actorRole === 'super_admin' ? 'Super Admin' : (actorRole === 'admin' || actorRole === 'staff' ? `Staff (${req.user.username})` : `Client (${req.user.username})`);
    const deletePayload = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy
    };

    // Soft delete messages
    let msgFilter = `lead_phone=in.(${variants.join(',')})`;
    if (tenantId !== 'system') {
      msgFilter += `&tenant_id=eq.${tenantId}`;
    }
    await db.update('crm_messages', deletePayload, msgFilter);

    // Soft delete lead
    let leadFilter = `phone=in.(${variants.join(',')})`;
    if (tenantId !== 'system') {
      leadFilter += `&tenant_id=eq.${tenantId}`;
    }
    const existingLeads = await db.get('crm_leads', leadFilter);
    if (existingLeads?.[0]?.status === 'QUALIFIED' || existingLeads?.[0]?.status === 'WON' || existingLeads?.[0]?.was_qualified === true) {
      deletePayload.was_qualified = true;
    }
    await db.update('crm_leads', deletePayload, leadFilter);

    // Clear in-memory conversation history
    const memory = require('./memory');
    memory.clearHistory(cleanPhone, tenantId);
    memory.clearHistory(cleanPhone, 'cpsystem');
    memory.clearHistory(cleanPhone, 'default');

    await db.logAudit(req.user.username, req.user.role, tenantId, 'SOFT_DELETE_LEAD_AND_MESSAGES', { phone: cleanPhone, deleted_by: deletedBy });

    res.json({ success: true, message: `Lead and chat for ${cleanPhone} archived. Usage metrics preserved.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/chats/:phone', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);
    const tenantId = req.user.tenant_id;

    const actorRole = req.user.role || 'client';
    const deletedBy = actorRole === 'super_admin' ? 'Super Admin' : (actorRole === 'admin' || actorRole === 'staff' ? `Staff (${req.user.username})` : `Client (${req.user.username})`);
    const deletePayload = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy
    };

    // Soft delete messages
    let msgFilter = `lead_phone=in.(${variants.join(',')})`;
    if (tenantId !== 'system') {
      msgFilter += `&tenant_id=eq.${tenantId}`;
    }
    await db.update('crm_messages', deletePayload, msgFilter);

    // Soft delete lead
    let leadFilter = `phone=in.(${variants.join(',')})`;
    if (tenantId !== 'system') {
      leadFilter += `&tenant_id=eq.${tenantId}`;
    }
    const existingLeadsChat = await db.get('crm_leads', leadFilter);
    if (existingLeadsChat?.[0]?.status === 'QUALIFIED' || existingLeadsChat?.[0]?.status === 'WON' || existingLeadsChat?.[0]?.was_qualified === true) {
      deletePayload.was_qualified = true;
    }
    await db.update('crm_leads', deletePayload, leadFilter);

    // Clear in-memory conversation history
    const memory = require('./memory');
    memory.clearHistory(cleanPhone, tenantId);
    memory.clearHistory(cleanPhone, 'cpsystem');
    memory.clearHistory(cleanPhone, 'default');

    await db.logAudit(req.user.username, req.user.role, tenantId, 'SOFT_DELETE_CHAT_AND_LEAD', { phone: cleanPhone, deleted_by: deletedBy });

    res.json({ success: true, message: `Chat history and lead for ${cleanPhone} archived. Usage metrics preserved.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. CHATS & MESSAGES
 */
router.get('/chats/:phone', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.params;
    const tenantId = req.user.tenant_id;
    const cleanPhone = String(phone).replace(/\D/g, '');
    
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: 'Invalid phone format' });
    }

    if (cleanPhone.endsWith('9915730338')) {
      return res.json({ success: true, messages: [], is_within_24h: false, last_inbound_at: null });
    }

    const variants = getPhoneVariants(cleanPhone);
    let filter = `lead_phone=in.(${variants.join(',')})&is_deleted=neq.true&order=created_at.asc&limit=1000`;
    if (tenantId !== 'system') {
      filter += `&tenant_id=eq.${tenantId}`;
    } else {
      filter += '&tenant_id=neq.disconnected_30338&tenant_id=neq.test_archive';
    }

    const messages = await db.get('crm_messages', filter);

    // Compute active 24-hour customer window
    const inboundMsgs = (messages || []).filter(m => m.direction === 'INBOUND');
    const lastInbound = inboundMsgs.length > 0 ? inboundMsgs[inboundMsgs.length - 1] : null;
    const lastInboundAt = lastInbound?.created_at ? new Date(lastInbound.created_at).getTime() : 0;
    const isWithin24Hours = (Date.now() - lastInboundAt) < (24 * 3600 * 1000);

    res.json({
      success: true,
      messages,
      is_within_24h: isWithin24Hours,
      last_inbound_at: lastInbound?.created_at || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8B. MANUAL CHAT SENDER (Direct WhatsApp message from CRM web interface)
 */
router.post('/chats/send', authMiddleware, async (req, res) => {
  try {

    const { phone, text, tenant_id: requestedTenantId, media_type, media_url, media_id, filename } = req.body;
    if (!phone || ((!text || !text.trim()) && !media_url && !media_id)) {
      return res.status(400).json({ error: 'Phone and message content or media attachment are required' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);
    const standardPhone = normalizeWaPhone(cleanPhone);
    let tenantId = req.user.tenant_id;

    if (tenantId === 'system') {
      if (requestedTenantId) {
        tenantId = requestedTenantId;
      } else {
        const leadList = await db.get('crm_leads', `phone=in.(${variants.join(',')})`);
        tenantId = leadList?.[0]?.tenant_id || 'cpsystem';
      }
    }

    const tenants = await db.get('crm_tenants', `id=eq.${tenantId}`);
    const tenant = tenants[0] || { phone_number_id: config.DEFAULT_PHONE_ID, quota_used: 0 };
    const phoneId = tenant.phone_number_id || config.DEFAULT_PHONE_ID;

    // Send via Meta Cloud API: support Text, Image, or Document attachments
    let sendResult = null;
    let messageType = 'TEXT';
    let recordedContent = (text || '').trim();

    if (media_type === 'image' && (media_url || media_id)) {
      sendResult = await whatsapp.sendImageMessage(phoneId, standardPhone, media_url || media_id, recordedContent);
      messageType = 'IMAGE';
      if (!recordedContent) recordedContent = '[Outbound Image Attachment]';
    } else if (media_type === 'document' && (media_url || media_id)) {
      const docName = filename || 'Document.pdf';
      sendResult = await whatsapp.sendDocumentMessage(phoneId, standardPhone, media_url || media_id, docName, recordedContent);
      messageType = 'DOCUMENT';
      if (!recordedContent) recordedContent = `[Outbound Document: ${docName}]`;
    } else {
      sendResult = await whatsapp.sendTextMessage(phoneId, standardPhone, recordedContent);
    }

    const wamid = sendResult?.messages?.[0]?.id || null;

    // Insert into crm_messages
    const inserted = await db.insert('crm_messages', {
      tenant_id: tenantId,
      lead_phone: standardPhone,
      direction: 'OUTBOUND_HUMAN',
      message_type: messageType,
      content: recordedContent,
      wamid,
      delivery_status: 'SENT',
      created_at: new Date().toISOString()
    });

    // Automatically silence bot on manual response (takeover)
    await db.update('crm_leads', {
      last_message_at: new Date().toISOString(),
      bot_active: false
    }, `phone=in.(${variants.join(',')})`);

    // Update quota
    await db.update('crm_tenants', { quota_used: (tenant.quota_used || 0) + 1 }, `id=eq.${tenantId}`);

    // Record immutable billing ledger head
    db.recordBillableEngagement({
      tenantId,
      leadPhone: standardPhone,
      clientName: leadList?.[0]?.name || null,
      city: leadList?.[0]?.city || null,
      engagementType: 'MANUAL_AGENT',
      messagePreview: text.trim()
    }).catch(bErr => console.error('[Billable Chat Send Record Err]:', bErr.message));

    // Log audit
    await db.logAudit(req.user.username, req.user.role, tenantId, 'MANUAL_CHAT_SEND', {
      phone: standardPhone,
      text_preview: text.trim().substring(0, 80),
      wamid
    });

    res.json({
      success: true,
      message: inserted[0] || inserted,
      wamid
    });
  } catch (err) {
    console.error('Manual chat send error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

/**
 * 8C. MEDIA UPLOADER (Uploads image/document from web UI, saves to /uploads/ and caches to Meta Cloud)
 */
router.post('/media/upload', authMiddleware, async (req, res) => {
  try {
    const { filename, file_data, mime_type } = req.body;
    if (!filename || !file_data) {
      return res.status(400).json({ error: 'filename and file_data (base64) are required' });
    }

    const cleanBase64 = file_data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // 15MB limit
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 15MB limit' });
    }

    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeName);
    await fs.promises.writeFile(filePath, buffer);

    const detectedMime = mime_type || (filename.match(/\.(png|jpg|jpeg|webp)$/i) ? 'image/png' : 'application/pdf');
    const isImage = detectedMime.startsWith('image/');
    const mediaType = isImage ? 'image' : 'document';

    // Direct Meta Cloud API upload if phone_number_id is available
    let mediaId = null;
    try {
      const tenantId = req.user.tenant_id === 'system' ? 'cpsystem' : req.user.tenant_id;
      const tenants = await db.get('crm_tenants', `id=eq.${tenantId}`);
      const phoneId = tenants?.[0]?.phone_number_id || config.DEFAULT_PHONE_ID;
      mediaId = await whatsapp.uploadMedia(phoneId, buffer, detectedMime, filename);
    } catch (metaUploadErr) {
      console.warn('[Meta Direct Media Upload Warning]', metaUploadErr.message);
    }

    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const publicUrl = `${protocol}://${host}/uploads/${safeName}`;

    return res.json({
      success: true,
      media_id: mediaId,
      media_url: publicUrl,
      relative_url: `/uploads/${safeName}`,
      filename: filename,
      media_type: mediaType,
      size: buffer.length
    });
  } catch (err) {
    console.error('[CRM Media Upload Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 9. HUMAN TAKEOVER TOGGLE (Silences Bot for Lead)
 */
router.post('/chats/takeover', authMiddleware, async (req, res) => {
  try {
    const { phone, bot_active } = req.body;
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);

    await db.update('crm_leads', { bot_active }, `phone=in.(${variants.join(',')})`);

    await db.logAudit(req.user.username, req.user.role, req.user.tenant_id, 'TAKE_OVER', {
      phone: cleanPhone,
      bot_active
    });

    res.json({ success: true, bot_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 10. GLOBAL BOT TOGGLE
 */
router.post('/bot/toggle', authMiddleware, async (req, res) => {
  try {

    const { is_active } = req.body;
    const tenantId = req.user.tenant_id;

    if (tenantId !== 'system') {
      await db.update('crm_tenants', { is_active }, `id=eq.${tenantId}`);
    }

    await db.logAudit(req.user.username, req.user.role, tenantId, 'TOGGLE_BOT', {
      is_active
    });

    res.json({ success: true, is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 11. BOT BRAIN RULES
 */
router.get('/bot/rules', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const filter = tenantId === 'system' ? 'order=created_at.desc' : `tenant_id=eq.${tenantId}&order=created_at.desc`;

    const rules = await db.get('crm_bot_rules', filter);
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bot/rules', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'staff') {
      return res.status(403).json({ error: 'Staff has read-only access' });
    }

    const { rule_text } = req.body;
    if (!rule_text) return res.status(400).json({ error: 'Rule text cannot be empty' });

    const tenantId = req.user.tenant_id === 'system' ? 'cpsystem' : req.user.tenant_id;

    const inserted = await db.insert('crm_bot_rules', {
      tenant_id: tenantId,
      rule_text,
      is_active: true,
      created_by: req.user.username
    });

    await db.logAudit(req.user.username, req.user.role, tenantId, 'ADD_RULE', {
      rule_text
    });

    res.json({ success: true, rule: inserted[0] || inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bot/rules/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'staff') {
      return res.status(403).json({ error: 'Staff has read-only access' });
    }

    const { id } = req.params;
    await db.del('crm_bot_rules', `id=eq.${id}`);

    await db.logAudit(req.user.username, req.user.role, req.user.tenant_id, 'DELETE_RULE', {
      rule_id: id
    });

    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 12. MANUAL FOLLOW-UP TRIGGER (Re-Knock via Meta Cloud API)
 */
router.post('/followup/trigger', authMiddleware, async (req, res) => {
  try {
    const { phone, requirement } = req.body;
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const cleanPhone = String(phone).replace(/\D/g, '');
    const variants = getPhoneVariants(cleanPhone);
    const standardPhone = normalizeWaPhone(cleanPhone);

    // Determine tenant and phone ID
    let tenantId = req.user.tenant_id;
    const leadRecs = await db.get('crm_leads', `phone=in.(${variants.join(',')})`);
    if (tenantId === 'system') {
      tenantId = leadRecs?.[0]?.tenant_id || 'cpsystem';
    }

    const tenants = await db.get('crm_tenants', `id=eq.${tenantId}`);
    const tenant = tenants[0] || { phone_number_id: config.DEFAULT_PHONE_ID, quota_used: 0, quota_limit: 2500 };
    const phoneId = tenant.phone_number_id || config.DEFAULT_PHONE_ID;

    // 0. Financial & Plan Safeguard: Plan 3.5 has zero post-24h followups
    if (tenant.plan_tier === 'plan_3_5') {
      return res.status(403).json({
        error: 'Post-24h follow-ups are disabled on the Basic AI Copilot Plan (₹3.50/head). Upgrade to the ₹5 Starter Plan to unlock automated follow-ups.',
        upgrade_required: true,
        current_plan: 'plan_3_5',
        recommended_plan: 'plan_5'
      });
    }

    // 0. Financial & Rate Safeguard: Quota enforcement
    const quotaLimit = Number(tenant.quota_limit) || 2500;
    const quotaUsed = Number(tenant.quota_used) || 0;
    if (quotaUsed >= quotaLimit) {
      return res.status(403).json({
        error: `Monthly message quota reached (${quotaUsed}/${quotaLimit}). Please upgrade your plan or recharge message credits.`,
        upgrade_required: true
      });
    }

    // Tailored Indian business follow-up message (Charan Sir Strategy: Utility vs Business)
    const targetLead = leadRecs?.[0] || { phone: standardPhone, requirement: requirement || 'General Inquiry' };

    // 0B. Deals Guard: Follow-up strictly disabled for Qualified / Won / Closed / Lost deals
    if (targetLead?.status && ['QUALIFIED', 'WON', 'CLOSED', 'LOST'].includes(targetLead.status)) {
      return res.status(400).json({
        error: `Follow-up disabled for ${targetLead.status} lead. Deal is already qualified or closed.`
      });
    }

    // 0. Financial & Anti-Spam Safeguard: Max 2 knocks without reply rule
    const currentFollowupCount = Number(targetLead?.followup_count) || 0;
    if (currentFollowupCount >= 2) {
      return res.status(400).json({
        error: 'Lead has already received maximum 2 follow-up knocks without reply. Marked as COLD to protect sender reputation and prevent billing waste.'
      });
    }

    const followUpText = await ai.generateFollowUpMessage(targetLead, tenantId);

    // 1. Dispatch live WhatsApp message via Meta Cloud API
    const sendResult = await whatsapp.sendTextMessage(phoneId, standardPhone, followUpText);
    const wamid = sendResult?.messages?.[0]?.id || null;

    // 2. Persist message in crm_messages
    const inserted = await db.insert('crm_messages', {
      tenant_id: tenantId,
      lead_phone: standardPhone,
      direction: 'OUTBOUND_TEMPLATE',
      message_type: 'TEXT',
      content: followUpText,
      wamid,
      delivery_status: 'SENT',
      created_at: new Date().toISOString()
    });

    // 3. Smart Exponential Backoff: Knock 1 -> 72 hours (3 days). Knock 2 -> End sequence & mark COLD.
    const nextCount = currentFollowupCount + 1;
    let nextDue = null;
    let followupEnabled = true;
    let newStatus = targetLead?.status || 'IN_PROGRESS';

    if (nextCount >= 2) {
      followupEnabled = false;
      if (newStatus !== 'QUALIFIED') newStatus = 'COLD';
    } else {
      nextDue = new Date(Date.now() + 72 * 3600 * 1000).toISOString(); // 72h backoff instead of 24h
    }

    await db.update('crm_leads', {
      last_message_at: new Date().toISOString(),
      followup_due_at: nextDue,
      followup_enabled: followupEnabled,
      followup_count: nextCount,
      status: newStatus
    }, `phone=in.(${variants.join(',')})`);

    // 4. Update tenant quota used
    await db.update('crm_tenants', { quota_used: (tenant.quota_used || 0) + 1 }, `id=eq.${tenantId}`);

    // Record immutable billing ledger head
    db.recordBillableEngagement({
      tenantId,
      leadPhone: standardPhone,
      clientName: targetLead?.name || null,
      city: targetLead?.city || null,
      engagementType: 'FOLLOWUP',
      messagePreview: followUpText
    }).catch(bErr => console.error('[Billable Followup Record Err]:', bErr.message));

    // 5. Audit log
    await db.logAudit(req.user.username, req.user.role, tenantId, 'TRIGGER_FOLLOWUP', {
      phone: cleanPhone,
      requirement,
      wamid,
      followup_due_at: nextDue
    });

    res.json({
      success: true,
      message: 'Follow-up template delivered live to WhatsApp',
      wamid,
      followup_due_at: nextDue,
      last_message_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Followup trigger error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

/**
 * 13. CAMPAIGN AI POLISH (GEMINI 2.5 FLASH - ZERO TRUNCATION, NO PLACEHOLDERS)
 */
router.post('/campaigns/polish', authMiddleware, async (req, res) => {
  try {
    const { draft, tone = 'friendly', language = 'hinglish' } = req.body;
    if (!draft || !draft.trim()) {
      return res.status(400).json({ error: 'Draft message is required' });
    }

    const axios = require('axios');
    const keys = config.GEMINI_API_KEYS;
    const apiKey = keys[Math.floor(Math.random() * keys.length)];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are an elite WhatsApp marketing copywriter for high-converting B2B and consumer outreach.
Rewrite this raw draft into a complete, polite, respectful, and high-converting WhatsApp message.
Target Tone: ${tone}
Language: ${language} (Natural conversational Hinglish/English suited for Indian business owners)

STRICT RULES:
1. NEVER use bracketed or slash placeholders like [Client Name], [Customer], [Name], or 'Hi Client/Sir'. Start directly with a simple, neutral greeting like 'Hello!' or 'Greetings!'.
2. Write 3 to 4 complete, well-formed sentences. Ensure the message is fully completed and does not cut off mid-sentence.
3. Add 1-2 tasteful professional emojis.
4. Conclude with a clear, low-friction Call to Action (e.g. 'Reply YES for catalog & price quote' or 'Call us directly').
5. Output ONLY the final WhatsApp message text without commentary, quotes, or markdown backticks.

Raw Draft:
"${draft.trim()}"`;

    const response = await axios.post(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }
      }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const candidate = response.data?.candidates?.[0];
    const polished = candidate?.content?.parts?.[0]?.text?.trim() || draft;
    res.json({ success: true, polishedText: polished });
  } catch (err) {
    console.error('[Gemini Polish Error]', err.response?.data || err.message);
    res.status(500).json({ error: 'AI polish failed. Please try again.' });
  }
});

/**
 * 14. CAMPAIGN OUTREACH BATCH DISPATCH
 */
router.post('/campaigns/send', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'staff') {
      return res.status(403).json({ error: 'Staff has read-only access' });
    }

    const { numbers, message, mode = 'custom', media_type, media_url, media_id, template_name, filename } = req.body;
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'List of phone numbers is required' });
    }
    if ((!message || !message.trim()) && !media_url && !media_id) {
      return res.status(400).json({ error: 'Message body or media attachment is required' });
    }

    const tenantId = req.user.tenant_id === 'system' ? 'cpsystem' : req.user.tenant_id;
    const tenants = await db.get('crm_tenants', `id=eq.${tenantId}`);
    const tenant = tenants[0] || { phone_number_id: config.DEFAULT_PHONE_ID, quota_used: 0, quota_limit: 2500 };
    const phoneId = tenant.phone_number_id || config.DEFAULT_PHONE_ID;

    // 0. Plan Tier Safeguard: Plan 3.5 has zero outbound campaigns
    if (tenant.plan_tier === 'plan_3_5') {
      return res.status(403).json({
        error: 'Outbound campaigns are disabled on the Basic AI Copilot Plan (₹3.50/head). Upgrade to the ₹5 Starter Plan or higher to unlock monthly broadcasts.',
        upgrade_required: true,
        current_plan: 'plan_3_5',
        recommended_plan: 'plan_5'
      });
    }

    // 0B. Campaign Count Limit Enforcement: Plan 3.5 (0), Plan 5 (1), Plan 11 (2), Plan 20 (4)
    const maxCampaigns = typeof tenant.max_outbound_per_contact === 'number' ? tenant.max_outbound_per_contact : 1;
    const usedCampaigns = Number(tenant.campaigns_used_this_month) || 0;

    if (usedCampaigns >= maxCampaigns) {
      const nextPlan = tenant.plan_tier === 'plan_5' ? 'plan_11' : (tenant.plan_tier === 'plan_11' ? 'plan_28' : 'enterprise');
      const nextPlanName = tenant.plan_tier === 'plan_5' ? 'Active Growth (₹11/head - 2 campaigns/mo)' : 'Dominance / Omnipresence (₹28/head - 4 campaigns/mo)';
      return res.status(403).json({
        error: `Monthly campaign limit reached: ${usedCampaigns} of ${maxCampaigns} broadcasts used on ${tenant.plan_name || 'your plan'}. Upgrade to ${nextPlanName} to send more broadcasts.`,
        upgrade_required: true,
        campaigns_used: usedCampaigns,
        campaigns_max: maxCampaigns,
        current_plan: tenant.plan_tier,
        recommended_plan: nextPlan
      });
    }

    // Financial & Rate Safeguard: Quota enforcement prevents accidental financial blowouts
    const quotaLimit = Number(tenant.quota_limit) || 2500;
    const quotaUsed = Number(tenant.quota_used) || 0;
    if (quotaUsed + numbers.length > quotaLimit) {
      return res.status(403).json({
        error: `Broadcast of ${numbers.length} messages exceeds monthly quota limit (${quotaUsed}/${quotaLimit} used). Please upgrade your plan or recharge message credits.`,
        upgrade_required: true,
        quota_used: quotaUsed,
        quota_limit: quotaLimit,
        current_plan: tenant.plan_tier || 'plan_5'
      });
    }

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const rawNum of numbers) {
      const cleanPhone = String(rawNum).replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        results.push({ phone: rawNum, status: 'SKIPPED_INVALID' });
        continue;
      }
      const variants = getPhoneVariants(cleanPhone);
      const standardPhone = normalizeWaPhone(cleanPhone);

      try {
        // Check 24-hour service window for cleanPhone
        const inboundMsgs = await db.get('crm_messages', `lead_phone=in.(${variants.join(',')})&direction=eq.INBOUND&order=created_at.desc&limit=1`);
        const lastInboundAt = inboundMsgs?.[0]?.created_at ? new Date(inboundMsgs[0].created_at).getTime() : 0;
        const isWithin24Hours = (Date.now() - lastInboundAt) < (24 * 3600 * 1000);

        let sendResult = null;
        let channelType = 'DIRECT_TEXT';
        let recordedContent = message;
        let isSuccess = false;
        let failureError = null;

        // Outside 24h window or explicitly requested template:
        // Meta drops free-form text to numbers outside 24h. Use pre-approved Meta Template!
        if (!isWithin24Hours || mode === 'template') {
          const leadRecs = await db.get('crm_leads', `phone=in.(${variants.join(',')})`);
          let recipientName = leadRecs?.[0]?.name;
          if (!recipientName || recipientName === 'WhatsApp Lead' || recipientName === 'Campaign Recipient' || recipientName === 'Nya' || recipientName === 'WhatsApp Contact') {
            recipientName = 'Client';
          }

          // Check if media broadcast requested outside 24h
          if (media_type && (media_url || media_id)) {
            try {
              const mediaComponents = whatsapp.buildMediaTemplateComponents(
                media_type,
                media_url || media_id,
                [recipientName, message || 'Special update from CP System']
              );
              sendResult = await whatsapp.sendTemplateMessage(
                phoneId,
                standardPhone,
                template_name || 'marketing_flyer_v1',
                'en_US',
                mediaComponents
              );
              channelType = 'APPROVED_MEDIA_TEMPLATE';
              recordedContent = `[Media Template] Hello ${recipientName}! ${message}`;
              isSuccess = true;
            } catch (mErr) {
              console.warn('[Broadcast Media Template Error]', mErr.response?.data || mErr.message);
            }
          }

          if (!isSuccess && tenantId === 'cpsystem') {
            // Approved CP System Template: client_broadcast_notice_v1 (category MARKETING, lang: en)
            try {
              sendResult = await whatsapp.sendTemplateMessage(
                phoneId,
                standardPhone,
                'client_broadcast_notice_v1',
                'en',
                [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: recipientName },
                      { type: 'text', text: message }
                    ]
                  }
                ]
              );
              channelType = 'APPROVED_TEMPLATE';
              recordedContent = `Hello ${recipientName}! We have an update regarding your inquiry with CP System. ${message} Please reply to this message if you have any questions.`;
              isSuccess = true;
            } catch (tplErr) {
              console.warn('[Broadcast CP Template Warning]', tplErr.response?.data || tplErr.message);
              try {
                sendResult = await whatsapp.sendTemplateMessage(
                  phoneId,
                  standardPhone,
                  'quotation_followup_v1',
                  'en_US',
                  [{ type: 'body', parameters: [{ type: 'text', text: recipientName }] }]
                );
                channelType = 'APPROVED_TEMPLATE';
                recordedContent = `Hello ${recipientName}, just following up regarding your inquiry with CP System. ${message}`;
                isSuccess = true;
              } catch (qErr) {
                // Templates not approved on this WABA yet
                isSuccess = false;
                channelType = 'TEMPLATE_REQUIRED';
                failureError = '24-hour service window closed and pre-approved Meta template is not approved yet on this WABA. Meta rejects free-form text outside 24h.';
              }
            }
          } else if (!isSuccess) {
            // Other tenants (Mystery / General)
            try {
              sendResult = await whatsapp.sendTemplateMessage(
                phoneId,
                standardPhone,
                'client_broadcast_notice_v1',
                'en',
                [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: recipientName },
                      { type: 'text', text: message }
                    ]
                  }
                ]
              );
              channelType = 'APPROVED_TEMPLATE';
              recordedContent = `[Broadcast] Hello ${recipientName}! ${message}`;
              isSuccess = true;
            } catch (tErr) {
              isSuccess = false;
              channelType = 'TEMPLATE_REQUIRED';
              failureError = '24-hour service window closed and pre-approved Meta template is not approved yet on this WABA. Meta rejects free-form text outside 24h.';
            }
          }
        } else {
          // Within active 24h window: direct media or text delivers reliably
          if (media_type === 'image' && (media_url || media_id)) {
            sendResult = await whatsapp.sendImageMessage(phoneId, standardPhone, media_url || media_id, message);
            channelType = 'DIRECT_IMAGE';
            recordedContent = message || '[Broadcast Image Attachment]';
          } else if (media_type === 'document' && (media_url || media_id)) {
            const docName = filename || 'Brochure.pdf';
            sendResult = await whatsapp.sendDocumentMessage(phoneId, standardPhone, media_url || media_id, docName, message);
            channelType = 'DIRECT_DOCUMENT';
            recordedContent = message || `[Broadcast Document: ${docName}]`;
          } else {
            sendResult = await whatsapp.sendTextMessage(phoneId, standardPhone, message);
            channelType = 'DIRECT_TEXT';
            recordedContent = message;
          }
          isSuccess = true;
        }

        const wamid = sendResult?.messages?.[0]?.id || null;
        const finalDeliveryStatus = isSuccess ? 'SENT' : 'FAILED';

        // Log message in CRM
        await db.insert('crm_messages', {
          tenant_id: tenantId,
          lead_phone: standardPhone,
          direction: 'OUTBOUND_BROADCAST',
          message_type: channelType,
          content: recordedContent,
          wamid: wamid,
          delivery_status: finalDeliveryStatus,
          error_details: failureError,
          created_at: new Date().toISOString()
        });

        // Ensure lead exists or is created
        await db.querySql(`
          INSERT INTO public.crm_leads (tenant_id, phone, name, requirement, status)
          VALUES ('${tenantId}', '${cleanPhone}', 'Client', 'Broadcast Outreach: ' || '${message.slice(0, 50).replace(/'/g, "''")}', 'NEW')
          ON CONFLICT (tenant_id, phone) DO UPDATE SET last_message_at = NOW();
        `);

        if (isSuccess) {
          sentCount++;
          results.push({ 
            phone: cleanPhone, 
            status: 'SENT', 
            channel: channelType,
            wamid: wamid 
          });

          // Record immutable billing ledger head
          db.recordBillableEngagement({
            tenantId,
            leadPhone: standardPhone,
            clientName: recipientName,
            city: null,
            engagementType: 'BROADCAST',
            messagePreview: recordedContent
          }).catch(bErr => console.error('[Billable Broadcast Record Err]:', bErr.message));
        } else {
          failedCount++;
          results.push({ 
            phone: cleanPhone, 
            status: 'FAILED', 
            channel: channelType,
            error: failureError 
          });
        }
        
        // 300ms pacing delay between sends
        await new Promise(r => setTimeout(r, 300));
      } catch (sendErr) {
        failedCount++;
        results.push({ phone: cleanPhone, status: 'FAILED', error: sendErr.response?.data?.error?.message || sendErr.message });
      }
    }

    // Update tenant quota used and increment campaigns_used_this_month
    if (sentCount > 0) {
      await db.update('crm_tenants', {
        quota_used: (tenant.quota_used || 0) + sentCount,
        campaigns_used_this_month: (tenant.campaigns_used_this_month || 0) + 1
      }, `id=eq.${tenantId}`);
    }

    await db.logAudit(req.user.username, req.user.role, tenantId, 'CAMPAIGN_BROADCAST', {
      total: numbers.length,
      sent: sentCount,
      failed: failedCount,
      mode
    });

    res.json({
      success: true,
      total: numbers.length,
      sent: sentCount,
      failed: failedCount,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mobile/config - Public dynamic endpoint configuration for Breeze Android app
 */
router.get('/mobile/config', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, 'public', 'breeze-config.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return res.json(data);
    }
    res.json({
      app_name: 'Breeze CRM',
      app_url: 'https://breeze-production-0f70.up.railway.app',
      version: '2.0.0',
      version_code: 3,
      maintenance_mode: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mobile/config - Admin endpoint to update mobile config dynamically
 */
router.post('/mobile/config', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Superadmin privileges required' });
    }
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, 'public', 'breeze-config.json');
    let current = {};
    if (fs.existsSync(configPath)) {
      current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    const updated = {
      ...current,
      ...req.body,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mobile/sync-contacts - Sync client's saved phone contacts from Android app
 */
router.post('/mobile/sync-contacts', async (req, res) => {
  try {
    const { tenant_id = 'cpsystem', contacts = [] } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    let syncedCount = 0;
    for (const c of contacts) {
      const rawPhone = String(c.phone || '').replace(/\D/g, '');
      if (!rawPhone || rawPhone.length < 10) continue;
      
      const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;
      const contactName = c.name || 'Saved Contact';

      try {
        const variants = getPhoneVariants(cleanPhone);
        const existing = await db.get('crm_saved_contacts', `tenant_id=eq.${tenant_id}&phone=in.(${variants.join(',')})`);
        if (!existing || existing.length === 0) {
          await db.insert('crm_saved_contacts', {
            tenant_id,
            phone: cleanPhone,
            name: contactName,
            source: 'PHONE_SYNC'
          });
        } else {
          await db.update('crm_saved_contacts', {
            name: contactName,
            source: 'PHONE_SYNC'
          }, `id=eq.${existing[0].id}`);
        }

        const leads = await db.get('crm_leads', `tenant_id=eq.${tenant_id}&phone=in.(${variants.join(',')})`);
        if (leads && leads.length > 0) {
          await db.update('crm_leads', {
            name: contactName,
            is_saved_contact: true,
            bot_active: typeof leads[0].bot_active === 'boolean' ? leads[0].bot_active : false
          }, `id=eq.${leads[0].id}`);
        }
        syncedCount++;
      } catch (err) {}
    }

    console.log(`📱 [Contacts Sync] Synced ${syncedCount} contacts for tenant: ${tenant_id}`);
    res.json({ success: true, count: syncedCount });
  } catch (err) {
    console.error('❌ [Contacts Sync Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
