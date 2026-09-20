const CACHE='vidar-shell-2026-09-21-preview-74';
const SHELL=['/','/index.html','/manifest.webmanifest','/assets/icon.svg','/privacy.html','/terms.html','/data/topics.json','/data/meds.json','/data/naturals.json','/version.json','/health.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
if(u.pathname==='/'||u.pathname==='/index.html'||u.pathname.startsWith('/data/')){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return;}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});