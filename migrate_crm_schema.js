const axios = require('axios');

const SUPABASE_ACCESS_TOKEN = "sbp_42ace3aee6dbbb909d8b808f10a6dbbbe2becaa3";
const PROJECT_REF = "uejeoznlhfqsyknoleib";

const sql = `
-- Tenants
CREATE TABLE IF NOT EXISTS public.crm_tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    phone_display TEXT NOT NULL,
    quota_limit INT DEFAULT 2500,
    quota_used INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users & Roles
CREATE TABLE IF NOT EXISTS public.crm_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- 'super_admin', 'admin', 'staff'
    tenant_id TEXT DEFAULT 'system',
    display_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads / Contacts
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    requirement TEXT,
    city TEXT,
    status TEXT DEFAULT 'NEW', -- 'NEW', 'QUALIFIED', 'FOLLOWUP_PENDING', 'WON', 'LOST'
    bot_active BOOLEAN DEFAULT TRUE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    followup_due_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- Messages
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    lead_phone TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'INBOUND', 'OUTBOUND_BOT', 'OUTBOUND_HUMAN', 'OUTBOUND_TEMPLATE'
    message_type TEXT DEFAULT 'TEXT', -- 'TEXT', 'VOICE_TRANSCRIPT', 'IMAGE'
    content TEXT NOT NULL,
    raw_transcript TEXT,
    wamid TEXT,
    delivery_status TEXT DEFAULT 'SENT',
    error_details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dynamic Bot Rules
CREATE TABLE IF NOT EXISTS public.crm_bot_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    rule_text TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_username TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    tenant_id TEXT,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Tenants
INSERT INTO public.crm_tenants (id, name, phone_number_id, phone_display, quota_limit, quota_used)
VALUES 
    ('cpsystem', 'CP System Chiller & RO Plants', '1351625371363106', '+91 62803 33252', 2500, 42),
    ('mystery', 'Mystery DeMysters Enterprise', '1346591765206499', '+91 62808 34006', 2500, 18)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone_number_id = EXCLUDED.phone_number_id;

-- Seed Users
INSERT INTO public.crm_users (username, password_hash, role, tenant_id, display_name)
VALUES
    ('superadmin', 'admin123', 'super_admin', 'system', 'Guri (Super Admin)'),
    ('cpsystem_admin', 'cp123', 'admin', 'cpsystem', 'Karan Singh (CP Admin)'),
    ('cpsystem_staff', 'staff123', 'staff', 'cpsystem', 'Suman (CP Sales Staff)'),
    ('mystery_admin', 'mystery123', 'admin', 'mystery', 'Mystery Admin')
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;

-- Seed Sample Leads for CP System
INSERT INTO public.crm_leads (tenant_id, phone, name, requirement, city, status, bot_active)
VALUES
    ('cpsystem', '919041172159', 'Nya', '5 Ton Chiller for Dairy plant', 'Bathinda', 'QUALIFIED', true),
    ('cpsystem', '919915730338', 'Karan Coordinator', 'System Verification & Monitoring', 'Mohali', 'WON', false),
    ('cpsystem', '919779630338', 'Suman Partner', 'RO Plant 50,000 LPH Inquiry', 'Ludhiana', 'NEW', true)
ON CONFLICT (tenant_id, phone) DO NOTHING;

-- Seed Sample Bot Rule
INSERT INTO public.crm_bot_rules (tenant_id, rule_text, is_active, created_by)
VALUES
    ('cpsystem', 'Offer special engineering consultation for SS-316 food-grade chillers; route leads to Karan Singh (+91 99157 30338).', true, 'cpsystem_admin')
ON CONFLICT DO NOTHING;
`;

async function run() {
    try {
        const url = 'https://api.supabase.com/v1/projects/' + PROJECT_REF + '/database/query';
        const res = await axios.post(
            url,
            { query: sql },
            {
                headers: {
                    Authorization: 'Bearer ' + SUPABASE_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✅ Supabase Schema Migration Successful!', res.data);
    } catch (err) {
        console.error('❌ Migration failed:', err.response?.data || err.message);
    }
}

run();
