const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}
const DB_PATH = path.join(dataDir, 'conversations.json');

class ConversationMemory {
  constructor() {
    this.sessions = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        this.sessions = {};
        for (const [phone, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) {
            this.sessions[phone] = {
              history: val,
              mode: 'default',
              leadClosed: false,
              leadInfo: {}
            };
          } else if (val && typeof val === 'object') {
            this.sessions[phone] = {
              history: Array.isArray(val.history) ? val.history : [],
              mode: val.mode || 'default',
              leadClosed: !!val.leadClosed,
              leadInfo: val.leadInfo || {}
            };
          }
        }
      }
    } catch (e) {
      console.warn('[Memory] Error loading memory, starting fresh:', e.message);
      this.sessions = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Memory] Error saving conversations:', e.message);
    }
  }

  _ensureSession(userPhone, tenantId = 'default') {
    const cleanPhone = userPhone.replace(/\D/g, '');
    const sessionKey = (tenantId && tenantId !== 'default') ? `${cleanPhone}_${tenantId}` : cleanPhone;
    if (!this.sessions[sessionKey]) {
      this.sessions[sessionKey] = {
        history: [],
        mode: tenantId === 'cpsystem' ? 'cp_system' : 'default',
        leadClosed: false,
        leadInfo: {}
      };
    }
    return sessionKey;
  }

  async syncFromSupabase(userPhone, tenantId = 'cpsystem', db = null) {
    const cleanPhone = userPhone.replace(/\D/g, '');
    const sessionKey = this._ensureSession(userPhone, tenantId);

    // If history in memory is empty, fetch recent messages from Supabase
    if (this.sessions[sessionKey].history.length === 0 && db) {
      try {
        const rawPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
        const msgs = await db.get('crm_messages', `tenant_id=eq.${tenantId}&lead_phone=in.(${cleanPhone},${rawPhone})&is_deleted=neq.true&delivery_status=neq.FAILED&order=created_at.desc&limit=100`);
        if (msgs && msgs.length > 0) {
          const restored = msgs
            .filter(m => !m.is_deleted && m.delivery_status !== 'FAILED')
            .reverse()
            .map(m => ({
              role: m.direction === 'INBOUND' ? 'user' : 'model',
              content: m.content,
              timestamp: new Date(m.created_at).getTime()
            }));
          this.sessions[sessionKey].history = restored;
        }
      } catch (err) {
        console.warn('[Memory] Failed to sync messages from Supabase:', err.message);
      }
    }

    // Also sync lead record from crm_leads
    if (db) {
      try {
        const rawPhone = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.slice(2) : cleanPhone;
        const leads = await db.get('crm_leads', `tenant_id=eq.${tenantId}&phone=in.(${cleanPhone},${rawPhone})`);
        if (leads && leads.length > 0) {
          const lead = leads[0];
          const isQualified = lead.status === 'QUALIFIED' || lead.metadata?.step === 'QUALIFIED';
          this.sessions[sessionKey].leadClosed = isQualified;
          this.sessions[sessionKey].leadInfo = {
            name: lead.name,
            requirement: lead.requirement,
            city: lead.city,
            status: lead.status,
            ...(lead.metadata || {})
          };
          return lead;
        }
      } catch (err) {
        console.warn('[Memory] Failed to sync lead info from Supabase:', err.message);
      }
    }
    return null;
  }

  getHistory(userPhone, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    return this.sessions[sessionKey].history;
  }

  getMode(userPhone, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    return this.sessions[sessionKey].mode;
  }

  setMode(userPhone, mode, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    this.sessions[sessionKey].mode = mode;
    this.save();
  }

  isLeadClosed(userPhone, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    return this.sessions[sessionKey].leadClosed;
  }

  getLeadInfo(userPhone, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    return this.sessions[sessionKey].leadInfo || {};
  }

  setLeadClosed(userPhone, isClosed, leadInfo = {}, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    this.sessions[sessionKey].leadClosed = isClosed;
    if (leadInfo && Object.keys(leadInfo).length > 0) {
      this.sessions[sessionKey].leadInfo = {
        ...this.sessions[sessionKey].leadInfo,
        ...leadInfo
      };
    }
    this.save();
  }

  addMessage(userPhone, role, content, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    this.sessions[sessionKey].history.push({
      role, // 'user' or 'model'
      content,
      timestamp: Date.now()
    });

    if (this.sessions[sessionKey].history.length > 100) {
      this.sessions[sessionKey].history = this.sessions[sessionKey].history.slice(-100);
    }
    this.save();
  }

  clearHistory(userPhone, tenantId = 'default') {
    const sessionKey = this._ensureSession(userPhone, tenantId);
    this.sessions[sessionKey].history = [];
    this.sessions[sessionKey].leadClosed = false;
    this.sessions[sessionKey].leadInfo = {};
    this.save();
  }
}

module.exports = new ConversationMemory();
