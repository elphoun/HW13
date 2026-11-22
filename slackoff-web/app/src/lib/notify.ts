// Browser notifications. Uses the service worker registration when available (needed on mobile Chrome,
// and lets notification clicks focus the app), and falls back to `new Notification()`.
let reg: ServiceWorkerRegistration | null = null;

export const notificationsSupported = () => typeof Notification !== 'undefined';
export const permission = (): NotificationPermission | 'unsupported' => notificationsSupported() ? Notification.permission : 'unsupported';

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { reg = await navigator.serviceWorker.register('/sw.js'); } catch { /* unsupported (e.g. insecure origin) */ }
}

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export async function notify(title: string, body: string, tag = 'slackoff') {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const opts = { body, tag, icon: '/favicon.svg', badge: '/favicon.svg', requireInteraction: true, data: { url: '/' }, actions: tag === 'slackoff-break' ? [{ action: 'start', title: 'Start exercise' }] : [] } as NotificationOptions;
  try {
    const r = reg ?? (await navigator.serviceWorker?.getRegistration());
    if (r) { await r.showNotification(title, opts); return true; }
  } catch { /* fall through */ }
  try {
    const n = new Notification(title, { ...opts, actions: undefined } as NotificationOptions);
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch { return false; }
}
