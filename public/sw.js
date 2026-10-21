// Zero-risk pass-through Service Worker for Android PWA Installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through: Zero caching interference with live CRM data, APIs, or WebSockets
self.addEventListener('fetch', (event) => {
  // Let browser handle all requests naturally via network
});
