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

ok(Array.isArray(topics)&&topics.length===248,'Očekivano 248 tema');
ok(Array.isArray(meds)&&meds.length===215,'Očekivano 215 lekova/preparata');
ok(Array.isArray(naturals)&&naturals.length===197,'Očekivano 197 prirodnih unosa');

function uniqueIds(items,label){
  const seen=new Set();
  for(const item of items){
    ok(item&&typeof item.id==='string'&&item.id.trim(),label+' nema id');
    ok(!seen.has(item.id),label+' duplikat id='+item.id);
    seen.add(item.id);
  }
}
uniqueIds(topics,'Tema');
uniqueIds(meds,'Lek');
uniqueIds(naturals,'Prirodni unos');

ok(version.topics===topics.length,'version topics mismatch');
ok(version.meds===meds.length,'version meds mismatch');
ok(version.naturals===naturals.length,'version naturals mismatch');
ok(health.ok===true&&health.service==='vidar-info','health metadata nije validna');
ok(health.build===version.version,'health build mismatch');
ok(index.includes("fetch('data/topics.json'"),'index ne učitava topics.json');
ok(index.includes("fetch('data/meds.json'"),'index ne učitava meds.json');
ok(index.includes("fetch('data/naturals.json'"),'index ne učitava naturals.json');
ok(index.includes('<div id="app">'),'app root nedostaje');

const meta=index.match(/<meta name="vidar-build" content="([^"]+)">/);
ok(meta&&meta[1]===version.version,'index build mismatch');
const cache=String(version.version).replaceAll('.','-');
ok(sw.includes(cache),'service worker cache mismatch');

const scripts=[...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
ok(scripts.length>0,'inline JavaScript nije pronađen');
for(const [i,src] of scripts.entries()){
  try{ new Function(src); }catch(e){ fail('JavaScript sintaksna greška #'+i+': '+e.message); }
}

console.log('VIDAR stable validation OK');
console.log(JSON.stringify({version:version.version,topics:topics.length,meds:meds.length,naturals:naturals.length},null,2));
