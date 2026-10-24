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
 * Show typing indicator & mark incoming message as read (blue checkmarks + typing bubble)
 */
async function sendTypingIndicator(phoneNumberId, messageId) {
  try {
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: {
          type: 'text'
        }
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
    return res.data;
  } catch (err) {
    // If typing_indicator fails on older API version or missing permission, fall back to markMessageAsRead
    return markMessageAsRead(phoneNumberId, messageId).catch(() => {});
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

/**
 * Send image attachment (Flyer, E-Card, Photo)
 * @param {string} phoneNumberId - WhatsApp Business Phone Number ID
 * @param {string} to - Recipient phone number (E.164)
 * @param {string|object} imageInput - Hosted public URL string (https://...) or Meta media ID string or { link } / { id }
 * @param {string} caption - Optional text caption (max 1024 chars)
 */
async function sendImageMessage(phoneNumberId, to, imageInput, caption = '') {
  try {
    const cleanTo = formatE164(to);
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const imagePayload = {};
    if (typeof imageInput === 'string') {
      if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
        imagePayload.link = imageInput;
      } else {
        imagePayload.id = imageInput;
      }
    } else if (typeof imageInput === 'object' && imageInput !== null) {
      if (imageInput.link) imagePayload.link = imageInput.link;
      else if (imageInput.id) imagePayload.id = imageInput.id;
    }
    if (caption) {
      imagePayload.caption = String(caption).substring(0, 1024);
    }

    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'image',
        image: imagePayload
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 15000
      }
    );
    return res.data;
  } catch (err) {
    console.error(`[WhatsApp API Error] Failed to send image to ${to}:`, err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Send document attachment (PDF, E-Brochure, Price List)
 * @param {string} phoneNumberId - WhatsApp Business Phone Number ID
 * @param {string} to - Recipient phone number (E.164)
 * @param {string|object} docInput - Hosted public URL string or Meta media ID string or { link } / { id }
 * @param {string} filename - Display filename (e.g. 'CP_System_Quotation.pdf')
 * @param {string} caption - Optional text caption (max 1024 chars)
 */
async function sendDocumentMessage(phoneNumberId, to, docInput, filename = '', caption = '') {
  try {
    const cleanTo = formatE164(to);
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
    const docPayload = {};
    if (typeof docInput === 'string') {
      if (docInput.startsWith('http://') || docInput.startsWith('https://')) {
        docPayload.link = docInput;
      } else {
        docPayload.id = docInput;
      }
    } else if (typeof docInput === 'object' && docInput !== null) {
      if (docInput.link) docPayload.link = docInput.link;
      else if (docInput.id) docPayload.id = docInput.id;
    }
    if (filename) {
      docPayload.filename = filename;
    }
    if (caption) {
      docPayload.caption = String(caption).substring(0, 1024);
    }

    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'document',
        document: docPayload
      },
      {
        headers: {
          Authorization: `Bearer ${config.META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        timeout: 15000
      }
    );
    return res.data;
  } catch (err) {
    console.error(`[WhatsApp API Error] Failed to send document to ${to}:`, err.response ? err.response.data : err.message);
    throw err;
  }
}

/**
 * Build template components for Broadcast / Marketing campaigns with Media Header
 * @param {string} mediaType - 'IMAGE' | 'DOCUMENT' | 'VIDEO'
 * @param {string} mediaUrlOrId - Public HTTPS URL or Meta Media ID
 * @param {Array<string>} bodyVariables - Optional array of strings for {{1}}, {{2}} in template body
 */
function buildMediaTemplateComponents(mediaType, mediaUrlOrId, bodyVariables = []) {
  const components = [];
  if (mediaType && mediaUrlOrId) {
    const typeLower = mediaType.toLowerCase();
    const isUrl = mediaUrlOrId.startsWith('http://') || mediaUrlOrId.startsWith('https://');
    components.push({
      type: 'header',
      parameters: [
        {
          type: typeLower,
          [typeLower]: isUrl ? { link: mediaUrlOrId } : { id: mediaUrlOrId }
        }
      ]
    });
  }
  if (Array.isArray(bodyVariables) && bodyVariables.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyVariables.map(v => ({
        type: 'text',
        text: String(v)
      }))
    });
  }
  return components;
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  sendImageMessage,
  sendDocumentMessage,
  buildMediaTemplateComponents,
  sendTypingIndicator,
  markMessageAsRead
};
