import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fail = msg => { throw new Error(msg); };
const ok = (cond,msg) => { if(!cond) fail(msg); };

const index=read('index.html');
const topicsRaw=JSON.parse(read('data/topics.json'));
const topics=topicsRaw.topics||topicsRaw;
const meds=JSON.parse(read('data/meds.json'));
const naturals=JSON.parse(read('data/naturals.json'));
const version=JSON.parse(read('version.json'));
const health=JSON.parse(read('health.json'));
const sw=read('sw.js');

ok(topics.length===248,'Očekivano 248 tema');
ok(meds.length===215,'Očekivano 215 lekova/preparata');
ok(naturals.length===197,'Očekivano 197 prirodnih unosa');
ok(version.topics===248&&version.meds===215&&version.naturals===197,'Version count mismatch');
ok(health.build===version.version,'Health build mismatch');
ok(index.includes('const __db={"topics":['),'Embedded topics nisu pronađene');
ok(index.includes('const __meds=['),'Embedded meds nisu pronađeni');
ok(index.includes('const __naturals=['),'Embedded naturals nisu pronađeni');
ok(!index.includes("Promise.all([fetch('data/topics.json'"),'Runtime i dalje zavisi od spoljnog fetch-a');
ok(index.includes('data-nav="mreze"'),'Nedostaje objedinjena Mreže navigacija');
ok(index.includes('function networksPage()'),'Nedostaje objedinjena stranica pretrage mreža');
ok(index.includes('id="networkSearch"'),'Nedostaje glavno polje za pretragu mreža');
ok(index.includes('function allNetworksUrl(q)'),'Nedostaje objedinjena javna pretraga svih mreža');
ok(index.includes('<strong>Sve mreže</strong>'),'Objedinjena pretraga nema jasno dugme Sve mreže');
ok(index.includes('site:facebook.com')&&index.includes('site:instagram.com')&&index.includes('site:tiktok.com')&&index.includes('site:youtube.com')&&index.includes('site:reddit.com')&&index.includes('site:x.com'),'Objedinjena pretraga ne pokriva sve tražene mreže');
ok(index.includes('Facebook, Instagram, TikTok, YouTube, Reddit i X'),'Početna ne objašnjava mrežnu pretragu');
ok(!index.includes('<span>Prirodno</span></button><button'),'Stara odvojena Prirodno navigacija je i dalje primarna');
ok(!index.includes('<span>Radar</span></button>'),'Stara Radar navigacija je i dalje primarna');

const meta=[...index.matchAll(/<meta name="vidar-build" content="([^"]+)">/g)];
ok(meta.length===1,'Mora postojati tačno jedan vidar-build meta tag');
ok(meta[0][1]===version.version,'Index build mismatch');
ok(sw.includes(String(version.version).replaceAll('.','-')),'Service worker cache mismatch');

const scripts=[...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
ok(scripts.length>0,'Inline JavaScript nije pronađen');
for(const [i,src] of scripts.entries()){
  try{ new Function(src); }catch(e){ fail('JavaScript sintaksna greška #'+i+': '+e.message); }
}

console.log('VIDAR embedded stable validation OK');
console.log(JSON.stringify({version:version.version,topics:248,meds:215,naturals:197,indexBytes:Buffer.byteLength(index)},null,2));
