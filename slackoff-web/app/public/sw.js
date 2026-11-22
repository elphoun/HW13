// SlackOff service worker: shows timer notifications and brings the app back to the front when one is clicked.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'notification-click', action: event.action || 'open' }); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Web Push (works once a push server sends payloads; see README).
self.addEventListener('push', event => {
  let data = { title: 'SlackOff', body: 'Time to move!' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.svg', tag: 'slackoff', data: { url: '/' } }));
});
