const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const WABA_IDS = [
  { id: '1066902379091253', name: 'Multi Channel Publisher (+91 62803 33252)' },
  { id: '1061799510013265', name: 'Mystery DeMysters (+91 62808 34006)' },
  { id: '2333275180764745', name: 'CP System - Funded Live (+91 97792 20581)' }
];

async function subscribeWaba(wabaId, wabaName, publicUrl) {
  const webhookUrl = `${publicUrl}/webhook`;
  console.log(`[Tunnel Runner] Subscribing ${wabaName} (WABA ${wabaId}) to ${webhookUrl}...`);
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`,
      {
        override_callback_uri: webhookUrl,
        verify_token: config.WEBHOOK_VERIFY_TOKEN
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    console.log(`✅ [Tunnel Runner] Subscribed ${wabaName}:`, res.data);
    return true;
  } catch (err) {
    console.error(`❌ [Tunnel Runner] Subscribe failed for ${wabaName}:`, err.response ? err.response.data : err.message);
    return false;
  }
}

// CRITICAL MANDATE: Zero local deployments or ephemeral tunnels.
// Meta WhatsApp Cloud API webhooks must strictly point to 24/7 Railway Production.
const RAILWAY_PRODUCTION_URL = 'https://breeze-production-0f70.up.railway.app';

async function syncAllToRailway() {
  console.log('[Cloud Webhook Lock] Enforcing Railway 24/7 endpoint for all WABAs...');
  for (const waba of WABA_IDS) {
    await subscribeWaba(waba.id, waba.name, RAILWAY_PRODUCTION_URL);
  }
  console.log('[Cloud Webhook Lock] All WABAs locked to Railway. Zero local tunnels.');
}

if (require.main === module) {
  syncAllToRailway();
}

module.exports = { syncAllToRailway, subscribeWaba };
