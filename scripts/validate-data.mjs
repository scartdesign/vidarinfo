import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fail = msg => { throw new Error(msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); };

const index = read('index.html');
const sw = read('sw.js');
const version = JSON.parse(read('version.json'));
const health = JSON.parse(read('health.json'));
const topicsRaw = JSON.parse(read('data/topics.json'));
const topics = topicsRaw.topics || topicsRaw;
const meds = JSON.parse(read('data/meds.json'));
const naturals = JSON.parse(read('data/naturals.json'));

ok(Array.isArray(topics), 'topics.json mora sadržati niz tema');
ok(Array.isArray(meds), 'meds.json mora sadržati niz lekova/preparata');
ok(Array.isArray(naturals), 'naturals.json mora sadržati niz prirodnih unosa');
ok(topics.length === 248, 'Očekivano 248 tema, pronađeno ' + topics.length);
ok(meds.length === 215, 'Očekivano 215 lekova/preparata, pronađeno ' + meds.length);
ok(naturals.length === 197, 'Očekivano 197 prirodnih unosa, pronađeno ' + naturals.length);

function uniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    ok(item && typeof item.id === 'string' && item.id.trim(), label + ': nedostaje id');
    ok(!seen.has(item.id), label + ': duplikat id=' + item.id);
    seen.add(item.id);
  }
  return seen;
}
const topicIds = uniqueIds(topics, 'Tema');
const medIds = uniqueIds(meds, 'Lek');
uniqueIds(naturals, 'Prirodni unos');

for (const n of naturals) {
  for (const id of n.topics || []) ok(topicIds.has(id), 'Prirodni unos ' + n.id + ' referencira nepostojeću temu ' + id);
}

const linksMatch = index.match(/const MED_TOPIC_LINKS=(\{[\s\S]*?\});/);
ok(linksMatch, 'MED_TOPIC_LINKS nije pronađen u index.html');
const medLinks = JSON.parse(linksMatch[1]);
for (const [medId, refs] of Object.entries(medLinks)) {
  ok(medIds.has(medId), 'MED_TOPIC_LINKS sadrži nepostojeći lek ' + medId);
  ok(Array.isArray(refs), 'MED_TOPIC_LINKS za ' + medId + ' nije niz');
  for (const topicId of refs) ok(topicIds.has(topicId), 'Lek ' + medId + ' referencira nepostojeću temu ' + topicId);
}

ok(version.topics === topics.length, 'version.json topics broj nije usklađen');
ok(version.meds === meds.length, 'version.json meds broj nije usklađen');
ok(version.naturals === naturals.length, 'version.json naturals broj nije usklađen');
ok(health.ok === true && health.service === 'vidar-info', 'health.json nije validan');
ok(health.build === version.version, 'health.json build nije usklađen sa version.json');
const cacheVersion = String(version.version).replaceAll('.', '-');
ok(sw.includes(cacheVersion), 'Service worker cache nije usklađen sa version.json (' + cacheVersion + ')');

const scripts = [...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
ok(scripts.length > 0, 'Nije pronađen inline JavaScript');
for (const [i, source] of scripts.entries()) {
  try { new Function(source); } catch (e) { fail('JavaScript sintaksna greška u script #' + i + ': ' + e.message); }
}

const CYR_MAP={'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'};
const norm=s=>Array.from(String(s||'').toLocaleLowerCase('sr')).map(ch=>CYR_MAP[ch]||ch).join('').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'dj').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['za','i','ili','u','na','od','do','sa','s','po','kod','je','su','se','mi','me','neki','neka','neko','lek','leka','lekom','lekovi','prirodni','prirodno','prirodan','prirodna','prirodne','preparat','preparata','preparati','zdravlje','zdravstveni','zdravstvena','protiv','kako','sta','sto','koji','koja','koje','najbolji','najbolja','najbolje','dobar','dobra','dobro','pomaze','pomoci']);
function edit1(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}}return true}
function searchTerms(q){let raw=norm(q),all=raw.split(/\s+/).filter(x=>x.length>1),core=all.filter(x=>!STOP.has(x));return core.length?core:all}
function wordMatch(q,w){if(!q||!w)return 0;if(q===w)return 4;if(q.length>=4&&w.length>=4&&(w.startsWith(q)||q.startsWith(w)))return 3;if(q.length>=5&&w.length>=4&&edit1(q,w))return 2;return 0}
function textTokenScore(terms,text,weight){let ws=norm(text).split(/\s+/).filter(Boolean),hits=0,score=0;for(let q of terms){let best=0;for(let w of ws){let v=wordMatch(q,w);if(v>best)best=v;if(best===4)break}if(best){hits++;score+=best*weight}}return{hits,score}}
function topicMatchScore(t,q){q=norm(q);if(!q)return 0;let terms=searchTerms(q),title=norm(t.title),aliases=(t.aliases||[]).map(norm),sym=(t.symptoms||[]).map(norm),intro=norm(t.intro),cat=norm(t.category),score=0,hitSet=new Set(),core=terms.join(' ');if(title===q||title===core)score+=160;if(aliases.some(a=>a===q||a===core))score+=145;let fields=[[title,14],...aliases.map(a=>[a,12]),...sym.map(a=>[a,6]),[cat,4],[intro,2]];for(let [field,w] of fields){let r=textTokenScore(terms,field,w);score+=r.score;if(r.hits)for(let term of terms){if(textTokenScore([term],field,1).hits)hitSet.add(term)}}if(!hitSet.size)return 0;let minHits=terms.length>1?Math.ceil(terms.length*.6):1;if(hitSet.size<minHits)return 0;if(hitSet.size===terms.length)score+=45+terms.length*8;else score-=20*(terms.length-hitSet.size);return Math.max(score,0)}
function anchor(q){let nq=norm(q),terms=searchTerms(nq);if(!terms.length)return null;let core=terms.join(' '),exact=topics.find(t=>norm(t.title)===nq||norm(t.title)===core||(t.aliases||[]).some(a=>norm(a)===nq||norm(a)===core));if(exact)return exact;let ranked=topics.map(t=>[t,topicMatchScore(t,nq)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),top=ranked[0],next=ranked[1];if(!top)return null;let gap=top[1]-(next?next[1]:0),dominant=!next||next[1]<=top[1]*.55;if((terms.length===1&&top[1]>=80&&gap>=30&&dominant)||(terms.length>1&&top[1]>=120&&gap>=45&&dominant))return top[0];return null}

function topTopics(q, limit=6) {
  return topics.map(t=>[t,topicMatchScore(t,q)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]||a[0].title.localeCompare(b[0].title,'sr')).slice(0,limit).map(x=>x[0]);
}

const sinusQueries=['sinus','sinusi','sinuse','prirodni lek za sinuse','koji prirodni lek pomaze za sinuse'];
for (const q of sinusQueries) {
  const a=anchor(q);
  ok(a && a.id==='sinusi', 'Regresija: upit "'+q+'" mora da sidri temu sinusi');
  const top=topTopics(q);
  ok(top[0] && top[0].id==='sinusi', 'Regresija: prvi topic za "'+q+'" mora biti sinusi');
  ok(!top.some(t=>t.id==='bol-u-dojkama'||t.id==='erektilna-disfunkcija'), 'Regresija: nepovezana tema za "'+q+'"');
}
ok(anchor('prirodni lek za dojke')===null, 'Širok upit "prirodni lek za dojke" ne sme automatski da se zaključa na jednu temu');
ok(topTopics('erektilna disfunkcija')[0]?.id==='erektilna-disfunkcija', 'Tačan upit za erektilnu disfunkciju nije prvi rezultat');
ok(topTopics('bol u dojkama')[0]?.id==='bol-u-dojkama', 'Tačan upit za bol u dojkama nije prvi rezultat');

console.log('VIDAR validation OK');
console.log(JSON.stringify({
  version: version.version,
  topics: topics.length,
  meds: meds.length,
  naturals: naturals.length,
  medLinks: Object.keys(medLinks).length,
  searchRegression: 'OK'
}, null, 2));
