const axios = require('axios');
const https = require('https');
const config = require('./config');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 30,
  keepAliveMsecs: 30000
});

const GRAPH_API_URL = 'https://graph.facebook.com/v22.0';

function formatE164(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 10 && /^[6-9]/.test(clean)) {
    clean = '91' + clean;
  }
  return clean;
}

/**
 * Send free-form text message via WhatsApp Cloud API
 */
async function sendTextMessage(phoneNumberId, to, text) {
  try {
    const cleanTo = formatE164(to);
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: text
        }
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 10000
      }
    );
    return res.data;
  } catch (err) {
    console.error(`[WhatsApp API Error] Failed to send text to ${to}:`, err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Send interactive quick-reply buttons (up to 3 buttons)
 */
async function sendInteractiveButtons(phoneNumberId, to, bodyText, buttons) {
  try {
    const cleanTo = formatE164(to);
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const formattedButtons = buttons.slice(0, 3).map((b, idx) => ({
      type: 'reply',
      reply: {
        id: b.id || `btn_${idx}`,
        title: b.title.substring(0, 20)
      }
    }));

    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: { buttons: formattedButtons }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 10000
      }
    );
    return res.data;
  } catch (err) {
    console.error(`[WhatsApp API Error] Failed to send buttons to ${to}:`, err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Send pre-approved template message via WhatsApp Cloud API (Required for cold numbers / outside 24h window)
 */
async function sendTemplateMessage(phoneNumberId, to, templateName, languageCode = 'en_US', components = []) {
  try {
    const cleanTo = formatE164(to);
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode }
      }
    };
    if (components && components.length > 0) {
      payload.template.components = components;
    }

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      httpsAgent,
      timeout: 10000
    });
    return res.data;
  } catch (err) {
    console.error(`[WhatsApp Template Error] Failed to send template ${templateName} to ${to}:`, err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Mark incoming message as read (blue checkmarks)
 */
async function markMessageAsRead(phoneNumberId, messageId) {
  try {
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 6000
      }
    );
  } catch (err) {
    // Non-critical, ignore
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  markMessageAsRead
};
