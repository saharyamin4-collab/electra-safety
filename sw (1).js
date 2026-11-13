/* CX-Electra — Service Worker: האפליקציה נפתחת גם בלי קליטה (חדרי חשמל) */
const VERSION = 'cxe-v3.2.0';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const CDN_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const PRECACHE_CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.concat(PRECACHE_CDN).map(u => c.add(new Request(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('cxe-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // דף האפליקציה: קודם רשת (כדי לקבל עדכונים), ואם אין קליטה — מהמטמון
  if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/'))){
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req).then(r => { if (r && r.ok) { cache.put('./index.html', r.clone()); } return r; });
      try { return await Promise.race([net, timeout(5000)]); }
      catch(_){
        const cached = await cache.match('./index.html') || await cache.match('./');
        if (cached){ net.catch(() => {}); return cached; }
        return net;
      }
    })());
    return;
  }

  // קבצים סטטיים של האפליקציה: מהמטמון, ומתעדכנים ברקע
  if (url.origin === location.origin){
    e.respondWith((async () => {
      const cache = await caches.open(VERSION), cached = await cache.match(req);
      const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    })());
    return;
  }

  // ספריות Firebase וגופנים (גרסאות קבועות): מהמטמון אם קיים
  if (CDN_HOSTS.includes(url.hostname)){
    e.respondWith((async () => {
      const cache = await caches.open(VERSION), cached = await cache.match(req);
      if (cached) return cached;
      const r = await fetch(req);
      if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone());
      return r;
    })());
  }
  // כל השאר (Firestore, Google APIs) — ישירות לרשת, בלי התערבות
});
