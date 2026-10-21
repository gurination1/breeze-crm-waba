const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uejeoznlhfqsyknoleib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlamVvem5saGZxc3lrbm9sZWliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTcyNjAyOCwiZXhwIjoyMTA3MzAyMDI4fQ.6r0FOb7QbpSstcR4Hqgs1dkJh07Hfyw_RvMt3E2AwaA';

let pingCount = 0;

/**
 * Pings Supabase PostgreSQL database to prevent 7-day auto-freeze / pause.
 * Performs a write/update on public.keep_alive table.
 */
async function pingSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[Supabase Keep-Alive] Missing SUPABASE_URL or SUPABASE_KEY. Skipping ping.');
    return false;
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/keep_alive?id=eq.1`;
  const timestamp = new Date().toISOString();

  try {
    // Write query triggers active database I/O and resets the 7-day inactivity timer
    const response = await axios.patch(
      endpoint,
      {
        last_ping: timestamp,
        pinger: 'railway-guribot-keepalive'
      },
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        timeout: 10000
      }
    );

    pingCount++;
    console.log(`[Supabase Keep-Alive] ✅ Database active! Ping #${pingCount} at ${timestamp} (HTTP ${response.status})`);
    return true;
  } catch (err) {
    // If PATCH encounters error, fallback to GET query
    try {
      const getRes = await axios.get(`${SUPABASE_URL}/rest/v1/keep_alive?select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        timeout: 10000
      });
      pingCount++;
      console.log(`[Supabase Keep-Alive] ✅ Fallback read ping #${pingCount} succeeded at ${timestamp}`);
      return true;
    } catch (innerErr) {
      console.error(`[Supabase Keep-Alive] ❌ Ping failed:`, innerErr.response?.data || innerErr.message);
      return false;
    }
  }
}

function startKeepAlive(intervalMs = 12 * 60 * 60 * 1000) { // Default every 12 hours
  console.log(`[Supabase Keep-Alive] Initializing auto-ping scheduler (every ${intervalMs / 3600000}h)...`);
  
  // Initial ping 10 seconds after server start
  setTimeout(() => {
    pingSupabase();
  }, 10000);

  // Recurring interval
  const timer = setInterval(() => {
    pingSupabase();
  }, intervalMs);

  return timer;
}

module.exports = {
  pingSupabase,
  startKeepAlive
};
