/**
 * CLOUDFLARE WORKER GATEWAY: ZERO-DOWNTIME FAILOVER PROXY
 * 
 * Free Tier Allowance: 100,000 requests / day ($0.00)
 * Function: Routes inbound WhatsApp Webhooks & CRM requests to Primary (Oracle).
 * If Primary fails, times out (> 3000ms), or returns 5xx, instantly fails over
 * to Secondary (Render) with zero dropped payloads.
 */

// Configure Origin Hostnames
const PRIMARY_ORIGIN = 'oracle.breeze-crm.com'; // Oracle Cloud VPS IP / Domain
const SECONDARY_ORIGIN = 'breeze-crm.onrender.com'; // Render Web Service Subdomain
const TIMEOUT_MS = 3000; // 3-second timeout before failing over to secondary

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Read request body once as ArrayBuffer so it can be re-sent if primary fails
    let requestBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBody = await request.arrayBuffer();
    }

    // 1. Try Primary Origin (Oracle)
    try {
      const primaryResponse = await forwardRequest(request, url, PRIMARY_ORIGIN, requestBody, TIMEOUT_MS);
      if (primaryResponse.status < 500) {
        return primaryResponse;
      }
      console.warn(`[Failover] Primary returned HTTP ${primaryResponse.status}. Routing to Secondary...`);
    } catch (err) {
      console.warn(`[Failover] Primary connection failed: ${err.message}. Routing to Secondary...`);
    }

    // 2. Instant Failover to Secondary Origin (Render)
    try {
      const secondaryResponse = await forwardRequest(request, url, SECONDARY_ORIGIN, requestBody, 15000);
      return secondaryResponse;
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Service Temporarily Unavailable',
        message: 'Both primary and secondary servers are unreachable.',
        timestamp: new Date().toISOString()
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

async function forwardRequest(originalRequest, originalUrl, targetHost, bodyBuffer, timeoutMs) {
  const targetUrl = new URL(originalUrl.toString());
  targetUrl.hostname = targetHost;
  targetUrl.protocol = 'https:';

  const headers = new Headers(originalRequest.headers);
  headers.set('X-Forwarded-Host', originalUrl.hostname);
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Proxy-Target', targetHost);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: originalRequest.method,
      headers,
      body: bodyBuffer,
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}
