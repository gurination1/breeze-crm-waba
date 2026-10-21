const axios = require('axios');
const config = require('./config');

const RAILWAY_WEBHOOK_URL = 'https://breeze-production-0f70.up.railway.app/webhook';
const WABA_IDS = [
  { id: '2333275180764745', name: 'CP System - Funded Live (+91 97792 20581)' },
  { id: '1066902379091253', name: 'Multi Channel Publisher (+91 62803 33252)' }
];

async function ensureRailwayWebhook() {
  console.log(`📡 Ensuring Meta WhatsApp Cloud Webhooks are locked to Railway Production URL:`);
  console.log(`   URL: ${RAILWAY_WEBHOOK_URL}\n`);

  for (const item of WABA_IDS) {
    try {
      console.log(`⏳ Subscribing ${item.name} (WABA ID: ${item.id})...`);
      const res = await axios.post(
        `https://graph.facebook.com/v22.0/${item.id}/subscribed_apps`,
        {
          override_callback_uri: RAILWAY_WEBHOOK_URL,
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
      console.log(`✅ Success for ${item.name}:`, res.data);
    } catch (err) {
      console.error(`❌ Failed for ${item.name}:`, err.response?.data || err.message);
    }
  }

  console.log('\n🔍 Verifying active subscriptions from Meta Graph API:');
  for (const item of WABA_IDS) {
    try {
      const check = await axios.get(`https://graph.facebook.com/v22.0/${item.id}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${config.META_ACCESS_TOKEN}` }
      });
      const activeUri = check.data.data?.[0]?.override_callback_uri || 'None';
      console.log(`   ${item.name}: ${activeUri}`);
    } catch (err) {
      console.error(`   Error checking ${item.name}:`, err.message);
    }
  }
}

ensureRailwayWebhook();
