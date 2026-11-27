// TM Factor safety net: only a version that passes a health check becomes the backup.
const CACHE = 'tm-safety-v3';
const GOOD = './__good', TRY = './__try', BAD = './__bad';

// Runs ahead of the page's own code and reports whether the app started properly
function probe() {
  let failed = false;
  addEventListener('error', e => { if (e.target === window) failed = true; });
  addEventListener('load', () => setTimeout(() => {
    const ids = ['rate', 'time', 'unit', 'outputCard'];
    const fns = ['calculateSingle'];
    const ok = !failed && ids.every(i => document.getElementById(i)) && fns.every(f => typeof window[f] === 'function');
    const channel = new MessageChannel();
    channel.port1.onmessage = e => { if (e.data === 'reload') location.reload(); };
    navigator.serviceWorker.controller?.postMessage({ healthV3: ok }, [channel.port2]);
  }, 500));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(k => Promise.all(k.filter(n => n.startsWith('tm-factor-') || n === 'tm-safety').map(n => caches.delete(n))))
    .then(() => clients.claim())));

const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const read = async (c, key) => (await c.match(key))?.text();

function fetchFresh(request) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5000);
  return fetch(request.url, { cache: 'no-store', signal: stop.signal }).finally(() => clearTimeout(timer));
}

async function page(request) {
  const c = await caches.open(CACHE);
  const good = await read(c, GOOD);
  let res, text;
  try {
    res = await fetchFresh(request);
    if (res.ok) text = await res.clone().text();
  } catch {}
  if (text === undefined) return good !== undefined ? html(good) : res || Response.error();
  if (good !== undefined && text === await read(c, BAD)) return html(good);
  await c.put(TRY, html(text));
  const tag = `<script>(${probe})()</script>`;
  const doctype = text.match(/^\s*<!doctype[^>]*>/i)?.[0] || '';
  return html(doctype + tag + text.slice(doctype.length));
}

self.addEventListener('message', e => {
  if (typeof e.data?.healthV3 !== 'boolean') return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const tried = await read(c, TRY);
    if (tried === undefined) return;
    await c.put(e.data.healthV3 ? GOOD : BAD, html(tried));
    if (!e.data.healthV3 && await c.match(GOOD)) e.ports[0]?.postMessage('reload');
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url), root = new URL('./', location.href).pathname;
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate' && (url.pathname === root || url.pathname === root + 'index.html')) {
    e.respondWith(page(req));
  } else if (/\/(manifest\.json|icon\.png)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      try {
        const res = await fetchFresh(req);
        if (res.ok) { await c.put(req, res.clone()); return res; }
        return (await c.match(req)) || res;
      } catch { return (await c.match(req)) || Response.error(); }
    }));
  }
});
