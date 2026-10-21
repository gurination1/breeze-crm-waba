// Gurination Enterprise CRM - WhatsApp Cloud Platform Client Logic

let state = {
  token: localStorage.getItem('crm_token') || null,
  user: JSON.parse(localStorage.getItem('crm_user') || 'null'),
  currentView: 'home',
  activeLeadPhone: null,
  leads: [],
  tenants: [],
  isMasquerading: false,
  originalUser: null
};

let chatPollInterval = null;
let lastMessageCount = 0;

// Helper: Authenticated Fetch
async function fetchWithAuth(url, options = {}) {
  // Demo Mode Client Guard (Prevent all outbound Meta API calls & mutations)
  if (state.user && (state.user.role === 'demo_admin' || state.user.role === 'demo') && options.method && options.method.toUpperCase() !== 'GET') {
    alert('🔒 Demo Mode (Read-Only): Live Meta WhatsApp API dispatches and mutating database actions are disabled for this preview account.');
    return new Response(JSON.stringify({ error: 'Demo Mode: Read-only preview access.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== 1. INITIALIZATION & AUTH ====================

function init() {
  if (state.token && state.user) {
    showAppShell();
    // Refresh user profile & tenant plan metadata from server
    fetchWithAuth('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          state.user = { ...state.user, ...data.user };
          localStorage.setItem('crm_user', JSON.stringify(state.user));
          showAppShell();
        }
      })
      .catch(() => {});
  } else {
    showLoginView();
  }
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('crm_token', data.token);
    localStorage.setItem('crm_user', JSON.stringify(data.user));

    showAppShell();
  } catch (err) {
    alert('Login Error: ' + err.message);
  }
});

function logout() {
  if (chatPollInterval) clearInterval(chatPollInterval);
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  state.token = null;
  state.user = null;
  state.isMasquerading = false;
  state.originalUser = null;
  showLoginView();
}

function showLoginView() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  lucide.createIcons();
}

function showAppShell() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  document.getElementById('userNameText').textContent = state.user.display_name;

  const logoEl = document.getElementById('headerTenantLogo');
  const titleEl = document.getElementById('headerTenantTitle');
  const subtitleEl = document.getElementById('headerTenantSubtitle');
  const roleBadgeEl = document.getElementById('roleBadge');
  const phoneEl = document.getElementById('headerPhoneDisplay');

  if (state.user.role === 'super_admin' && !state.user.isImpersonating) {
    if (logoEl) logoEl.src = '/gurdharam_logo.svg';
    if (titleEl) titleEl.textContent = 'Gurdharam Enterprise';
    if (subtitleEl) subtitleEl.textContent = 'Master Organization Hub';
    if (roleBadgeEl) {
      roleBadgeEl.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-bold border border-violet-200 uppercase shrink-0';
      roleBadgeEl.textContent = 'SUPER ADMIN';
    }
    if (phoneEl) phoneEl.textContent = 'Master Central Hub';
  } else {
    // Tenant mode (e.g. CP System, Mystery, Demo Sandbox)
    if (logoEl) logoEl.src = (state.user.tenant_id === 'cpsystem') ? '/cpsystem_logo.png' : (state.user.tenant_id === 'demo' ? '/breeze_logo.png' : '/gurdharam_logo.svg');
    if (titleEl) titleEl.textContent = state.user.tenant_name || (state.user.tenant_id === 'cpsystem' ? 'CP System' : (state.user.tenant_id === 'demo' ? 'Apex Solutions (Demo Sandbox)' : 'Client Portal'));
    if (subtitleEl) subtitleEl.textContent = (state.user.tenant_id === 'demo') ? 'Simulated Sandbox Portal' : 'Enterprise WABA Live';
    if (roleBadgeEl) {
      if (state.user.role === 'demo_admin' || state.user.role === 'demo') {
        roleBadgeEl.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300 uppercase shrink-0';
        roleBadgeEl.textContent = 'DEMO (READ-ONLY)';
      } else {
        roleBadgeEl.className = 'text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-softblue-100 text-softblue-800 font-bold border border-softblue-200 uppercase shrink-0';
        roleBadgeEl.textContent = state.user.role.toUpperCase();
      }
    }
    if (phoneEl) phoneEl.textContent = state.user.tenant_phone || (state.user.tenant_id === 'cpsystem' ? '+91 97792 20581' : (state.user.tenant_id === 'demo' ? '+1 (555) 019-2834' : '+91 62803 33252'));
    
    // Plan Badge in Header
    let planBadgeEl = document.getElementById('tenantPlanHeaderBadge');
    if (!planBadgeEl && titleEl && titleEl.parentElement) {
      planBadgeEl = document.createElement('span');
      planBadgeEl.id = 'tenantPlanHeaderBadge';
      titleEl.parentElement.appendChild(planBadgeEl);
    }
    if (planBadgeEl && state.user.tenant_id !== 'system') {
      const pName = state.user.plan_name || 'Starter Nudge (₹5/head)';
      planBadgeEl.className = 'text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-300 ml-2 inline-flex items-center gap-1 cursor-pointer hover:bg-emerald-100 transition';
      planBadgeEl.innerHTML = `<span>★ ${pName}</span> <span class="text-emerald-700 underline text-[8px] font-extrabold uppercase">Upgrade</span>`;
      planBadgeEl.onclick = () => showUpgradeModal(state.user.plan_tier || 'plan_5');
    }
  }

  // Masquerade Banner
  const banner = document.getElementById('masqueradeBanner');
  if (state.user.isImpersonating) {
    banner.classList.remove('hidden');
    document.getElementById('masqueradeName').textContent = state.user.tenant_name || state.user.display_name;
  } else {
    banner.classList.add('hidden');
  }

  // Demo Mode Banner
  const demoBanner = document.getElementById('demoBanner');
  if (demoBanner) {
    if (state.user.role === 'demo_admin' || state.user.role === 'demo') {
      demoBanner.classList.remove('hidden');
    } else {
      demoBanner.classList.add('hidden');
    }
  }

  buildNavTabs();

  if (state.user.role === 'super_admin' && !state.user.isImpersonating) {
    switchView('super_admin');
  } else {
    switchView('home');
  }
}

// ==================== 2. RESPONSIVE NAVIGATION ====================

function getNavigationList() {
  const role = state.user.role;
  const isImpersonating = state.user.isImpersonating;

  if (role === 'super_admin' && !isImpersonating) {
    return [
      { id: 'super_admin_tenants', label: 'Organizations', icon: 'building-2' },
      { id: 'super_admin_leads', label: 'All Inquiries', icon: 'users' },
      { id: 'billable', label: 'Paid Clients', icon: 'receipt' },
      { id: 'super_admin_users', label: 'User Access', icon: 'key' },
      { id: 'super_admin_storage', label: 'Storage & Logs', icon: 'database' }
    ];
  } else if (role === 'admin' || role === 'demo_admin' || role === 'demo' || isImpersonating) {
    return [
      { id: 'home', label: 'Overview', icon: 'activity' },
      { id: 'chats', label: 'Chats', icon: 'message-square' },
      { id: 'followups', label: 'Radar', icon: 'clock' },
      { id: 'billable', label: 'Paid Clients', icon: 'receipt' },
      { id: 'broadcast', label: 'Broadcast', icon: 'send' },
      { id: 'bot_brain', label: 'Brain', icon: 'cpu' },
      { id: 'leads', label: 'Leads', icon: 'users' }
    ];
  } else {
    // Staff role
    return [
      { id: 'home', label: 'Overview', icon: 'activity' },
      { id: 'chats', label: 'Chats', icon: 'message-square' },
      { id: 'followups', label: 'Radar', icon: 'clock' },
      { id: 'billable', label: 'Paid Clients', icon: 'receipt' },
      { id: 'leads', label: 'Leads', icon: 'users' }
    ];
  }
}

function buildNavTabs() {
  const tabs = getNavigationList();

  // Desktop Header Tabs (macOS Segmented Control)
  const desktopContainer = document.getElementById('desktopNavTabs');
  if (desktopContainer) {
    desktopContainer.innerHTML = '';
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = state.currentView === tab.id || 
        (tab.id === 'super_admin_tenants' && state.currentView === 'super_admin') ||
        (tab.id === 'home' && String(state.currentView).startsWith('history_'));
      btn.className = `px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-xs font-semibold shrink-0 ${
        isActive 
          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-bold' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
      }`;
      btn.innerHTML = `<i data-lucide="${tab.icon}" class="w-3.5 h-3.5"></i> <span>${tab.label}</span>`;
      btn.onclick = () => switchView(tab.id);
      desktopContainer.appendChild(btn);
    });
  }

  // Mobile Bottom Navigation Dock
  const mobileContainer = document.getElementById('mobileBottomNav');
  if (mobileContainer) {
    mobileContainer.innerHTML = '';
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = state.currentView === tab.id || 
        (tab.id === 'super_admin_tenants' && state.currentView === 'super_admin') ||
        (tab.id === 'home' && String(state.currentView).startsWith('history_'));
      btn.className = `flex flex-col items-center justify-center flex-1 py-1 transition ${
        isActive ? 'text-[#25D366] font-bold' : 'text-slate-500 hover:text-slate-800'
      }`;
      btn.innerHTML = `
        <i data-lucide="${tab.icon}" class="w-4 h-4 mb-0.5"></i>
        <span class="text-[10px] tracking-tight">${tab.label}</span>
      `;
      btn.onclick = () => switchView(tab.id);
      mobileContainer.appendChild(btn);
    });
  }

  lucide.createIcons();
}

function switchView(viewId) {
  // Clear chat auto-poll timer when navigating away
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }

  // Restore mobile bottom navigation dock & default chat height
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  const chatView = document.getElementById('viewChats');
  if (chatView) {
    chatView.classList.remove('h-[calc(100dvh-70px)]');
    chatView.classList.add('h-[calc(100dvh-135px)]');
  }

  state.currentView = viewId;
  buildNavTabs();

  const views = [
    'superAdmin', 'home', 'chats', 'followups', 'broadcast', 'botBrain', 'leads',
    'historyInquiries', 'historyFollowups', 'historyQualified', 'historyQuota', 'billable'
  ];
  views.forEach(v => {
    const el = document.getElementById('view' + v.charAt(0).toUpperCase() + v.slice(1));
    if (el) el.classList.add('hidden');
  });

  if (viewId === 'super_admin' || viewId.startsWith('super_admin_')) {
    document.getElementById('viewSuperAdmin')?.classList.remove('hidden');
    loadSuperAdminData();
    loadLogStats();
    if (viewId === 'super_admin_tenants') {
      document.getElementById('sectionTenants')?.scrollIntoView({ behavior: 'smooth' });
    } else if (viewId === 'super_admin_leads') {
      document.getElementById('sectionGlobalLeads')?.scrollIntoView({ behavior: 'smooth' });
    } else if (viewId === 'super_admin_users') {
      document.getElementById('sectionUserAccounts')?.scrollIntoView({ behavior: 'smooth' });
    } else if (viewId === 'super_admin_storage') {
      document.getElementById('sectionStorageRetention')?.scrollIntoView({ behavior: 'smooth' });
    }
  } else if (viewId === 'home') {
    document.getElementById('viewHome')?.classList.remove('hidden');
    loadDashboardStats();
    loadLeads();
  } else if (viewId === 'billable') {
    document.getElementById('viewBillable')?.classList.remove('hidden');
    loadBillableData();
  } else if (viewId === 'history_inquiries') {
    document.getElementById('viewHistoryInquiries')?.classList.remove('hidden');
  } else if (viewId === 'history_followups') {
    document.getElementById('viewHistoryFollowups')?.classList.remove('hidden');
  } else if (viewId === 'history_qualified') {
    document.getElementById('viewHistoryQualified')?.classList.remove('hidden');
  } else if (viewId === 'history_quota') {
    document.getElementById('viewHistoryQuota')?.classList.remove('hidden');
  } else if (viewId === 'chats') {
    document.getElementById('viewChats')?.classList.remove('hidden');
    // Mobile reset to contact list initially
    document.getElementById('chatSidebarCol')?.classList.remove('hidden');
    document.getElementById('chatStageCol')?.classList.add('hidden');
    document.getElementById('chatStageCol')?.classList.add('md:flex');
    loadChats();
  } else if (viewId === 'followups') {
    document.getElementById('viewFollowups')?.classList.remove('hidden');
    loadFollowups();
  } else if (viewId === 'broadcast') {
    document.getElementById('viewBroadcast')?.classList.remove('hidden');
    setupBroadcastView();
  } else if (viewId === 'bot_brain') {
    document.getElementById('viewBotBrain')?.classList.remove('hidden');
    loadBotRules();
  } else if (viewId === 'leads') {
    document.getElementById('viewLeads')?.classList.remove('hidden');
    loadLeads();
  }

  lucide.createIcons();
}

// ==================== 3. SUPER ADMIN COMMAND ====================

async function loadSuperAdminData() {
  try {
    const [tRes, uRes, lRes, leadsRes] = await Promise.all([
      fetchWithAuth('/api/tenants'),
      fetchWithAuth('/api/users'),
      fetchWithAuth('/api/audit-logs'),
      fetchWithAuth('/api/leads')
    ]);

    const [tData, uData, lData, leadsData] = await Promise.all([
      tRes.json(),
      uRes.json(),
      lRes.json(),
      leadsRes.json()
    ]);

    if (tData.success) {
      state.tenants = tData.tenants;
      renderTenantsGrid(tData.tenants);

      // Aggregate Fleet KPI Summary
      const totalOutbounds = tData.tenants.reduce((sum, t) => sum + (t.quota_used || 0), 0);
      const totalQuotaPool = tData.tenants.reduce((sum, t) => sum + (t.quota_limit || 2500), 0);
      const freeLeft = Math.max(0, totalQuotaPool - totalOutbounds);

      document.getElementById('superFleetTenantsCount').textContent = tData.tenants.length;
      document.getElementById('superFleetOutboundsCount').textContent = totalOutbounds;
      document.getElementById('superFleetQuotaLeft').textContent = freeLeft.toLocaleString();
    }

    if (leadsData.success) {
      state.leads = leadsData.leads;
      document.getElementById('superFleetLeadsCount').textContent = leadsData.leads.length;
      document.getElementById('superLeadsBadge').textContent = `${leadsData.leads.length} Inquiries`;
      renderSuperAdminLeads(leadsData.leads);
    }

    if (uData.success) renderUserAccounts(uData.users);
    if (lData.success) renderAuditLogs(lData.logs);

  } catch (err) {
    console.error('Super Admin fetch error:', err);
  }
}

async function loadLogStats() {
  try {
    const res = await fetchWithAuth('/api/system/log-stats');
    const data = await res.json();
    if (data.success) {
      const activeEl = document.getElementById('statActiveLogs');
      const batchesEl = document.getElementById('statArchiveBatches');
      const savedEl = document.getElementById('statSpaceSaved');
      if (activeEl) activeEl.textContent = `${data.activeLogsCount} logs`;
      if (batchesEl) batchesEl.textContent = `${data.archiveBatchesCount} archives (${data.totalArchivedRecords} records)`;
      if (savedEl) savedEl.textContent = data.overallRatio;
    }
  } catch (err) {
    console.error('Error loading log stats:', err);
  }
}

async function triggerLogCompression() {
  try {
    const res = await fetchWithAuth('/api/system/compress-logs', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Compression failed');
    alert(`Log Compression Complete!\nArchived: ${data.result.archivedCount || 0} logs\nSpace Saved: ${data.result.compressionRatio || 'N/A'}\nActive Remaining: ${data.result.activeRemaining || 0}`);
    loadSuperAdminData();
    loadLogStats();
  } catch (err) {
    alert('Log Compression Error: ' + err.message);
  }
}

function renderTenantsGrid(tenants) {
  const container = document.getElementById('tenantsGrid');
  if (!container) return;
  container.innerHTML = '';

  tenants.forEach(t => {
    const card = document.createElement('div');
    const limit = t.quota_limit || 2500;
    const used = t.quota_used || 0;
    const pct = Math.min(100, Math.round((used / limit) * 100));

    card.className = 'glass-panel rounded-2xl p-5 hover:shadow-md transition flex flex-col justify-between border border-slate-200/90 shadow-xs space-y-4';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full ${t.is_active ? 'bg-[#25D366] animate-pulse' : 'bg-red-500'}"></span>
            <h4 class="text-base font-bold text-slate-900">${escapeHtml(t.name)}</h4>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${t.is_active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}">
              ${t.is_active ? 'ACTIVE' : 'SUSPENDED'}
            </span>
          </div>
          <span class="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-bold">
            ${escapeHtml(t.phone_display)}
          </span>
        </div>

        <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-3">
          <span>Phone ID: <strong class="text-slate-600">${escapeHtml(t.phone_number_id)}</strong></span>
          <button onclick="navigator.clipboard.writeText('${t.phone_number_id}'); alert('Copied Phone ID');" class="text-softblue-600 hover:underline text-[10px]">Copy</button>
        </div>

        <div class="grid grid-cols-3 gap-2 font-mono text-center my-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <div>
            <div class="text-[10px] text-slate-500 uppercase font-bold">Inquiries</div>
            <div class="text-sm sm:text-base font-extrabold text-slate-900">${t.totalLeads || 0}</div>
          </div>
          <div>
            <div class="text-[10px] text-softblue-700 uppercase font-bold">Dispatches</div>
            <div class="text-sm sm:text-base font-extrabold text-softblue-600">${used} / ${limit}</div>
          </div>
          <div>
            <div class="text-[10px] text-emerald-700 uppercase font-bold">Meta Fee</div>
            <div class="text-[11px] sm:text-xs font-bold text-emerald-700 mt-1">${t.estExpenditure}</div>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
            <span>Pool Usage</span>
            <span>${pct}% used</span>
          </div>
          <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div class="bg-wa-teal h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2 flex-wrap">
        <button onclick="impersonateTenant('${t.id}')" class="px-3 py-1.5 bg-gradient-to-r from-wa-tealLight to-wa-green hover:from-wa-teal hover:to-emerald-600 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Enter Portal
        </button>
        <div class="flex items-center gap-1.5 ml-auto">
          <button onclick="openEditQuotaModal('${t.id}', '${escapeHtml(t.name)}', ${limit}, ${used}, '${t.plan_tier || 'plan_5'}')" class="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition" title="Adjust Plan & Quota">
            ⚙️ Plan & Quota
          </button>
          <button onclick="resetTenantUsage('${t.id}')" class="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition" title="Reset Counter">
            🔄 Reset
          </button>
          <button onclick="toggleTenantActive('${t.id}', ${!t.is_active})" class="px-2.5 py-1.5 ${t.is_active ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'} border rounded-lg text-xs font-bold transition">
            ${t.is_active ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function getLeadStatusBadge(l) {
  if (l.is_handoff_to_staff || Number(l.ai_reply_count) >= 15) {
    return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">🤝 Staff Handoff (15/15)</span>`;
  }
  if (l.is_saved_contact) {
    if (l.bot_active) {
      return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">👤 Contact (🤖 Bot On)</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">👤 Saved Contact</span>`;
  }
  if (l.bot_active) {
    return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">🤖 AI Bot Active</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">⏸️ Human Takeover</span>`;
}

function renderSuperAdminLeads(leads) {
  const tbody = document.getElementById('superAdminLeadsBody');
  const mobileContainer = document.getElementById('superAdminLeadsMobile');
  if (tbody) tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  if (leads.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-slate-400">No client leads recorded yet.</td></tr>`;
    if (mobileContainer) mobileContainer.innerHTML = `<div class="text-center py-4 text-slate-400 text-xs">No client leads recorded yet.</div>`;
    return;
  }

  leads.forEach(l => {
    // Desktop row
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition';
      tr.innerHTML = `
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${l.tenant_id === 'cpsystem' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-softblue-50 text-softblue-800 border-softblue-200'}">
            ${l.tenant_name || l.tenant_id}
          </span>
        </td>
        <td class="px-3 font-bold text-slate-900">${escapeHtml(l.name || 'WhatsApp Contact')}</td>
        <td class="px-3 text-slate-600 font-mono">+${l.phone}</td>
        <td class="px-3 text-slate-700 font-medium truncate max-w-xs">${escapeHtml(l.requirement || 'General Inquiry')}</td>
        <td class="px-3 text-slate-500">${escapeHtml(l.city || 'Punjab')}</td>
        <td class="px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${l.status === 'QUALIFIED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}">${l.status}</span>
        </td>
        <td class="px-3">
          ${getLeadStatusBadge(l)}
        </td>
        <td class="px-3 text-right">
          <button onclick="openChatForPhone('${l.phone}')" class="px-2.5 py-1 bg-softblue-50 hover:bg-softblue-100 text-softblue-800 border border-softblue-200 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1">
            <i data-lucide="message-square" class="w-3 h-3"></i> Chat
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Mobile touch card (zero horizontal sliding)
    if (mobileContainer) {
      const card = document.createElement('div');
      card.className = 'p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-sm space-y-2';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${l.tenant_id === 'cpsystem' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-softblue-50 text-softblue-800 border-softblue-200'}">
              ${l.tenant_name || l.tenant_id}
            </span>
            <span class="text-xs font-bold text-slate-900">${escapeHtml(l.name || 'WhatsApp Contact')}</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${l.status === 'QUALIFIED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}">${l.status}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="font-mono text-slate-600 font-semibold">+${l.phone}</span>
          <span class="text-slate-500">${escapeHtml(l.city || 'Punjab')}</span>
        </div>
        <div class="text-xs text-slate-700 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100">
          ${escapeHtml(l.requirement || 'General Inquiry')}
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-slate-100">
          ${getLeadStatusBadge(l)}
          <button onclick="openChatForPhone('${l.phone}')" class="px-3 py-1 bg-softblue-50 hover:bg-softblue-100 text-softblue-800 border border-softblue-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
            <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Chat
          </button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
  lucide.createIcons();
}

async function impersonateTenant(tenantId) {
  try {
    const res = await fetchWithAuth('/api/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.originalUser = state.user;
    state.token = data.token;
    state.user = data.user;
    state.isMasquerading = true;

    showAppShell();
  } catch (err) {
    alert('Masquerade failed: ' + err.message);
  }
}

function exitMasquerade() {
  if (state.originalUser) {
    state.user = state.originalUser;
    state.originalUser = null;
    state.isMasquerading = false;
    showAppShell();
  } else {
    logout();
  }
}

async function toggleTenantActive(tenantId, nextActive) {
  try {
    const res = await fetchWithAuth(`/api/tenants/${tenantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: nextActive })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadSuperAdminData();
  } catch (err) {
    alert('Error toggling tenant: ' + err.message);
  }
}

function renderUserAccounts(users) {
  const tbody = document.getElementById('userAccountsBody');
  const mobileContainer = document.getElementById('userAccountsMobile');
  if (tbody) tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  users.forEach(u => {
    const isRoot = u.username === 'superadmin';

    // Desktop row
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
      tr.innerHTML = `
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-900">${escapeHtml(u.username)}</div>
          <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(u.display_name || '')}</div>
        </td>
        <td class="px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.role === 'super_admin' ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-slate-700 bg-slate-100 border-slate-200'}">${u.role}</span></td>
        <td class="px-3 text-slate-600 font-mono">${escapeHtml(u.tenant_id)}</td>
        <td class="px-3"><span class="font-bold ${u.is_active ? 'text-emerald-600' : 'text-red-500'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
        <td class="px-3 text-right whitespace-nowrap space-x-1">
          <button onclick="promptResetPassword('${u.id}', '${escapeHtml(u.username)}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded-lg text-slate-700 transition">Reset Pass</button>
          ${!isRoot ? `
            <button onclick="toggleUserActive('${u.id}', ${!u.is_active})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded-lg text-slate-500 transition">${u.is_active ? 'Disable' : 'Enable'}</button>
            <button onclick="deleteUserAccount('${u.id}', '${escapeHtml(u.username)}')" class="px-2 py-1 bg-red-50 hover:bg-red-100 text-[10px] font-bold rounded-lg text-red-600 transition">Delete</button>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Mobile card
    if (mobileContainer) {
      const card = document.createElement('div');
      card.className = 'p-3 bg-white rounded-xl border border-slate-200/90 shadow-xs space-y-2';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <span class="font-bold text-slate-900 text-xs">${escapeHtml(u.username)}</span>
            <span class="text-[10px] text-slate-400 block">${escapeHtml(u.display_name || '')}</span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.role === 'super_admin' ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-slate-700 bg-slate-100 border-slate-200'}">${u.role}</span>
        </div>
        <div class="flex items-center justify-between text-xs text-slate-600 font-mono">
          <span>Tenant: <strong class="text-slate-800">${escapeHtml(u.tenant_id)}</strong></span>
          <span class="font-bold ${u.is_active ? 'text-emerald-600' : 'text-red-500'}">${u.is_active ? 'Active' : 'Disabled'}</span>
        </div>
        <div class="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100">
          <button onclick="promptResetPassword('${u.id}', '${escapeHtml(u.username)}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[11px] font-bold rounded-lg text-slate-700 transition">Reset Pass</button>
          ${!isRoot ? `
            <button onclick="toggleUserActive('${u.id}', ${!u.is_active})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[11px] font-bold rounded-lg text-slate-500 transition">${u.is_active ? 'Disable' : 'Enable'}</button>
            <button onclick="deleteUserAccount('${u.id}', '${escapeHtml(u.username)}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-[11px] font-bold rounded-lg text-red-600 transition">Delete</button>
          ` : ''}
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
}

function openAddTenantModal() {
  document.getElementById('modalAddTenant')?.classList.remove('hidden');
}

function openAddUserModal() {
  document.getElementById('modalAddUser')?.classList.remove('hidden');
}

function onPlanTierSelectChange(tier) {
  const limitInput = document.getElementById('editQuotaLimitVal');
  if (!limitInput) return;
  if (tier === 'plan_3_5') limitInput.value = 0;
  else if (tier === 'plan_5') limitInput.value = 1800;
  else if (tier === 'plan_11') limitInput.value = 3600;
  else if (tier === 'plan_20' || tier === 'plan_28') limitInput.value = 7200;
}

function showUpgradeModal(currentTier) {
  document.getElementById('modalUpgradePlan')?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function requestPlanUpgrade(newTier) {
  const tierNames = {
    plan_5: 'Starter Nudge (₹5/head)',
    plan_11: 'Active Growth (₹11/head)',
    plan_20: 'Weekly Retargeting (₹20/head)',
    plan_28: 'Dominance / Omnipresence (₹28/head)'
  };
  closeModal('modalUpgradePlan');
  alert(`🚀 Upgrade request for ${tierNames[newTier] || newTier} submitted!\nSuper Admin (+91 90411 72159) has been notified to activate your quota.`);
}

function openEditQuotaModal(tenantId, tenantName, currentLimit, currentUsed, planTier) {
  document.getElementById('editQuotaTenantId').value = tenantId;
  document.getElementById('editQuotaTenantName').textContent = `${tenantName} (${tenantId})`;
  document.getElementById('editQuotaLimitVal').value = currentLimit || 1800;
  const tierSelect = document.getElementById('editQuotaPlanTier');
  if (tierSelect) tierSelect.value = planTier || 'plan_5';
  document.getElementById('editQuotaResetUsed').checked = false;
  document.getElementById('modalEditQuota')?.classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

async function handleAddTenant(e) {
  e.preventDefault();
  const id = document.getElementById('newTenantId').value.trim();
  const name = document.getElementById('newTenantName').value.trim();
  const phone_number_id = document.getElementById('newTenantPhoneId').value.trim();
  const phone_display = document.getElementById('newTenantPhoneDisplay').value.trim();
  const quota_limit = parseInt(document.getElementById('newTenantQuotaLimit').value, 10) || 2500;

  try {
    const res = await fetchWithAuth('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({ id, name, phone_number_id, phone_display, quota_limit })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeModal('modalAddTenant');
    document.getElementById('formAddTenant').reset();
    alert(`✅ Business '${name}' registered successfully!`);
    loadSuperAdminData();
  } catch (err) {
    alert('Error adding business: ' + err.message);
  }
}

async function handleAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newUserPassword').value.trim();
  const display_name = document.getElementById('newUserDisplayName').value.trim();
  const role = document.getElementById('newUserRole').value;
  const tenant_id = document.getElementById('newUserTenant').value;

  try {
    const res = await fetchWithAuth('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name, role, tenant_id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeModal('modalAddUser');
    document.getElementById('formAddUser').reset();
    alert(`✅ User '${username}' created!`);
    loadSuperAdminData();
  } catch (err) {
    alert('Error creating user: ' + err.message);
  }
}

async function handleEditQuota(e) {
  e.preventDefault();
  const tenantId = document.getElementById('editQuotaTenantId').value;
  const quota_limit = parseInt(document.getElementById('editQuotaLimitVal').value, 10);
  const plan_tier = document.getElementById('editQuotaPlanTier')?.value || 'plan_5';
  const resetUsed = document.getElementById('editQuotaResetUsed').checked;

  const body = { quota_limit, plan_tier };
  if (resetUsed) body.quota_used = 0;

  try {
    const res = await fetchWithAuth(`/api/tenants/${tenantId}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeModal('modalEditQuota');
    alert(`✅ Tenant plan updated to '${plan_tier}' with quota ${quota_limit}!`);
    loadSuperAdminData();
  } catch (err) {
    alert('Error updating quota: ' + err.message);
  }
}

async function resetTenantUsage(tenantId) {
  if (!confirm(`Reset message usage counter to 0 for tenant '${tenantId}'?`)) return;
  try {
    const res = await fetchWithAuth(`/api/tenants/${tenantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quota_used: 0 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('✅ Usage counter reset to 0');
    loadSuperAdminData();
  } catch (err) {
    alert('Error resetting usage: ' + err.message);
  }
}

async function deleteUserAccount(userId, username) {
  if (!confirm(`Permanently delete user account '${username}'?`)) return;
  try {
    const res = await fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert(`✅ User '${username}' deleted.`);
    loadSuperAdminData();
  } catch (err) {
    alert('Error deleting user: ' + err.message);
  }
}

async function promptResetPassword(userId, username) {
  const newPass = prompt(`Enter new password for ${username}:`);
  if (!newPass) return;
  try {
    const res = await fetchWithAuth(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('Password updated successfully');
    loadSuperAdminData();
  } catch (err) {
    alert('Error updating password: ' + err.message);
  }
}

async function toggleUserActive(userId, is_active) {
  try {
    await fetchWithAuth(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active })
    });
    loadSuperAdminData();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('auditLogsBody');
  const mobileContainer = document.getElementById('auditLogsMobile');
  if (tbody) tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  logs.forEach(l => {
    const dateStr = new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Desktop row
    if (tbody) {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition text-[11px]';
      tr.innerHTML = `
        <td class="py-2 px-3 text-slate-500">${dateStr}</td>
        <td class="px-3 text-slate-900 font-semibold">${escapeHtml(l.actor_username)}</td>
        <td class="px-3 text-softblue-700 font-bold">${escapeHtml(l.action)}</td>
        <td class="px-3 text-slate-500">${escapeHtml(l.tenant_id || 'system')}</td>
        <td class="px-3 text-slate-600 font-mono truncate max-w-xs">${escapeHtml(JSON.stringify(l.details))}</td>
      `;
      tbody.appendChild(tr);
    }

    // Mobile card
    if (mobileContainer) {
      const card = document.createElement('div');
      card.className = 'p-2.5 bg-white rounded-xl border border-slate-200/90 text-xs font-mono space-y-1';
      card.innerHTML = `
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-bold text-softblue-700">${escapeHtml(l.action)}</span>
          <span class="text-slate-400">${dateStr}</span>
        </div>
        <div class="flex items-center justify-between text-slate-600 text-[11px]">
          <span>By: <strong>${escapeHtml(l.actor_username)}</strong></span>
          <span>Org: ${escapeHtml(l.tenant_id || 'system')}</span>
        </div>
        <div class="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded truncate">
          ${escapeHtml(JSON.stringify(l.details))}
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
}

// ==================== 4. DASHBOARD & LIVE PULSE ====================

async function loadDashboardStats() {
  try {
    const res = await fetchWithAuth('/api/dashboard/stats');
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;
    if (document.getElementById('statInquiries')) document.getElementById('statInquiries').textContent = s.inquiries;
    if (document.getElementById('statFollowups')) document.getElementById('statFollowups').textContent = s.followups;
    if (document.getElementById('statQualified')) document.getElementById('statQualified').textContent = s.qualified;
    if (document.getElementById('statQuotaLeft')) document.getElementById('statQuotaLeft').textContent = `${(s.quota_left || 0).toLocaleString()} / ${(s.quota_limit || 2500).toLocaleString()}`;
    if (document.getElementById('statQuotaSubtext')) document.getElementById('statQuotaSubtext').textContent = `${s.quota_used || 0} used · Meta Free Tier Threshold`;

    // Billable Clients / Reach Card 4
    if (document.getElementById('statBillableHeads')) {
      document.getElementById('statBillableHeads').textContent = `${s.billed_heads || 0} Heads`;
    }
    if (document.getElementById('statBillableAmount')) {
      document.getElementById('statBillableAmount').textContent = `₹${Number(s.billed_inr || 0).toFixed(2)}`;
    }
    if (document.getElementById('statBillableSubtext')) {
      document.getElementById('statBillableSubtext').textContent = `${s.total_dispatches || 0} dispatches · ₹5/head flat`;
    }

    if (data.tenant && (state.user?.role !== 'super_admin' || state.user?.isImpersonating)) {
      document.getElementById('headerTenantTitle').textContent = data.tenant.id === 'cpsystem' ? 'CP System' : data.tenant.name;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadLeads() {
  try {
    const res = await fetchWithAuth('/api/leads');
    const data = await res.json();
    if (!data.success) return;

    state.leads = data.leads;

    // Render Hot Leads Feed
    const feed = document.getElementById('hotLeadsFeed');
    if (feed) {
      feed.innerHTML = '';
      const hot = data.leads.filter(l => l.status === 'QUALIFIED' || l.status === 'NEW').slice(0, 4);
      document.getElementById('hotLeadsCount').textContent = `${hot.length} Needs Attention`;

      hot.forEach(l => {
        const item = document.createElement('div');
        item.className = 'p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/70 transition';
        item.innerHTML = `
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-900">${l.name || 'New Client'}</span>
              <span class="text-[11px] font-mono text-slate-500 font-semibold">+${l.phone}</span>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${l.status === 'QUALIFIED' ? 'bg-amber-100 text-amber-800' : 'bg-softblue-100 text-softblue-800'}">${l.status}</span>
            </div>
            <div class="text-xs text-slate-700 mt-1 font-medium">${l.requirement || 'General Inquiry'} ${l.city ? '· ' + l.city : ''}</div>
          </div>
          <div class="flex items-center gap-2 self-end sm:self-auto">
            <a href="tel:${l.phone}" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-xs font-mono font-semibold text-emerald-700 rounded-lg shadow-sm transition flex items-center gap-1">
              <i data-lucide="phone" class="w-3 h-3 text-emerald-600"></i> Call
            </a>
            <button onclick="openChatForPhone('${l.phone}')" class="px-3 py-1.5 bg-[#25D366] hover:bg-emerald-600 text-xs font-mono font-bold text-white rounded-lg shadow-sm transition flex items-center gap-1">
              <i data-lucide="message-square" class="w-3 h-3"></i> Chat
            </button>
          </div>
        `;
        feed.appendChild(item);
      });
    }

    // Render Leads Table Sheet & Mobile Cards via Two-Way Filter Engine
    applyLeadFilters();
  } catch (err) {
    console.error('Leads error:', err);
  }
}

let currentLeadStageFilter = 'ALL';
let currentLeadTypeFilter = 'ALL';

function setLeadStageFilter(stage) {
  currentLeadStageFilter = stage;
  const stages = ['ALL', 'QUALIFIED', 'NEW', 'RADAR', 'WON'];
  stages.forEach(s => {
    const btn = document.getElementById(`pillStage_${s}`);
    if (btn) {
      if (s === stage) {
        btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-900 text-white shadow-xs';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200';
      }
    }
  });
  applyLeadFilters();
}

function setLeadTypeFilter(type) {
  currentLeadTypeFilter = type;
  const types = ['ALL', 'COMPLAINT', 'REPAIR', 'SALES', 'OTHER'];
  types.forEach(t => {
    const btn = document.getElementById(`pillType_${t}`);
    if (btn) {
      if (t === type) {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-900 text-white shadow-xs';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200';
      }
    }
  });
  const typeSelect = document.getElementById('leadTypeSelect');
  if (typeSelect) typeSelect.value = type;
  applyLeadFilters();
}

function getLeadInquiryType(l) {
  if (l.metadata && l.metadata.inquiry_type) {
    return l.metadata.inquiry_type;
  }
  if (l.status === 'COMPLAINT') return 'COMPLAINT';
  if (l.status === 'REPAIR') return 'REPAIR';
  const text = ((l.requirement || '') + ' ' + (l.name || '')).toLowerCase();
  if (/\b(complaint|shikayat|problem|issue|kharab|leak|cooling nahi|not working|breakdown|leakage)\b/i.test(text)) {
    return 'COMPLAINT';
  }
  if (/\b(repair|service|servicing|filter change|part change|maintenance|technician|mechanic|gas)\b/i.test(text)) {
    return 'REPAIR';
  }
  if (/\b(chiller|ro|plant|purification|heat pump|ton|lph|milk|dairy|cold room)\b/i.test(text)) {
    return 'SALES';
  }
  return 'OTHER';
}

function getLeadEquipment(l) {
  const text = ((l.requirement || '') + ' ' + (l.name || '')).toLowerCase();
  if (/\b(chiller|chillers|cooling|milk|dairy|bmc|cold room|glycol|ton)\b/i.test(text)) return 'CHILLER';
  if (/\b(ro|water|purification|filter|softener|dm|bottling|lph)\b/i.test(text)) return 'RO';
  if (/\b(heat\s*pump|water\s*heater|heating)\b/i.test(text)) return 'HEATPUMP';
  return 'OTHER';
}

function applyLeadFilters() {
  if (!state.leads) return;

  const searchVal = (document.getElementById('leadSearchInput')?.value || '').toLowerCase().trim();
  const brandVal = document.getElementById('leadBrandFilter')?.value || 'ALL';
  const typeSelectVal = document.getElementById('leadTypeSelect')?.value || 'ALL';
  const productVal = document.getElementById('leadProductFilter')?.value || 'ALL';

  const effectiveTypeFilter = typeSelectVal !== 'ALL' ? typeSelectVal : currentLeadTypeFilter;

  // 1. Update Counts for Stage Pills
  const countAll = state.leads.length;
  const countQualified = state.leads.filter(l => l.status === 'QUALIFIED').length;
  const countNew = state.leads.filter(l => l.status === 'NEW' || l.status === 'INQUIRY').length;
  const countRadar = state.leads.filter(l => {
    const st = String(l.status || '').toUpperCase();
    return !['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'COMPLAINT', 'REPAIR', 'SAVED_CONTACT'].includes(st) && !l.is_saved_contact && !l.was_qualified && l.followup_enabled !== false && l.followup_due_at;
  }).length;
  const countWon = state.leads.filter(l => l.status === 'WON').length;

  if (document.getElementById('badgeStage_ALL')) document.getElementById('badgeStage_ALL').innerText = countAll;
  if (document.getElementById('badgeStage_QUALIFIED')) document.getElementById('badgeStage_QUALIFIED').innerText = countQualified;
  if (document.getElementById('badgeStage_NEW')) document.getElementById('badgeStage_NEW').innerText = countNew;
  if (document.getElementById('badgeStage_RADAR')) document.getElementById('badgeStage_RADAR').innerText = countRadar;
  if (document.getElementById('badgeStage_WON')) document.getElementById('badgeStage_WON').innerText = countWon;

  // 2. Update Counts for Inquiry Type Pills
  const countTypeAll = state.leads.length;
  const countComplaint = state.leads.filter(l => getLeadInquiryType(l) === 'COMPLAINT').length;
  const countRepair = state.leads.filter(l => getLeadInquiryType(l) === 'REPAIR').length;
  const countSales = state.leads.filter(l => getLeadInquiryType(l) === 'SALES').length;
  const countOther = state.leads.filter(l => getLeadInquiryType(l) === 'OTHER').length;

  if (document.getElementById('badgeType_ALL')) document.getElementById('badgeType_ALL').innerText = countTypeAll;
  if (document.getElementById('badgeType_COMPLAINT')) document.getElementById('badgeType_COMPLAINT').innerText = countComplaint;
  if (document.getElementById('badgeType_REPAIR')) document.getElementById('badgeType_REPAIR').innerText = countRepair;
  if (document.getElementById('badgeType_SALES')) document.getElementById('badgeType_SALES').innerText = countSales;
  if (document.getElementById('badgeType_OTHER')) document.getElementById('badgeType_OTHER').innerText = countOther;

  // 3. Filter leads
  let filtered = state.leads.filter(l => {
    // Stage Filter
    if (currentLeadStageFilter === 'QUALIFIED' && l.status !== 'QUALIFIED') return false;
    if (currentLeadStageFilter === 'NEW' && l.status !== 'NEW' && l.status !== 'INQUIRY') return false;
    if (currentLeadStageFilter === 'RADAR') {
      const st = String(l.status || '').toUpperCase();
      if (['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'COMPLAINT', 'REPAIR', 'SAVED_CONTACT'].includes(st) || l.is_saved_contact || l.was_qualified || l.followup_enabled === false || !l.followup_due_at) return false;
    }
    if (currentLeadStageFilter === 'WON' && l.status !== 'WON') return false;

    // Type Filter (Complaints vs Repairs vs Sales vs Others)
    if (effectiveTypeFilter !== 'ALL') {
      const inqType = getLeadInquiryType(l);
      if (inqType !== effectiveTypeFilter) return false;
    }

    // Equipment Filter
    if (productVal !== 'ALL') {
      const eq = getLeadEquipment(l);
      if (eq !== productVal) return false;
    }

    // Brand Filter
    if (brandVal !== 'ALL') {
      if ((l.tenant_id || 'cpsystem') !== brandVal) return false;
    }

    // Search Filter
    if (searchVal) {
      const matchesSearch =
        (l.name || '').toLowerCase().includes(searchVal) ||
        String(l.phone || '').includes(searchVal) ||
        (l.requirement || '').toLowerCase().includes(searchVal) ||
        (l.city || '').toLowerCase().includes(searchVal);
      if (!matchesSearch) return false;
    }

    return true;
  });

  // 4. Render Table and Cards
  const tableBody = document.getElementById('leadsTableBody');
  const cardsContainer = document.getElementById('leadsCardsMobile');
  if (!tableBody || !cardsContainer) return;

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 font-mono text-xs">No leads matching current filters.</td></tr>`;
    cardsContainer.innerHTML = `<div class="text-center py-8 text-slate-400 font-mono text-xs">No leads matching current filters.</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const isQual = l.status === 'QUALIFIED';
    const isWon = l.status === 'WON';
    const statusPill = isQual 
      ? 'bg-amber-100 text-amber-800 border-amber-200' 
      : (isWon ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200');

    const inqType = getLeadInquiryType(l);
    let typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">📋 Other</span>';
    if (inqType === 'COMPLAINT') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-200">🚨 Complaint</span>';
    } else if (inqType === 'REPAIR') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-100 text-sky-800 border-sky-200">🔧 Repair</span>';
    } else if (inqType === 'SALES') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-200">❄️ Sales</span>';
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(l.name || 'Inquiry Contact')}</td>
        <td class="px-4 text-slate-700 font-mono">+${cleanPhone}</td>
        <td class="px-4">${typePill}</td>
        <td class="px-4 text-slate-700 font-medium">${escapeHtml(l.requirement || '---')}</td>
        <td class="px-4 text-slate-500">${escapeHtml(l.city || 'Punjab')}</td>
        <td class="px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill}">${l.status}</span></td>
        <td class="px-4">${getLeadStatusBadge(l)}</td>
        <td class="px-4 text-right whitespace-nowrap space-x-1">
          <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1">
            <i data-lucide="message-square" class="w-3 h-3"></i> Chat
          </button>
          <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1">
            WA
          </a>
        </td>
      </tr>
    `;
  }).join('');

  cardsContainer.innerHTML = filtered.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const isQual = l.status === 'QUALIFIED';
    const isWon = l.status === 'WON';
    const statusPill = isQual 
      ? 'bg-amber-100 text-amber-800 border-amber-200' 
      : (isWon ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200');

    const inqType = getLeadInquiryType(l);
    let typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">📋 Other</span>';
    if (inqType === 'COMPLAINT') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-200">🚨 Complaint</span>';
    } else if (inqType === 'REPAIR') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-100 text-sky-800 border-sky-200">🔧 Repair</span>';
    } else if (inqType === 'SALES') {
      typePill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-200">❄️ Sales</span>';
    }

    return `
      <div class="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-xs space-y-2.5">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-slate-900">${escapeHtml(l.name || 'Inquiry Contact')}</span>
            <span class="text-[11px] font-mono text-slate-500 font-semibold block">+${cleanPhone}</span>
          </div>
          <div class="flex items-center gap-1.5">
            ${typePill}
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPill}">${l.status}</span>
          </div>
        </div>
        <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
          <div class="font-medium text-slate-800">${escapeHtml(l.requirement || 'General Inquiry')}</div>
          <div class="text-slate-500 text-[11px] mt-0.5">City: ${escapeHtml(l.city || 'Punjab')} · Brand: <span class="font-bold text-slate-700">${escapeHtml(l.tenant_id || 'cpsystem')}</span></div>
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-slate-100">
          ${getLeadStatusBadge(l)}
          <div class="flex items-center gap-1.5">
            <button onclick="openChatForPhone('${cleanPhone}')" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
              <i data-lucide="message-square" class="w-3.5 h-3.5 text-emerald-600"></i> Chat
            </button>
            <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition">
              WA
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ==================== 5. CHATS (MOBILE & DESKTOP WITH REAL-TIME SENDER) ====================

async function loadChats() {
  await loadLeads();

  const container = document.getElementById('chatContactsList');
  container.innerHTML = '';

  const cleanActive = String(state.activeLeadPhone || '').replace(/\D/g, '');
  const activeStillExists = state.leads && state.leads.some(l => String(l.phone || '').replace(/\D/g, '') === cleanActive);
  if (!activeStillExists) {
    state.activeLeadPhone = null;
    lastMessageCount = 0;
  }

  if (!state.leads || state.leads.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400 font-mono">
        No active leads found in database.
      </div>
    `;
    const stream = document.getElementById('messagesStream');
    if (stream) {
      stream.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-xs text-slate-400 font-mono gap-2 py-12">
          <span>No active chat. Send a WhatsApp message to +91 97792 20581 to start.</span>
        </div>
      `;
    }
    return;
  }

  state.leads.forEach(lead => {
    const cleanLeadPhone = String(lead.phone || '').replace(/\D/g, '');
    const isSelected = state.activeLeadPhone && state.activeLeadPhone === cleanLeadPhone;

    const inqType = getLeadInquiryType(lead);
    let typeBadge = '';
    if (inqType === 'COMPLAINT') typeBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold border border-rose-200 shrink-0">🚨 Complaint</span>';
    else if (inqType === 'REPAIR') typeBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 font-bold border border-sky-200 shrink-0">🔧 Repair</span>';
    else if (inqType === 'SALES') typeBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 shrink-0">❄️ Sales</span>';

    const item = document.createElement('div');
    item.id = `contact-tab-${cleanLeadPhone}`;
    item.className = `p-3.5 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between contact-card ${
      isSelected ? 'bg-emerald-50 border-l-4 border-wa-green shadow-sm' : ''
    }`;
    item.onclick = () => selectChat(lead);
    item.innerHTML = `
      <div class="truncate pr-2 min-w-0 flex-1">
        <div class="flex items-center gap-1.5 mb-0.5">
          <span class="text-xs font-bold text-slate-900 truncate">${escapeHtml(lead.name || lead.phone)}</span>
          ${typeBadge}
          ${lead.is_saved_contact 
            ? (lead.bot_active 
                ? '<span class="text-[9px] font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">👤 Contact (🤖 Bot)</span>' 
                : '<span class="text-[9px] font-mono text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">👤 Contact</span>')
            : (lead.bot_active 
                ? '<span class="text-[9px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">🤖 AI Bot</span>' 
                : '<span class="text-[9px] font-mono text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">⏸️ Takeover</span>')}
        </div>
        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(lead.requirement || 'Tap to view conversation')}</div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="event.stopPropagation(); promptDeleteChatPhone('${cleanLeadPhone}', '${escapeHtml(lead.name || cleanLeadPhone).replace(/'/g, "\\'")}')" title="Delete chat & contact" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition opacity-70 hover:opacity-100">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400"></i>
      </div>
    `;
    container.appendChild(item);
  });

  if (window.innerWidth >= 768 && state.leads.length > 0 && !state.activeLeadPhone) {
    selectChat(state.leads[0]);
  } else if (state.activeLeadPhone) {
    const activeLead = state.leads.find(l => String(l.phone || '').replace(/\D/g, '') === state.activeLeadPhone);
    if (activeLead) {
      selectChat(activeLead);
    }
  }
  lucide.createIcons();
}

function openChatForPhone(phone) {
  const clean = String(phone).replace(/\D/g, '');
  const lead = state.leads.find(l => String(l.phone).replace(/\D/g, '') === clean);
  if (lead) {
    switchView('chats');
    selectChat(lead);
  } else {
    // Lead not in memory yet, load leads first
    loadLeads().then(() => {
      const found = state.leads.find(l => String(l.phone).replace(/\D/g, '') === clean);
      switchView('chats');
      if (found) selectChat(found);
    });
  }
}

async function selectChat(lead) {
  // Clear any previous chat poll interval
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }

  const cleanLeadPhone = String(lead.phone || '').replace(/\D/g, '');
  state.activeLeadPhone = cleanLeadPhone;
  lastMessageCount = 0;

  // Immediately clear messages stream with contact-specific loader to prevent cross-contact bleed
  const stream = document.getElementById('messagesStream');
  if (stream) {
    stream.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-xs text-slate-400 font-mono gap-2.5 py-12">
        <div class="w-7 h-7 rounded-full border-2 border-wa-green border-t-transparent animate-spin"></div>
        <span>Syncing verified live WhatsApp thread for +${cleanLeadPhone}...</span>
      </div>
    `;
  }

  // Immediately update contact sidebar green highlight across all contacts
  document.querySelectorAll('.contact-card').forEach(el => {
    el.classList.remove('bg-emerald-50', 'border-l-4', 'border-wa-green', 'shadow-sm');
  });
  const currentTab = document.getElementById(`contact-tab-${cleanLeadPhone}`);
  if (currentTab) {
    currentTab.classList.add('bg-emerald-50', 'border-l-4', 'border-wa-green', 'shadow-sm');
  }

  // Mobile View Navigation: Hide contacts sidebar, reveal stage, hide dock, expand height
  if (window.innerWidth < 768) {
    document.getElementById('chatSidebarCol')?.classList.add('hidden');
    document.getElementById('chatStageCol')?.classList.remove('hidden');
    document.getElementById('chatStageCol')?.classList.add('flex');
    document.getElementById('mobileBottomNav')?.classList.add('hidden');
    const chatView = document.getElementById('viewChats');
    if (chatView) {
      chatView.classList.remove('h-[calc(100dvh-135px)]');
      chatView.classList.add('h-[calc(100dvh-70px)]');
    }
  }

  document.getElementById('activeChatName').textContent = lead.name || 'Inquiry Contact';
  document.getElementById('activeChatPhone').textContent = `+${lead.phone} · ${lead.city || 'Punjab'}`;
  document.getElementById('activeChatAvatar').textContent = (lead.name ? lead.name.charAt(0) : '?').toUpperCase();

  // Update Takeover Button UI & Reveal Delete and Edit Buttons
  updateTakeoverUI(lead);
  document.getElementById('btnDeleteChat')?.classList.remove('hidden');
  document.getElementById('btnEditContactName')?.classList.remove('hidden');

  // Initial Messages Fetch
  await fetchAndRenderMessages(lead);

  // Start Real-Time Auto-Polling (every 2.5 seconds)
  chatPollInterval = setInterval(async () => {
    if (state.currentView === 'chats' && state.activeLeadPhone === cleanLeadPhone) {
      await fetchAndRenderMessages(lead, true);
    }
  }, 2500);

  lucide.createIcons();
}

async function promptEditContactName() {
  if (!state.activeLeadPhone) return;
  const lead = state.leads?.find(l => String(l.phone || '').replace(/\D/g, '') === state.activeLeadPhone);
  const currentName = lead?.name || '';
  const newName = prompt('Enter contact name (as saved in address book / WhatsApp):', currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;

  try {
    const res = await fetchWithAuth(`/api/leads/${state.activeLeadPhone}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update contact name');

    if (lead) {
      lead.name = data.name;
      lead.is_saved_contact = true;
      lead.bot_active = false;
    }
    const nameEl = document.getElementById('activeChatName');
    if (nameEl) nameEl.textContent = data.name;
    const avatarEl = document.getElementById('activeChatAvatar');
    if (avatarEl) avatarEl.textContent = data.name.charAt(0).toUpperCase();

    renderContactList(state.leads);
    updateTakeoverUI(lead);
    lucide.createIcons();
  } catch (err) {
    alert('Failed to update contact name: ' + err.message);
  }
}

function updateTakeoverUI(lead) {
  const takeoverBtn = document.getElementById('btnTakeover');
  const banner = document.getElementById('takeoverStatusBanner');
  if (!takeoverBtn || !banner) return;

  takeoverBtn.classList.remove('hidden');

  if (lead.is_saved_contact) {
    // Saved Contact: Human chat active by default
    if (lead.bot_active) {
      takeoverBtn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-sm bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900';
      takeoverBtn.innerHTML = `<i data-lucide="user-x" class="w-3.5 h-3.5 text-amber-600"></i> <span>Take Over</span>`;
      banner.className = 'px-3 sm:px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-[11px] sm:text-xs flex items-center justify-between font-mono shrink-0';
      banner.innerHTML = `
        <div class="flex items-center gap-1.5 truncate mr-2">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span class="truncate"><strong>BOT ASSIGNED:</strong> AI auto-replying to this saved contact.</span>
        </div>
        <button onclick="takeoverChat()" class="text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950 shrink-0">Disable Bot</button>
      `;
      banner.classList.remove('hidden');
    } else {
      takeoverBtn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-sm bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800';
      takeoverBtn.innerHTML = `<i data-lucide="bot" class="w-3.5 h-3.5 text-indigo-600"></i> <span>Assign to Bot</span>`;
      banner.className = 'px-3 sm:px-4 py-2 bg-indigo-50/80 border-b border-indigo-200 text-indigo-900 text-[11px] sm:text-xs flex items-center justify-between font-mono shrink-0';
      banner.innerHTML = `
        <div class="flex items-center gap-1.5 truncate mr-2">
          <span class="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
          <span class="truncate"><strong>SAVED CONTACT:</strong> Direct Human Chat (Bot is OFF).</span>
        </div>
        <button onclick="takeoverChat()" class="text-[11px] font-bold text-indigo-800 underline hover:text-indigo-950 shrink-0">Enable Bot</button>
      `;
      banner.classList.remove('hidden');
    }
  } else {
    // Unsaved Contact (New Customer Lead)
    if (lead.bot_active) {
      takeoverBtn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-sm bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900';
      takeoverBtn.innerHTML = `<i data-lucide="user-x" class="w-3.5 h-3.5 text-amber-600"></i> <span>Take Over</span>`;
      banner.classList.add('hidden');
    } else {
      takeoverBtn.className = 'px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono font-bold transition flex items-center gap-1 sm:gap-1.5 shadow-sm bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900';
      takeoverBtn.innerHTML = `<i data-lucide="bot" class="w-3.5 h-3.5 text-emerald-600"></i> <span>Resume Bot</span>`;
      banner.className = 'px-3 sm:px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] sm:text-xs flex items-center justify-between font-mono shrink-0';
      banner.innerHTML = `
        <div class="flex items-center gap-1.5 truncate mr-2">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
          <span class="truncate"><strong>TAKEOVER ACTIVE:</strong> Bot silenced for this inquiry.</span>
        </div>
        <button onclick="takeoverChat()" class="text-[11px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0">Resume Bot</button>
      `;
      banner.classList.remove('hidden');
    }
  }

  lucide.createIcons();
}

function mobileBackToContacts() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
  document.getElementById('btnDeleteChat')?.classList.add('hidden');
  document.getElementById('btnEditContactName')?.classList.add('hidden');
  document.getElementById('chatSidebarCol')?.classList.remove('hidden');
  document.getElementById('chatStageCol')?.classList.add('hidden');
  document.getElementById('chatStageCol')?.classList.remove('flex');
  document.getElementById('mobileBottomNav')?.classList.remove('hidden');
  const chatView = document.getElementById('viewChats');
  if (chatView) {
    chatView.classList.remove('h-[calc(100dvh-70px)]');
    chatView.classList.add('h-[calc(100dvh-135px)]');
  }
}

// ==================== DELETE CHAT & CONTACT CONTROLLERS ====================
let pendingDeletePhone = null;
let pendingDeleteName = null;

function promptDeleteCurrentChat() {
  if (!state.activeLeadPhone) return;
  const lead = state.leads?.find(l => String(l.phone || '').replace(/\D/g, '') === state.activeLeadPhone);
  promptDeleteChatPhone(state.activeLeadPhone, lead?.name || state.activeLeadPhone);
}

function promptDeleteChatPhone(phone, name) {
  pendingDeletePhone = String(phone).replace(/\D/g, '');
  pendingDeleteName = name || phone;
  const modalText = document.getElementById('deleteChatModalText');
  if (modalText) {
    modalText.innerHTML = `Do you really want to delete the chat with <strong>${escapeHtml(pendingDeleteName)}</strong> (+${pendingDeletePhone})? This will archive the conversation from your active inbox while preserving lifetime usage stats and history.`;
  }
  document.getElementById('modalConfirmDeleteChat')?.classList.remove('hidden');
  lucide.createIcons();
}

async function executeDeleteChat() {
  if (!pendingDeletePhone) return;
  const btn = document.getElementById('btnConfirmDeleteChatAction');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> <span>Deleting...</span>`;
  lucide.createIcons();

  const phoneToDelete = pendingDeletePhone;

  try {
    const res = await fetchWithAuth(`/api/leads/${phoneToDelete}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete chat');

    closeModal('modalConfirmDeleteChat');

    // If active chat was deleted, reset stage
    if (state.activeLeadPhone === phoneToDelete) {
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }
      state.activeLeadPhone = null;
      lastMessageCount = 0;
      document.getElementById('btnTakeover')?.classList.add('hidden');
      document.getElementById('btnDeleteChat')?.classList.add('hidden');
      document.getElementById('btnEditContactName')?.classList.add('hidden');
      document.getElementById('activeChatName').textContent = 'Select a conversation';
      document.getElementById('activeChatPhone').textContent = '---';
      document.getElementById('activeChatAvatar').textContent = '?';
      const stream = document.getElementById('messagesStream');
      if (stream) {
        stream.innerHTML = `
          <div class="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Chat deleted. Select another conversation to view.
          </div>
        `;
      }
    }

    // Refresh data
    await loadLeads();
    await loadChats();
  } catch (err) {
    alert('Error deleting chat: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    pendingDeletePhone = null;
    pendingDeleteName = null;
    lucide.createIcons();
  }
}

let lastMessageStatusHash = '';

function update24HourWindowBanner(isWithin24h, lastInboundAt) {
  const banner = document.getElementById('window24hBanner');
  const msgEl = document.getElementById('window24hStatusMsg');
  const badgeEl = document.getElementById('window24hBadge');
  if (!banner || !msgEl || !badgeEl) return;

  banner.classList.remove('hidden');
  if (isWithin24h) {
    banner.className = 'mb-2 px-3 py-1.5 rounded-xl text-[11px] font-mono flex items-center justify-between gap-2 border bg-emerald-50 border-emerald-200 text-emerald-800';
    msgEl.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600 inline mr-1"></i> 24h Customer Window Active (Direct Chat Open)`;
    badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    badgeEl.textContent = 'Active 24h';
  } else {
    banner.className = 'mb-2 px-3 py-1.5 rounded-xl text-[11px] font-mono flex items-center justify-between gap-2 border bg-amber-50 border-amber-200 text-amber-800';
    const lastSeenText = lastInboundAt ? `Last reply: ${new Date(lastInboundAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'No customer reply in 24h';
    msgEl.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-600 inline mr-1"></i> 24h Window Closed · ${lastSeenText}. Approved Meta template required.`;
    badgeEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300';
    badgeEl.textContent = 'Window Expired';
  }
  lucide.createIcons();
}

async function fetchAndRenderMessages(lead, isPoll = false) {
  try {
    const cleanLeadPhone = String(lead.phone || '').replace(/\D/g, '');
    const res = await fetchWithAuth(`/api/chats/${cleanLeadPhone}`);
    const data = await res.json();
    const messages = data.messages || [];

    // CRITICAL RACE GUARD: If user switched contact while fetching, abort render
    if (state.activeLeadPhone !== cleanLeadPhone) {
      return;
    }

    // Build status hash so status transitions (SENT -> DELIVERED -> READ or FAILED) immediately update the UI
    const currentStatusHash = messages.map(m => `${m.id}:${m.delivery_status}`).join('|');

    // Update 24h service window banner
    update24HourWindowBanner(data.is_within_24h, data.last_inbound_at);

    // If polling and message count + status signature haven't changed, skip re-render to preserve scroll
    if (isPoll && messages.length === lastMessageCount && currentStatusHash === lastMessageStatusHash) {
      return;
    }

    lastMessageCount = messages.length;
    lastMessageStatusHash = currentStatusHash;
    renderChatMessages(messages, lead);
  } catch (err) {
    console.error('Chat fetch error:', err);
  }
}

function renderChatMessages(messages, lead) {
  const stream = document.getElementById('messagesStream');
  stream.innerHTML = '';

  if (messages.length === 0) {
    stream.innerHTML = `
      <div class="p-5 bg-white border border-slate-200 rounded-2xl text-xs font-mono text-slate-600 space-y-2 shadow-sm max-w-sm mx-auto my-auto text-center">
        <div class="w-10 h-10 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <i data-lucide="message-square" class="w-5 h-5"></i>
        </div>
        <div class="text-slate-900 font-bold text-sm">WhatsApp Cloud Thread</div>
        <p>Lead: <strong>+${lead.phone}</strong> (${lead.name})</p>
        <p>Inquiry: <strong>${lead.requirement}</strong></p>
        <p class="text-[11px] text-slate-400">Incoming customer messages & bot replies stream here in real time.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  messages.forEach(m => {
    const isCustomer = m.direction === 'INBOUND';
    const isBot = m.direction === 'OUTBOUND_BOT';
    const isHuman = m.direction === 'OUTBOUND_HUMAN';
    const isTemplate = m.direction === 'OUTBOUND_TEMPLATE' || m.direction === 'OUTBOUND_BROADCAST';
    const status = (m.delivery_status || 'SENT').toUpperCase();
    const isFailed = status === 'FAILED';

    const div = document.createElement('div');
    div.className = `flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`;

    let badge = '👤 Customer';
    let bubbleClass = 'chat-bubble-in text-slate-900';

    if (isBot) {
      badge = '🤖 Bot AI';
      bubbleClass = 'chat-bubble-out text-slate-900';
    } else if (isHuman) {
      badge = '👤 Agent (You)';
      bubbleClass = 'chat-bubble-human text-slate-900';
    } else if (isTemplate) {
      badge = '📢 WhatsApp Outreach';
      bubbleClass = 'chat-bubble-out border border-amber-300 bg-amber-50 text-slate-900';
    }

    if (isFailed) {
      bubbleClass = 'chat-bubble-out border border-rose-300 bg-rose-50/70 text-slate-900';
    }

    const msgDate = new Date(m.created_at);
    const isToday = msgDate.toDateString() === new Date().toDateString();
    const timeStr = isToday
      ? msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : `${msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    let statusIndicator = '';
    if (!isCustomer) {
      if (status === 'READ') {
        statusIndicator = `<span class="text-sky-500 font-bold" title="Read by recipient">✓✓</span>`;
      } else if (status === 'DELIVERED') {
        statusIndicator = `<span class="text-slate-500 font-bold" title="Delivered to recipient phone">✓✓</span>`;
      } else if (isFailed) {
        statusIndicator = `<span class="text-rose-600 font-bold flex items-center gap-0.5 text-[10px]" title="${escapeHtml(m.error_details || 'Delivery Failed')}">❌ FAILED</span>`;
      } else {
        // SENT
        statusIndicator = `<span class="text-slate-400 font-medium" title="Dispatched to WhatsApp Cloud">✓</span>`;
      }
    }

    div.innerHTML = `
      <div class="max-w-[85%] sm:max-w-md ${bubbleClass} p-3 sm:p-3.5 shadow-sm">
        <div class="text-[10px] font-mono text-slate-500 mb-1 flex items-center justify-between gap-4">
          <span class="font-bold ${isCustomer ? 'text-slate-700' : isFailed ? 'text-rose-700' : isBot ? 'text-emerald-700' : 'text-softblue-700'}">${badge}</span>
          <span class="flex items-center gap-1">${timeStr} ${statusIndicator}</span>
        </div>
        ${m.message_type === 'VOICE_TRANSCRIPT' ? `
          <div class="mb-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
            <i data-lucide="mic" class="w-3.5 h-3.5 text-emerald-600"></i>
            <span class="font-bold">Voice Note</span>
          </div>
        ` : ''}
        <div class="text-xs sm:text-[13px] leading-relaxed font-medium whitespace-pre-wrap">${escapeHtml(m.content)}</div>
        ${isFailed ? `
          <div class="mt-2 p-2 bg-rose-100/90 rounded-lg border border-rose-300 text-rose-800 text-[11px] font-mono flex items-start gap-1.5">
            <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5"></i>
            <div>
              <strong class="block text-rose-900 font-semibold">Meta Delivery Failed</strong>
              <span>${escapeHtml(m.error_details || 'Message rejected by WhatsApp Cloud API.')}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    stream.appendChild(div);
  });

  stream.scrollTop = stream.scrollHeight;
  lucide.createIcons();
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Direct Manual Message Sender (Dispatches via Meta Cloud API)
async function handleSendManualMessage(e) {
  e.preventDefault();
  if (!state.activeLeadPhone) return;

  const input = document.getElementById('chatMessageInput');
  const text = input.value.trim();
  if (!text) return;

  const sendBtn = document.getElementById('btnSendManual');
  const lead = state.leads.find(l => l.phone === state.activeLeadPhone);

  input.value = '';
  sendBtn.disabled = true;

  try {
    const res = await fetchWithAuth('/api/chats/send', {
      method: 'POST',
      body: JSON.stringify({
        phone: state.activeLeadPhone,
        text: text
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Update lead local state to takeover mode
    if (lead) {
      lead.bot_active = false;
      updateTakeoverUI(lead);
    }

    // Refresh messages
    if (lead) {
      await fetchAndRenderMessages(lead);
    }
  } catch (err) {
    alert('Failed to send message: ' + err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

async function takeoverChat() {
  if (!state.activeLeadPhone) return;
  const lead = state.leads.find(l => String(l.phone || '').replace(/\D/g, '') === state.activeLeadPhone);
  if (!lead) return;

  const nextActive = !lead.bot_active;
  try {
    const res = await fetchWithAuth('/api/chats/takeover', {
      method: 'POST',
      body: JSON.stringify({ phone: lead.phone, bot_active: nextActive })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    lead.bot_active = nextActive;
    updateTakeoverUI(lead);
    renderContactList(state.leads);
    lucide.createIcons();
  } catch (err) {
    alert('Takeover toggle failed: ' + err.message);
  }
}

// Master Bot Toggle for Account
async function toggleBotMaster() {
  const btn = document.getElementById('btnBotToggle');
  const pill = document.getElementById('botStatusPill');
  const isCurrentlyActive = pill.textContent.includes('ACTIVE');
  const nextActive = !isCurrentlyActive;

  try {
    const res = await fetchWithAuth('/api/bot/toggle', {
      method: 'POST',
      body: JSON.stringify({ is_active: nextActive })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (nextActive) {
      pill.className = 'p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-mono font-semibold flex items-center gap-2.5 mb-4';
      pill.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-wa-green animate-pulse"></span><span>SYSTEM STATUS: ACTIVE & AUTO-REPLYING</span>`;
      btn.innerHTML = `<i data-lucide="pause" class="w-4 h-4"></i><span>Pause Bot Globally</span>`;
    } else {
      pill.className = 'p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs font-mono font-semibold flex items-center gap-2.5 mb-4';
      pill.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-red-500"></span><span>SYSTEM STATUS: PAUSED</span>`;
      btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i><span>Resume Bot Globally</span>`;
    }
    lucide.createIcons();
  } catch (err) {
    alert('Failed to toggle bot: ' + err.message);
  }
}

// ==================== 6. BROADCAST CAMPAIGN & GEMINI AI POLISH ====================

function setupBroadcastView() {
  const textarea = document.getElementById('broadcastNumbers');
  const countBadge = document.getElementById('broadcastCountBadge');
  
  if (textarea && countBadge) {
    const updateCount = () => {
      const nums = textarea.value.split(/[\n,]/).map(n => n.trim()).filter(n => n.length >= 10);
      countBadge.textContent = `${nums.length} Recipients`;
    };
    textarea.oninput = updateCount;
    updateCount();
  }

  // Plan Quota & Campaign Lock Banner
  const user = state.user || {};
  const planTier = user.plan_tier || 'plan_5';
  const planName = user.plan_name || 'Starter Nudge (₹5/head)';
  const maxCampaigns = typeof user.max_outbound_per_contact === 'number' ? user.max_outbound_per_contact : (planTier === 'plan_3_5' ? 0 : 1);
  const usedCampaigns = Number(user.campaigns_used_this_month) || 0;

  let banner = document.getElementById('broadcastPlanBanner');
  if (!banner) {
    const parent = document.getElementById('viewBroadcast');
    if (parent) {
      banner = document.createElement('div');
      banner.id = 'broadcastPlanBanner';
      parent.insertBefore(banner, parent.firstChild);
    }
  }

  const btn = document.getElementById('btnLaunchBroadcast');
  if (banner) {
    if (planTier === 'plan_3_5' || maxCampaigns === 0) {
      banner.className = 'mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900';
      banner.innerHTML = `
        <div class="flex items-center gap-2">
          <i data-lucide="lock" class="w-4 h-4 text-amber-600"></i>
          <span><strong>Broadcasts Disabled on Basic Plan (₹3.50/head).</strong> Upgrade to Starter Plan (₹5/head) to unlock monthly campaigns.</span>
        </div>
        <button onclick="showUpgradeModal('plan_3_5')" class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition">Upgrade</button>
      `;
      if (btn) {
        btn.disabled = true;
        btn.className = 'w-full py-3 bg-slate-300 text-slate-500 font-bold rounded-xl cursor-not-allowed text-xs flex items-center justify-center gap-2';
        btn.innerHTML = '<span>🔒 Broadcasts Locked on Basic Plan (Upgrade to Send)</span>';
      }
    } else if (usedCampaigns >= maxCampaigns) {
      banner.className = 'mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900';
      banner.innerHTML = `
        <div class="flex items-center gap-2">
          <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>
          <span><strong>Monthly Campaign Limit Reached:</strong> ${usedCampaigns} of ${maxCampaigns} campaigns used on ${planName}. Upgrade to send more.</span>
        </div>
        <button onclick="showUpgradeModal('${planTier}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition">Upgrade Plan</button>
      `;
      if (btn) {
        btn.disabled = true;
        btn.className = 'w-full py-3 bg-slate-300 text-slate-500 font-bold rounded-xl cursor-not-allowed text-xs flex items-center justify-center gap-2';
        btn.innerHTML = '<span>🔒 Monthly Campaign Limit Reached (Upgrade to Send)</span>';
      }
    } else {
      banner.className = 'mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900';
      banner.innerHTML = `
        <div class="flex items-center gap-2">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
          <span><strong>Active Plan:</strong> ${planName} — <strong>${maxCampaigns - usedCampaigns}</strong> of <strong>${maxCampaigns}</strong> campaign(s) remaining this month.</span>
        </div>
        <button onclick="showUpgradeModal('${planTier}')" class="text-emerald-700 underline font-bold hover:text-emerald-800 text-xs">Upgrade Tier</button>
      `;
    }
  }

  lucide.createIcons();
}

function addPresetNumber(phone) {
  const textarea = document.getElementById('broadcastNumbers');
  const current = textarea.value.trim();
  if (current.includes(phone)) return;
  textarea.value = current ? `${current}\n${phone}` : phone;
  setupBroadcastView();
}

function addAllQualifiedToBroadcast() {
  const textarea = document.getElementById('broadcastNumbers');
  const phones = state.leads.map(l => l.phone).filter(Boolean);
  textarea.value = Array.from(new Set(phones)).join('\n');
  setupBroadcastView();
}

async function polishWithGemini() {
  const msgInput = document.getElementById('broadcastMessage');
  const draft = msgInput.value.trim();
  const tone = document.getElementById('polishTone').value;
  const statusEl = document.getElementById('polishStatusText');
  const btn = document.getElementById('btnPolish');

  if (!draft) return alert('Please enter a draft message to polish');

  btn.disabled = true;
  statusEl.textContent = 'Gemini AI is polishing... ✨';

  try {
    const res = await fetchWithAuth('/api/campaigns/polish', {
      method: 'POST',
      body: JSON.stringify({ draft, tone, language: 'hinglish' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    msgInput.value = data.polishedText;
    statusEl.textContent = 'Polished by Gemini! ✨';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } catch (err) {
    alert('AI polish error: ' + err.message);
    statusEl.textContent = 'Failed to polish';
  } finally {
    btn.disabled = false;
    lucide.createIcons();
  }
}

async function launchBroadcast() {
  const numInput = document.getElementById('broadcastNumbers');
  const msgInput = document.getElementById('broadcastMessage');
  const btn = document.getElementById('btnLaunchBroadcast');
  const statusArea = document.getElementById('broadcastStatusArea');

  const numbers = numInput.value.split(/[\n,]/).map(n => n.trim()).filter(n => n.length >= 10);
  const message = msgInput.value.trim();

  if (numbers.length === 0) return alert('Please add at least one valid recipient phone number');
  if (!message) return alert('Please write a message to broadcast');

  if (!confirm(`Are you sure you want to broadcast this message to ${numbers.length} recipient(s)?`)) return;

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> <span>Sending Batch Outreach...</span>`;
  lucide.createIcons();

  statusArea.classList.remove('hidden');
  const resultsList = document.getElementById('broadcastResultsList');
  resultsList.innerHTML = `<div class="text-slate-500">Initiating Meta Cloud API dispatch...</div>`;

  try {
    const res = await fetchWithAuth('/api/campaigns/send', {
      method: 'POST',
      body: JSON.stringify({ numbers, message })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.upgrade_required) {
        showUpgradeModal(data.current_plan || 'plan_5');
      }
      throw new Error(data.error);
    }

    resultsList.innerHTML = `
      <div class="p-3 ${data.failed > 0 ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'} rounded-xl font-bold flex items-center justify-between text-xs sm:text-sm">
        <span>${data.failed > 0 ? '⚠️' : '✅'} Broadcast Complete: ${data.sent} Sent / ${data.failed} Failed</span>
        <span>${data.total} Total</span>
      </div>
    `;

    data.results.forEach(r => {
      const row = document.createElement('div');
      row.className = 'p-2.5 bg-slate-50 rounded-xl flex flex-col gap-1 border border-slate-200';
      
      let channelBadge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">Direct Chat</span>';
      if (r.channel === 'APPROVED_TEMPLATE') {
        channelBadge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-bold border border-violet-200">Meta Template</span>';
      } else if (r.channel === 'TEMPLATE_REQUIRED') {
        channelBadge = '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">24h Expired (Template Needed)</span>';
      }

      const isSuccess = r.status === 'SENT' || r.status === 'DELIVERED';
      const statusBadge = isSuccess
        ? `<span class="text-xs font-bold text-emerald-600 font-mono">✓ ${r.status}</span>`
        : `<span class="text-xs font-bold text-rose-600 font-mono">❌ FAILED</span>`;

      row.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-slate-800 font-mono font-semibold text-xs">+${r.phone}</span>
            ${channelBadge}
          </div>
          ${statusBadge}
        </div>
        ${r.error ? `<div class="text-[11px] text-rose-700 font-mono bg-rose-50 p-1.5 rounded-lg border border-rose-200 mt-1">${escapeHtml(r.error)}</div>` : ''}
      `;
      resultsList.appendChild(row);
    });

    loadDashboardStats();
    loadLeads();
  } catch (err) {
    alert('Broadcast error: ' + err.message);
    resultsList.innerHTML = `<div class="text-red-500 font-bold">Error: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span>Dispatch Broadcast Now</span>`;
    lucide.createIcons();
  }
}

// ==================== 7. FOLLOW-UPS & BOT RULES ====================

async function loadFollowups() {
  if (!state.leads || state.leads.length === 0) {
    await loadLeads();
  }

  const tbody = document.getElementById('followupTableBody');
  const mobileContainer = document.getElementById('followupCardsMobile');
  if (tbody) tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  const suppressedStatuses = ['QUALIFIED', 'WON', 'CLOSED', 'LOST', 'COMPLAINT', 'REPAIR', 'SAVED_CONTACT'];
  const candidates = state.leads.filter(l => {
    const st = String(l.status || '').toUpperCase();
    return !suppressedStatuses.includes(st) && !l.is_saved_contact && !l.was_qualified && l.followup_enabled !== false && l.followup_due_at;
  });

  if (candidates.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-mono">No pending follow-ups in queue. All leads qualified or handled!</td></tr>`;
    if (mobileContainer) mobileContainer.innerHTML = `<div class="text-center py-6 text-slate-400 font-mono text-xs">No pending follow-ups in queue. All leads qualified or handled!</div>`;
    return;
  }

  const now = Date.now();

  candidates.forEach(f => {
    const isEnabled = f.followup_enabled !== false;
    const intervalHours = Number(f.followup_interval_hours) || 6;

    // Follow-up window calculation (defaults to 6h in-window)
    let dueTimestamp;
    if (f.followup_due_at) {
      dueTimestamp = new Date(f.followup_due_at).getTime();
    } else {
      const baseTime = new Date(f.last_message_at || f.created_at || now).getTime();
      dueTimestamp = baseTime + (intervalHours * 3600 * 1000);
    }

    const diffMs = dueTimestamp - now;
    let badgeHtml = '';

    if (!isEnabled) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-slate-400"></span> ⏸️ Paused</span>`;
    } else if (diffMs <= 0) {
      const overdueHours = Math.max(1, Math.abs(Math.floor(diffMs / (3600 * 1000))));
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> ⚠️ Due Now (${overdueHours}h)</span>`;
    } else {
      const hoursLeft = Math.floor(diffMs / (3600 * 1000));
      const minsLeft = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500"></span> ⏳ Due in ${hoursLeft}h ${minsLeft}m</span>`;
    }

    // Desktop row
    if (tbody) {
      const tr = document.createElement('tr');
      tr.id = `followup-row-${String(f.phone).replace(/\D/g, '')}`;
      tr.className = `hover:bg-slate-50 transition ${!isEnabled ? 'opacity-70 bg-slate-50/40' : ''}`;
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900">
          ${escapeHtml(f.name || 'WhatsApp Contact')} 
          <span class="text-slate-500 text-[11px] font-mono block font-semibold">+${f.phone}</span>
        </td>
        <td class="px-4 text-slate-700 font-medium">${escapeHtml(f.requirement || 'General Inquiry')}</td>
        <td class="px-4 text-slate-500">${escapeHtml(f.city || 'Punjab')}</td>
        <td class="px-4">
          <select onchange="updateLeadFollowupInterval('${f.phone}', this.value)" class="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 shadow-2xs focus:outline-none focus:border-wa-tealLight">
            <option value="6" ${intervalHours === 6 ? 'selected' : ''}>6h (Default - In Window)</option>
            <option value="8" ${intervalHours === 8 ? 'selected' : ''}>8h (Same Day)</option>
            <option value="12" ${intervalHours === 12 ? 'selected' : ''}>12h (Half Day)</option>
            <option value="24" ${intervalHours === 24 ? 'selected' : ''}>24h (Max Window)</option>
          </select>
        </td>
        <td class="px-4">
          <div class="flex items-center gap-2">
            <button onclick="toggleLeadFollowup('${f.phone}', ${!isEnabled})" class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition ${isEnabled ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}" title="Toggle Follow-up">
              ${isEnabled ? '✓ Enabled' : '✕ Disabled'}
            </button>
            ${badgeHtml}
          </div>
        </td>
        <td class="px-4 text-right">
          <button onclick="triggerFollowupNow('${f.phone}', '${escapeHtml(f.requirement || '')}', this)" class="px-3.5 py-2 ${isEnabled ? 'bg-gradient-to-r from-wa-tealLight to-wa-green hover:from-wa-teal hover:to-emerald-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'} rounded-xl text-xs font-bold transition flex items-center gap-1.5 inline-flex">
            <i data-lucide="bell-ring" class="w-3.5 h-3.5"></i>
            <span>Re-Knock (WhatsApp)</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Mobile touch card (zero horizontal scroll)
    if (mobileContainer) {
      const card = document.createElement('div');
      card.id = `followup-card-${String(f.phone).replace(/\D/g, '')}`;
      card.className = `p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-sm space-y-2.5 ${!isEnabled ? 'opacity-70' : ''}`;
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-slate-900">${escapeHtml(f.name || 'WhatsApp Contact')}</span>
            <span class="text-[11px] font-mono text-slate-500 font-semibold block">+${f.phone}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="toggleLeadFollowup('${f.phone}', ${!isEnabled})" class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition ${isEnabled ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}">
              ${isEnabled ? 'Active' : 'Paused'}
            </button>
            ${badgeHtml}
          </div>
        </div>
        <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1.5">
          <div class="text-slate-800 font-medium">${escapeHtml(f.requirement || 'General Inquiry')}</div>
          <div class="text-slate-500 text-[11px]">City: ${escapeHtml(f.city || 'Punjab')}</div>
          <div class="flex items-center justify-between pt-1 border-t border-slate-200/60">
            <span class="text-[11px] font-medium text-slate-600">Interval Cadence:</span>
            <select onchange="updateLeadFollowupInterval('${f.phone}', this.value)" class="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-mono text-slate-800">
              <option value="6" ${intervalHours === 6 ? 'selected' : ''}>6h (Default - In Window)</option>
              <option value="8" ${intervalHours === 8 ? 'selected' : ''}>8h (Same Day)</option>
              <option value="12" ${intervalHours === 12 ? 'selected' : ''}>12h (Half Day)</option>
              <option value="24" ${intervalHours === 24 ? 'selected' : ''}>24h (Max Window)</option>
            </select>
          </div>
        </div>
        <div class="pt-1 border-t border-slate-100">
          <button onclick="triggerFollowupNow('${f.phone}', '${escapeHtml(f.requirement || '')}', this)" class="w-full py-2.5 ${isEnabled ? 'bg-gradient-to-r from-wa-tealLight to-wa-green hover:from-wa-teal hover:to-emerald-600 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'} rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
            <i data-lucide="bell-ring" class="w-3.5 h-3.5"></i>
            <span>Re-Knock Live WhatsApp</span>
          </button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });

  lucide.createIcons();
}

async function toggleLeadFollowup(phone, nextEnabled) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  try {
    const res = await fetchWithAuth(`/api/leads/${cleanPhone}/followup-settings`, {
      method: 'PATCH',
      body: JSON.stringify({ followup_enabled: nextEnabled })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const lead = state.leads?.find(l => String(l.phone).replace(/\D/g, '') === cleanPhone);
    if (lead) lead.followup_enabled = nextEnabled;
    loadFollowups();
  } catch (err) {
    alert('Error updating follow-up status: ' + err.message);
  }
}

async function updateLeadFollowupInterval(phone, hours) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  const numHours = parseInt(hours, 10);
  try {
    const res = await fetchWithAuth(`/api/leads/${cleanPhone}/followup-settings`, {
      method: 'PATCH',
      body: JSON.stringify({ followup_interval_hours: numHours })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const lead = state.leads?.find(l => String(l.phone).replace(/\D/g, '') === cleanPhone);
    if (lead) {
      lead.followup_interval_hours = numHours;
      if (data.lead?.followup_due_at) lead.followup_due_at = data.lead.followup_due_at;
    }
    loadFollowups();
  } catch (err) {
    alert('Error updating follow-up interval: ' + err.message);
  }
}

async function triggerFollowupNow(phone, requirement, btnEl) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  const originalHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> <span>Sending to WhatsApp...</span>`;
    lucide.createIcons();
  }

  try {
    const res = await fetchWithAuth('/api/followup/trigger', {
      method: 'POST',
      body: JSON.stringify({ phone: cleanPhone, requirement })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Update lead in local state
    const targetLead = state.leads.find(l => String(l.phone).replace(/\D/g, '') === cleanPhone);
    if (targetLead) {
      targetLead.followup_due_at = data.followup_due_at;
      targetLead.last_message_at = data.last_message_at;
    }

    const interval = targetLead?.followup_interval_hours || 24;

    // Refresh Follow-ups radar and stats
    await loadFollowups();
    loadDashboardStats();

    alert(`✅ Re-knock delivered live to WhatsApp (+${cleanPhone})!\n${interval}-Hour radar timer reset.`);
  } catch (err) {
    alert('Re-knock dispatch error: ' + err.message);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = originalHtml;
      lucide.createIcons();
    }
  }
}

async function loadBotRules() {
  const list = document.getElementById('botRulesList');
  list.innerHTML = '';

  try {
    const res = await fetchWithAuth('/api/bot/rules');
    const data = await res.json();
    if (!data.success) return;

    data.rules.forEach(r => {
      const item = document.createElement('div');
      item.className = 'py-3 flex items-center justify-between gap-4';
      item.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-wa-tealLight"></span>
          <span class="text-xs text-slate-800 font-medium">${r.rule_text}</span>
        </div>
        <button onclick="deleteBotRule('${r.id}')" class="p-1 text-slate-400 hover:text-red-500 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
      list.appendChild(item);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Rules error:', err);
  }
}

async function handleAddRule(e) {
  e.preventDefault();
  const input = document.getElementById('newRuleInput');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetchWithAuth('/api/bot/rules', {
      method: 'POST',
      body: JSON.stringify({ rule_text: text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    input.value = '';
    loadBotRules();
  } catch (err) {
    alert('Error adding rule: ' + err.message);
  }
}

async function deleteBotRule(ruleId) {
  if (!confirm('Delete this bot rule?')) return;
  try {
    const res = await fetchWithAuth(`/api/bot/rules/${ruleId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadBotRules();
  } catch (err) {
    alert('Error deleting rule: ' + err.message);
  }
}

// 1-Click CSV Export
function exportLeadsCsv() {
  if (!state.leads || state.leads.length === 0) return alert('No leads to export');

  const headers = ['Name', 'Phone', 'Requirement', 'City', 'Status', 'Bot Active', 'Created At'];
  const rows = state.leads.map(l => [
    `"${l.name || ''}"`,
    `"${l.phone || ''}"`,
    `"${l.requirement || ''}"`,
    `"${l.city || ''}"`,
    `"${l.status || ''}"`,
    `"${l.bot_active ? 'Active' : 'Takeover'}"`,
    `"${l.created_at || ''}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `gurination_crm_leads_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== DASHBOARD 4 CORE DRILLDOWN HISTORY PAGES ====================
const historyCache = {
  inquiries: [],
  followups: { data: [], pendingRadar: [] },
  qualified: [],
  quota: { tenants: [], dispatches: [] }
};

async function openHistoryPage(type) {
  switchView('history_' + type);
  await loadHistoryData(type);
}

async function loadHistoryData(type) {
  try {
    const res = await fetchWithAuth(`/api/dashboard/history/${type}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch history');

    if (type === 'inquiries') {
      historyCache.inquiries = json.data || [];
      renderHistoryInquiries(historyCache.inquiries);
    } else if (type === 'followups') {
      historyCache.followups = { data: json.data || [], pendingRadar: json.pendingRadar || [] };
      renderHistoryFollowups(historyCache.followups.data, historyCache.followups.pendingRadar);
    } else if (type === 'qualified') {
      historyCache.qualified = json.data || [];
      renderHistoryQualified(historyCache.qualified);
    } else if (type === 'quota') {
      historyCache.quota = { tenants: json.tenants || [], dispatches: json.dispatches || [] };
      renderHistoryQuota(historyCache.quota.tenants, historyCache.quota.dispatches);
    }
    lucide.createIcons();
  } catch (err) {
    console.error(`Error loading history for ${type}:`, err);
  }
}

function renderHistoryInquiries(list) {
  const countEl = document.getElementById('historyInquiriesCount');
  if (countEl) {
    const deletedCount = list.filter(l => l.is_deleted).length;
    countEl.innerText = `${list.length} Lifetime Inquiries (${deletedCount} Deleted / Archived)`;
  }

  const tbody = document.getElementById('historyInquiriesBody');
  const mobileContainer = document.getElementById('historyInquiriesMobile');
  if (!tbody || !mobileContainer) return;

  if (list.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-slate-400">
        <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
        <p class="text-xs font-semibold">No inbound inquiries recorded yet.</p>
      </div>`;
    tbody.innerHTML = `<tr><td colspan="8">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = list.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const dateStr = l.created_at ? new Date(l.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const isDel = l.is_deleted === true;
    const delTimeStr = l.deleted_at ? new Date(l.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    
    let statusBadge = '';
    if (isDel) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-300">🗑️ Deleted Chat</span>`;
    } else if (l.status === 'QUALIFIED') {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-200">⭐ QUALIFIED</span>`;
    } else if (l.status === 'WON') {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-200">🏆 WON</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">${l.status || 'NEW'}</span>`;
    }

    const deletionAudit = isDel 
      ? `<div class="text-[10px] font-mono text-rose-600 font-bold mt-0.5 flex items-center gap-1">
           <i data-lucide="shield-alert" class="w-3 h-3 text-rose-500"></i>
           <span>Deleted on ${delTimeStr} by ${escapeHtml(l.deleted_by || 'Staff')}</span>
         </div>`
      : '';

    return `
      <tr class="hover:bg-slate-50/70 transition border-b border-slate-100 ${isDel ? 'bg-rose-50/30' : ''}">
        <td class="py-3 px-4 font-semibold text-slate-900">
          <div>${escapeHtml(l.name || 'WhatsApp Contact')}</div>
          ${deletionAudit}
        </td>
        <td class="px-4 font-mono text-slate-600">+${cleanPhone}</td>
        <td class="px-4">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            ${escapeHtml(l.tenant_name || l.tenant_id || 'CP System')}
          </span>
        </td>
        <td class="px-4 text-slate-700">${escapeHtml(l.requirement || 'General Dairy Plant Machinery')}</td>
        <td class="px-4 text-slate-600">${escapeHtml(l.city || 'Punjab')}</td>
        <td class="px-4">${statusBadge}</td>
        <td class="px-4 text-[11px] text-slate-500 font-mono">${dateStr}</td>
        <td class="px-4 text-right space-x-1 whitespace-nowrap">
          <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-wa-tealLight font-bold rounded-lg text-[11px] shadow-xs transition">
            Chat
          </button>
          <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-[11px] inline-flex items-center gap-1">
            <i data-lucide="external-link" class="w-3 h-3"></i> WA
          </a>
        </td>
      </tr>
    `;
  }).join('');

  mobileContainer.innerHTML = list.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const dateStr = l.created_at ? new Date(l.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const isDel = l.is_deleted === true;
    const delTimeStr = l.deleted_at ? new Date(l.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    
    let statusBadge = isDel
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-300">🗑️ Chat Deleted</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${l.status === 'QUALIFIED' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}">${l.status || 'NEW'}</span>`;

    const deletionAuditMobile = isDel 
      ? `<div class="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-mono font-bold">
           🗑️ Chat Deleted on ${delTimeStr} by ${escapeHtml(l.deleted_by || 'Staff')}
         </div>`
      : '';

    return `
      <div class="glass-panel rounded-xl p-3.5 space-y-2 border ${isDel ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/80'} shadow-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-900 text-xs">${escapeHtml(l.name || 'WhatsApp Contact')}</span>
          ${statusBadge}
        </div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>+${cleanPhone}</span>
          <span class="text-[10px] text-slate-400">${dateStr}</span>
        </div>
        ${deletionAuditMobile}
        <div class="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
          <p class="font-semibold text-slate-800 text-[11px] mb-0.5">${escapeHtml(l.requirement || 'General Dairy Plant Machinery')}</p>
          <p class="text-[10px] text-slate-500">${escapeHtml(l.city || 'Punjab')} · Brand: <span class="font-bold text-slate-700">${escapeHtml(l.tenant_name || l.tenant_id || 'CP System')}</span></p>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <button onclick="openChatForPhone('${cleanPhone}')" class="flex-1 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-wa-tealLight font-bold rounded-lg text-xs shadow-xs text-center">
            Open Chat
          </button>
          <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> Direct WA
          </a>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderHistoryFollowups(history, pendingRadar) {
  const deletedCount = history.filter(h => h.is_deleted === true).length;
  const countEl = document.getElementById('historyFollowupsCount');
  if (countEl) {
    countEl.innerText = deletedCount > 0 
      ? `${history.length} Re-knocks Sent (${deletedCount} Archived)`
      : `${history.length} Re-knocks Sent`;
  }

  const radarCountEl = document.getElementById('historyFollowupsRadarCount');
  if (radarCountEl) radarCountEl.innerText = `${pendingRadar.length} Waiting`;

  const tbody = document.getElementById('historyFollowupsBody');
  const mobileContainer = document.getElementById('historyFollowupsMobile');

  if (tbody && mobileContainer) {
    if (history.length === 0) {
      const emptyHtml = `
        <div class="py-10 text-center text-slate-400">
          <i data-lucide="send" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
          <p class="text-xs font-semibold">No follow-up re-knocks dispatched yet.</p>
        </div>`;
      tbody.innerHTML = `<tr><td colspan="7">${emptyHtml}</td></tr>`;
      mobileContainer.innerHTML = emptyHtml;
    } else {
      tbody.innerHTML = history.map(h => {
        const cleanPhone = String(h.lead_phone || '').replace(/\D/g, '');
        const dateStr = h.created_at ? new Date(h.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const wamidShort = h.wamid ? (h.wamid.length > 20 ? h.wamid.slice(0, 18) + '...' : h.wamid) : '—';
        const isDel = h.is_deleted === true;
        const delTimeStr = h.deleted_at ? new Date(h.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const deletionAudit = isDel 
          ? `<div class="text-[10px] font-mono text-rose-600 font-bold mt-0.5 flex items-center gap-1">
               <i data-lucide="shield-alert" class="w-3 h-3 text-rose-500"></i>
               <span>Deleted on ${delTimeStr} by ${escapeHtml(h.deleted_by || 'Staff')}</span>
             </div>`
          : '';

        return `
          <tr class="hover:bg-slate-50/70 transition border-b border-slate-100 ${isDel ? 'bg-rose-50/30' : ''}">
            <td class="py-3 px-4 text-[11px] font-mono text-slate-500">${dateStr}</td>
            <td class="px-4">
              <div class="font-semibold text-slate-900">${escapeHtml(h.lead_name || 'Lead')}</div>
              <div class="text-[11px] font-mono text-slate-500">+${cleanPhone}</div>
              ${deletionAudit}
            </td>
            <td class="px-4">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                ${escapeHtml(h.tenant_name || h.tenant_id || 'CP System')}
              </span>
            </td>
            <td class="px-4 text-slate-700 max-w-xs truncate">${escapeHtml(h.requirement || 'General')}</td>
            <td class="px-4 text-slate-800 text-xs italic bg-slate-50/50 rounded p-2 max-w-sm">${escapeHtml(h.content || '')}</td>
            <td class="px-4 font-mono text-[10px] text-slate-400" title="${escapeHtml(h.wamid || '')}">${wamidShort}</td>
            <td class="px-4 text-right">
              <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-softblue-600 font-bold rounded-lg text-[11px] shadow-xs transition">
                Chat
              </button>
            </td>
          </tr>
        `;
      }).join('');

      mobileContainer.innerHTML = history.map(h => {
        const cleanPhone = String(h.lead_phone || '').replace(/\D/g, '');
        const dateStr = h.created_at ? new Date(h.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const isDel = h.is_deleted === true;
        const delTimeStr = h.deleted_at ? new Date(h.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const deletionAuditMobile = isDel 
          ? `<div class="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-mono font-bold">
               🗑️ Chat Deleted on ${delTimeStr} by ${escapeHtml(h.deleted_by || 'Staff')}
             </div>`
          : '';

        return `
          <div class="glass-panel rounded-xl p-3.5 space-y-2 border ${isDel ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/80'} shadow-xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 text-xs">${escapeHtml(h.lead_name || 'Lead')} (+${cleanPhone})</span>
              <span class="text-[10px] font-mono text-slate-400">${dateStr}</span>
            </div>
            ${deletionAuditMobile}
            <div class="text-xs text-slate-700 bg-softblue-50/60 p-2.5 rounded-lg border border-softblue-100">
              <p class="text-[10px] font-bold text-softblue-700 mb-1">Brand: ${escapeHtml(h.tenant_name || h.tenant_id || 'CP System')}</p>
              <p class="text-xs italic text-slate-800">"${escapeHtml(h.content || '')}"</p>
            </div>
            <div class="flex items-center justify-between pt-1">
              <span class="text-[10px] font-mono text-slate-400">WAMID: ${h.wamid ? h.wamid.slice(0, 14) + '...' : '—'}</span>
              <button onclick="openChatForPhone('${cleanPhone}')" class="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-softblue-600 font-bold rounded-lg text-xs shadow-xs">
                Open Chat
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Pending Radar Leads
  const pendingBody = document.getElementById('historyFollowupsPendingBody');
  const pendingMobile = document.getElementById('historyFollowupsPendingMobile');
  if (pendingBody && pendingMobile) {
    if (pendingRadar.length === 0) {
      const emptyPending = `
        <div class="py-8 text-center text-slate-400">
          <i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-400"></i>
          <p class="text-xs font-semibold">Radar clear! All leads have responded or been re-knocked.</p>
        </div>`;
      pendingBody.innerHTML = `<tr><td colspan="6">${emptyPending}</td></tr>`;
      pendingMobile.innerHTML = emptyPending;
    } else {
      pendingBody.innerHTML = pendingRadar.map(r => {
        const cleanPhone = String(r.phone || '').replace(/\D/g, '');
        const dueStr = r.followup_due_at ? new Date(r.followup_due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '36h window active';
        return `
          <tr class="hover:bg-slate-50/70 transition border-b border-slate-100">
            <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(r.name || 'WhatsApp Lead')}</td>
            <td class="px-4 font-mono text-slate-600">+${cleanPhone}</td>
            <td class="px-4 text-slate-600">${escapeHtml(r.tenant_id || 'cpsystem')}</td>
            <td class="px-4 text-slate-700">${escapeHtml(r.requirement || 'General')}</td>
            <td class="px-4 text-[11px] font-mono text-amber-700">${dueStr}</td>
            <td class="px-4 text-right">
              <button onclick="triggerFollowupNow('${cleanPhone}', '${escapeHtml(r.requirement || '')}', this)" class="px-3 py-1.5 bg-gradient-to-r from-wa-tealLight to-wa-green hover:from-wa-teal hover:to-emerald-600 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-xs">
                <i data-lucide="bell" class="w-3 h-3"></i> Re-knock Now
              </button>
            </td>
          </tr>
        `;
      }).join('');

      pendingMobile.innerHTML = pendingRadar.map(r => {
        const cleanPhone = String(r.phone || '').replace(/\D/g, '');
        const dueStr = r.followup_due_at ? new Date(r.followup_due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '36h window active';
        return `
          <div class="glass-panel rounded-xl p-3.5 space-y-2 border border-slate-200/80 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 text-xs">${escapeHtml(r.name || 'WhatsApp Lead')}</span>
              <span class="text-[10px] text-amber-700 font-mono font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">${dueStr}</span>
            </div>
            <div class="text-xs text-slate-600 font-mono">+${cleanPhone} · Brand: ${escapeHtml(r.tenant_id || 'cpsystem')}</div>
            <p class="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">${escapeHtml(r.requirement || 'General Dairy Plant Requirement')}</p>
            <div class="pt-1">
              <button onclick="triggerFollowupNow('${cleanPhone}', '${escapeHtml(r.requirement || '')}', this)" class="w-full py-2 bg-gradient-to-r from-wa-tealLight to-wa-green hover:from-wa-teal hover:to-emerald-600 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs">
                <i data-lucide="bell" class="w-3.5 h-3.5"></i> Trigger Re-knock Live
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  lucide.createIcons();
}

function renderHistoryQualified(list) {
  const deletedCount = list.filter(l => l.is_deleted === true).length;
  const countEl = document.getElementById('historyQualifiedCount');
  if (countEl) {
    countEl.innerText = deletedCount > 0 
      ? `${list.length} Lifetime Hot Deals (${deletedCount} Deleted / Archived)`
      : `${list.length} Hot Deals`;
  }

  const tbody = document.getElementById('historyQualifiedBody');
  const mobileContainer = document.getElementById('historyQualifiedMobile');
  if (!tbody || !mobileContainer) return;

  if (list.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-slate-400">
        <i data-lucide="flame" class="w-10 h-10 mx-auto mb-2 text-amber-300"></i>
        <p class="text-xs font-semibold">No qualified hot deals found yet.</p>
      </div>`;
    tbody.innerHTML = `<tr><td colspan="8">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = list.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const isDel = l.is_deleted === true;
    const delTimeStr = l.deleted_at ? new Date(l.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    
    const replyCount = Number(l.ai_reply_count) || 0;
    let botMode = l.bot_active ? '🟢 AI Bot Live' : '👤 Staff Takeover';
    let botClass = l.bot_active ? 'text-[#25D366]' : 'text-amber-600';
    if (l.is_handoff_to_staff || replyCount >= 15) {
      botMode = '🤝 Staff Handoff (15/15)';
      botClass = 'text-amber-700 font-bold';
    } else if (l.is_saved_contact) {
      botMode = l.bot_active ? '👤 Contact (🤖 Bot)' : '👤 Saved Contact';
      botClass = l.bot_active ? 'text-emerald-600 font-bold' : 'text-indigo-600';
    }

    const deletionAudit = isDel 
      ? `<div class="text-[10px] font-mono text-rose-600 font-bold mt-0.5 flex items-center gap-1">
           <i data-lucide="shield-alert" class="w-3 h-3 text-rose-500"></i>
           <span>Deleted on ${delTimeStr} by ${escapeHtml(l.deleted_by || 'Staff')}</span>
         </div>`
      : '';

    const statusBadge = isDel
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-300">🗑️ Deleted Deal</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">${l.status}</span>`;

    return `
      <tr class="hover:bg-slate-50/70 transition border-b border-slate-100 ${isDel ? 'bg-rose-50/30' : ''}">
        <td class="py-3 px-4 font-semibold text-slate-900">
          <div>${escapeHtml(l.name || 'Verified Plant Contact')}</div>
          <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
            <span>${dateStr}</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">AI: ${replyCount}/15</span>
            ${l.followup_due_at ? '<span class="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">Radar 6h</span>' : ''}
          </div>
          ${deletionAudit}
        </td>
        <td class="px-4 font-mono text-slate-600">+${cleanPhone}</td>
        <td class="px-4">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            ${escapeHtml(l.tenant_name || l.tenant_id || 'CP System')}
          </span>
        </td>
        <td class="px-4 font-semibold text-amber-900 bg-amber-50/50 rounded py-2">
          ${escapeHtml(l.requirement || 'Commercial Dairy Plant Machinery')}
        </td>
        <td class="px-4 text-slate-700">
          <span class="inline-flex items-center gap-1 font-medium">
            <i data-lucide="map-pin" class="w-3 h-3 text-red-500"></i> ${escapeHtml(l.city || 'Punjab')}
          </span>
        </td>
        <td class="px-4">
          ${statusBadge}
        </td>
        <td class="px-4 text-xs font-bold ${botClass}">${botMode}</td>
        <td class="px-4 text-right space-x-1 whitespace-nowrap">
          <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-wa-tealLight font-bold rounded-lg text-[11px] shadow-xs transition">
            Chat
          </button>
          <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-[11px] inline-flex items-center gap-1">
            <i data-lucide="external-link" class="w-3 h-3"></i> WA
          </a>
        </td>
      </tr>
    `;
  }).join('');

  mobileContainer.innerHTML = list.map(l => {
    const cleanPhone = String(l.phone || '').replace(/\D/g, '');
    const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
    const isDel = l.is_deleted === true;
    const delTimeStr = l.deleted_at ? new Date(l.deleted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    const deletionAuditMobile = isDel 
      ? `<div class="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700 font-mono font-bold">
           🗑️ Chat Deleted on ${delTimeStr} by ${escapeHtml(l.deleted_by || 'Staff')}
         </div>`
      : '';

    const statusBadge = isDel
      ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-100 text-rose-800 border-rose-300">🗑️ Deleted Deal</span>`
      : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">${l.status}</span>`;

    return `
      <div class="glass-panel rounded-xl p-3.5 space-y-2 border ${isDel ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/80'} shadow-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-900 text-xs">${escapeHtml(l.name || 'Verified Plant Contact')}</span>
          ${statusBadge}
        </div>
        <div class="flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>+${cleanPhone}</span>
          <span class="text-[10px] text-slate-400">${dateStr}</span>
        </div>
        ${deletionAuditMobile}
        <div class="text-xs text-slate-800 bg-amber-50/60 p-2.5 rounded-lg border border-amber-100 space-y-1">
          <div class="font-bold text-amber-900 text-xs">${escapeHtml(l.requirement || 'Commercial Dairy Plant Machinery')}</div>
          <div class="flex items-center justify-between text-[11px] text-slate-600">
            <span>Location: <strong>${escapeHtml(l.city || 'Punjab')}</strong></span>
            <span>Brand: <strong>${escapeHtml(l.tenant_name || l.tenant_id || 'CP System')}</strong></span>
          </div>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <button onclick="openChatForPhone('${cleanPhone}')" class="flex-1 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-wa-tealLight font-bold rounded-lg text-xs shadow-xs text-center">
            Open Chat
          </button>
          <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener noreferrer" class="py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> Direct WA
          </a>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderHistoryQuota(tenants, dispatches) {
  const gridEl = document.getElementById('historyQuotaTenantsGrid');
  if (gridEl) {
    gridEl.innerHTML = tenants.map(t => {
      const limit = t.quota_limit || 2500;
      const used = t.quota_used || 0;
      const left = Math.max(0, limit - used);
      const pct = Math.min(100, Math.round((used / limit) * 100));
      return `
        <div class="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900 text-sm">${escapeHtml(t.name || t.id)}</h3>
              <p class="text-[11px] font-mono text-slate-500">${escapeHtml(t.phone_display || 'Meta Cloud API')}</p>
            </div>
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Free Tier
            </span>
          </div>
          <div>
            <div class="flex items-center justify-between text-xs font-mono mb-1">
              <span class="text-slate-600 font-bold">${left.toLocaleString()} Free Left</span>
              <span class="text-slate-400">${used.toLocaleString()} / ${limit.toLocaleString()}</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-wa-teal h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 text-slate-500">
            <span>Meta Monthly Free Pool</span>
            <span class="font-bold text-emerald-700 font-mono">$0.00 Meta Fee</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const tbody = document.getElementById('historyQuotaLedgerBody');
  const mobileContainer = document.getElementById('historyQuotaLedgerMobile');
  if (!tbody || !mobileContainer) return;

  if (dispatches.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-slate-400">
        <i data-lucide="database" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
        <p class="text-xs font-semibold">No outbound dispatches logged yet.</p>
      </div>`;
    tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = dispatches.map(d => {
    const cleanPhone = String(d.lead_phone || '').replace(/\D/g, '');
    const dateStr = d.created_at ? new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const wamidShort = d.wamid ? (d.wamid.length > 20 ? d.wamid.slice(0, 18) + '...' : d.wamid) : '—';
    return `
      <tr class="hover:bg-slate-50/70 transition border-b border-slate-100">
        <td class="py-3 px-4 text-[11px] font-mono text-slate-500">${dateStr}</td>
        <td class="px-4 font-semibold text-slate-900">${escapeHtml(d.tenant_name || d.tenant_id || 'CP System')}</td>
        <td class="px-4 font-mono text-slate-600">+${cleanPhone}</td>
        <td class="px-4">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            ${escapeHtml(d.direction || 'OUTBOUND')}
          </span>
        </td>
        <td class="px-4 text-slate-700 text-xs italic max-w-sm truncate">${escapeHtml(d.content || '')}</td>
        <td class="px-4 text-right font-mono text-[10px] text-slate-400" title="${escapeHtml(d.wamid || '')}">${wamidShort}</td>
      </tr>
    `;
  }).join('');

  mobileContainer.innerHTML = dispatches.map(d => {
    const cleanPhone = String(d.lead_phone || '').replace(/\D/g, '');
    const dateStr = d.created_at ? new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    return `
      <div class="glass-panel rounded-xl p-3.5 space-y-1.5 border border-slate-200/80 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-900 text-xs">${escapeHtml(d.tenant_name || d.tenant_id || 'CP System')}</span>
          <span class="text-[10px] font-mono text-slate-400">${dateStr}</span>
        </div>
        <div class="text-xs text-slate-500 font-mono">+${cleanPhone} · <span class="font-bold text-slate-700">${escapeHtml(d.direction || 'OUTBOUND')}</span></div>
        <div class="text-xs text-slate-800 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
          "${escapeHtml(d.content || '')}"
        </div>
        <div class="text-[10px] font-mono text-slate-400 text-right">
          WAMID: ${d.wamid ? d.wamid.slice(0, 14) + '...' : '—'}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function filterHistoryInquiries(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) {
    return renderHistoryInquiries(historyCache.inquiries);
  }
  const filtered = historyCache.inquiries.filter(l => 
    String(l.name || '').toLowerCase().includes(q) ||
    String(l.phone || '').includes(q) ||
    String(l.requirement || '').toLowerCase().includes(q) ||
    String(l.city || '').toLowerCase().includes(q) ||
    String(l.tenant_name || l.tenant_id || '').toLowerCase().includes(q)
  );
  renderHistoryInquiries(filtered);
}

function filterHistoryFollowups(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) {
    return renderHistoryFollowups(historyCache.followups.data, historyCache.followups.pendingRadar);
  }
  const filteredHistory = historyCache.followups.data.filter(h =>
    String(h.lead_name || '').toLowerCase().includes(q) ||
    String(h.lead_phone || '').includes(q) ||
    String(h.requirement || '').toLowerCase().includes(q) ||
    String(h.content || '').toLowerCase().includes(q) ||
    String(h.tenant_name || '').toLowerCase().includes(q)
  );
  renderHistoryFollowups(filteredHistory, historyCache.followups.pendingRadar);
}

let currentQualifiedTypeFilter = 'ALL';

function setQualifiedTypeFilter(type) {
  currentQualifiedTypeFilter = type;
  const types = ['ALL', 'PASTEURIZER', 'CHILLER', 'GHEE', 'WON'];
  types.forEach(t => {
    const btn = document.getElementById(`pillQual_${t}`);
    if (btn) {
      if (t === type) {
        btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition bg-slate-900 text-white shadow-xs';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold transition bg-white text-slate-700 hover:bg-amber-50 hover:text-amber-800 border border-slate-200';
      }
    }
  });
  applyQualifiedFilters();
}

function applyQualifiedFilters() {
  const cityVal = (document.getElementById('qualifiedCityFilter')?.value || 'ALL').toLowerCase();
  const searchVal = (document.getElementById('qualifiedSearchInput')?.value || '').toLowerCase().trim();

  let list = historyCache.qualified || [];

  // Filter Way 1: Machinery Type / Stage
  if (currentQualifiedTypeFilter === 'PASTEURIZER') {
    list = list.filter(l => {
      const req = (l.requirement || '').toLowerCase();
      return req.includes('pasteur') || req.includes('process') || req.includes('5000') || req.includes('5,000');
    });
  } else if (currentQualifiedTypeFilter === 'CHILLER') {
    list = list.filter(l => {
      const req = (l.requirement || '').toLowerCase();
      return req.includes('chill') || req.includes('bmc') || req.includes('cool');
    });
  } else if (currentQualifiedTypeFilter === 'GHEE') {
    list = list.filter(l => {
      const req = (l.requirement || '').toLowerCase();
      return req.includes('ghee') || req.includes('butter') || req.includes('khoya') || req.includes('kettle');
    });
  } else if (currentQualifiedTypeFilter === 'WON') {
    list = list.filter(l => l.status === 'WON');
  }

  // Filter Way 2: Punjab Territory & Keyword Search
  if (cityVal !== 'all') {
    list = list.filter(l => (l.city || '').toLowerCase().includes(cityVal));
  }
  if (searchVal) {
    list = list.filter(l =>
      (l.name || '').toLowerCase().includes(searchVal) ||
      String(l.phone || '').includes(searchVal) ||
      (l.requirement || '').toLowerCase().includes(searchVal) ||
      (l.city || '').toLowerCase().includes(searchVal) ||
      (l.tenant_name || l.tenant_id || '').toLowerCase().includes(searchVal)
    );
  }

  renderHistoryQualified(list);
}

// ==================== BILLABLE CLIENTS & REACH LEDGER (₹5/HEAD) ====================

const billableState = {
  currentMonth: new Date().toISOString().slice(0, 7),
  channelFilter: 'ALL',
  searchQuery: '',
  data: [],
  stats: {}
};

let billableSearchDebounce = null;

async function loadBillableData() {
  try {
    populateBillableMonthSelect();

    const selectedMonth = document.getElementById('billableMonthSelect')?.value || billableState.currentMonth;
    billableState.currentMonth = selectedMonth;

    let url = `/api/billing/ledger?month=${encodeURIComponent(selectedMonth)}`;
    if (billableState.channelFilter && billableState.channelFilter !== 'ALL') {
      url += `&type=${encodeURIComponent(billableState.channelFilter)}`;
    }
    if (billableState.searchQuery) {
      url += `&search=${encodeURIComponent(billableState.searchQuery)}`;
    }

    const res = await fetchWithAuth(url);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch billing ledger');
    }

    billableState.data = json.ledger || [];
    billableState.stats = json.stats || {};

    renderBillableSummary(json.stats);
    renderBillableLedgerTable(billableState.data);
  } catch (err) {
    console.error('Billing Ledger Error:', err);
  }
}

function populateBillableMonthSelect() {
  const sel = document.getElementById('billableMonthSelect');
  if (!sel || sel.options.length > 0) return;

  const now = new Date();
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    months.push({ val, label });
  }

  sel.innerHTML = months.map(m => `<option value="${m.val}">${m.label} (${m.val})</option>`).join('');
  sel.value = billableState.currentMonth;
}

function renderBillableSummary(stats) {
  if (!stats) return;
  const headsEl = document.getElementById('billableSummaryHeads');
  const amountEl = document.getElementById('billableSummaryAmount');
  const dispatchesEl = document.getElementById('billableSummaryDispatches');

  if (headsEl) headsEl.textContent = Number(stats.billed_heads || 0).toLocaleString();
  if (amountEl) amountEl.textContent = `₹${Number(stats.total_inr || 0).toFixed(2)}`;
  if (dispatchesEl) dispatchesEl.textContent = Number(stats.total_dispatches || 0).toLocaleString();
}

function renderBillableLedgerTable(rows) {
  const tbody = document.getElementById('billableLedgerBody');
  const mobileContainer = document.getElementById('billableLedgerMobile');
  const countBadge = document.getElementById('billableTableCount');

  if (countBadge) countBadge.textContent = `${rows.length} ${rows.length === 1 ? 'Client' : 'Clients'}`;

  if (!tbody || !mobileContainer) return;

  tbody.innerHTML = '';
  mobileContainer.innerHTML = '';

  if (rows.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-slate-400 space-y-2">
        <i data-lucide="receipt" class="w-8 h-8 mx-auto text-slate-300"></i>
        <p class="text-xs font-medium">No billable client engagements recorded for this period.</p>
        <p class="text-[11px] text-slate-400">Broadcast marketing campaigns, automated 24h follow-ups, and outbound bot messages will log here automatically.</p>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    lucide.createIcons();
    return;
  }

  rows.forEach(r => {
    const phone = r.lead_phone;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const clientName = r.client_name || 'Client Lead';
    const city = r.city || 'Punjab';
    const dispatches = Number(r.message_count) || 1;
    const rate = Number(r.rate_inr || 5.0).toFixed(2);
    const firstDate = r.first_engaged_at ? new Date(r.first_engaged_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';
    const snippet = r.last_message_preview || 'Engagement dispatched';

    // Channel badges
    const channels = Array.isArray(r.channels) && r.channels.length > 0 ? r.channels : [r.engagement_type];
    const channelBadges = channels.map(ch => {
      if (ch === 'BROADCAST') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">BROADCAST</span>`;
      if (String(ch).startsWith('FOLLOWUP') || ch === 'OUTBOUND_TEMPLATE') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-softblue-100 text-softblue-800 border border-softblue-200">FOLLOW-UP</span>`;
      if (ch === 'OUTBOUND_BOT') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">BOT OUTBOUND</span>`;
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(ch)}</span>`;
    }).join(' ');

    // Desktop row
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 transition group';
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="font-bold text-slate-900 flex items-center gap-1.5">
          <span>${escapeHtml(clientName)}</span>
        </div>
        <div class="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5">
          <span>+${cleanPhone}</span>
          <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-emerald-600 hover:text-emerald-700 inline-flex items-center" title="Open in WhatsApp Web">
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </td>
      <td class="px-4 text-slate-600 font-medium">
        <span class="inline-flex items-center gap-1">
          <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i>
          ${escapeHtml(city)}
        </span>
      </td>
      <td class="px-4">
        <div class="flex items-center gap-1 flex-wrap">
          ${channelBadges}
        </div>
      </td>
      <td class="px-4 text-center">
        <span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
          ${dispatches} ${dispatches === 1 ? 'msg' : 'msgs'}
        </span>
      </td>
      <td class="px-4 text-right">
        <span class="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-xs">
          ₹${rate}
        </span>
      </td>
      <td class="px-4 text-slate-500 text-[11px] font-mono whitespace-nowrap">
        ${firstDate}
      </td>
      <td class="px-4 max-w-xs truncate text-slate-600 text-[11px]" title="${escapeHtml(snippet)}">
        "${escapeHtml(snippet)}"
      </td>
      <td class="px-4 text-right">
        <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold shadow-xs transition inline-flex items-center gap-1">
          <i data-lucide="message-square" class="w-3 h-3"></i>
          <span>Chat</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // Mobile card
    const card = document.createElement('div');
    card.className = 'glass-panel rounded-xl p-3.5 space-y-2.5 shadow-xs border border-slate-200/90';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="font-bold text-slate-900 text-xs">${escapeHtml(clientName)}</div>
          <div class="text-[11px] text-slate-500 font-mono mt-0.5">+${cleanPhone} · ${escapeHtml(city)}</div>
        </div>
        <div class="text-right shrink-0">
          <span class="font-mono font-bold text-emerald-700 text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            ₹${rate}
          </span>
          <div class="text-[10px] font-mono text-slate-400 mt-0.5">${dispatches} msgs</div>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-wrap">
        ${channelBadges}
      </div>
      <div class="p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600 italic border border-slate-100 truncate">
        "${escapeHtml(snippet)}"
      </div>
      <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
        <span>Engaged: ${firstDate}</span>
        <button onclick="openChatForPhone('${cleanPhone}')" class="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-bold flex items-center gap-1 text-[11px]">
          <i data-lucide="message-square" class="w-3 h-3"></i> Open Chat
        </button>
      </div>
    `;
    mobileContainer.appendChild(card);
  });

  lucide.createIcons();
}

function setBillableChannelFilter(channel) {
  billableState.channelFilter = channel;
  ['ALL', 'BROADCAST', 'FOLLOWUP', 'OUTBOUND_BOT'].forEach(ch => {
    const btn = document.getElementById(`btnBillFilter${ch}`);
    if (btn) {
      if (ch === channel) {
        btn.className = 'px-2.5 py-1 rounded-lg font-bold transition bg-white text-slate-900 shadow-xs';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg font-medium text-slate-600 hover:text-slate-900 transition';
      }
    }
  });
  loadBillableData();
}

function debounceFilterBillable() {
  clearTimeout(billableSearchDebounce);
  billableSearchDebounce = setTimeout(() => {
    billableState.searchQuery = document.getElementById('billableSearchInput')?.value || '';
    loadBillableData();
  }, 250);
}

function exportBillableCsv() {
  if (!billableState.data || billableState.data.length === 0) {
    alert('No billable records to export.');
    return;
  }
  const headers = ['Phone', 'Client Name', 'City', 'Billing Month', 'Engagement Channels', 'Dispatches Sent', 'Rate INR', 'First Engaged', 'Last Engaged', 'Last Snippet'];
  const rows = billableState.data.map(r => [
    `"${r.lead_phone}"`,
    `"${(r.client_name || '').replace(/"/g, '""')}"`,
    `"${(r.city || '').replace(/"/g, '""')}"`,
    `"${r.billing_month}"`,
    `"${(Array.isArray(r.channels) ? r.channels.join(';') : r.engagement_type).replace(/"/g, '""')}"`,
    r.message_count || 1,
    '5.00',
    `"${r.first_engaged_at || ''}"`,
    `"${r.last_engaged_at || ''}"`,
    `"${(r.last_message_preview || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `billable_clients_ledger_${billableState.currentMonth}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Kickstart App on Page Load
window.addEventListener('DOMContentLoaded', init);

