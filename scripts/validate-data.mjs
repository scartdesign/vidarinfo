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
ok(topics.length === 592, 'Očekivano 592 tema, pronađeno ' + topics.length);
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

const duplicateMatch = index.match(/const TOPIC_DUPLICATE_OF=(\{[^;]+\});/);
ok(duplicateMatch, 'TOPIC_DUPLICATE_OF nije pronađen u index.html');
const topicDuplicateOf = new Function('return (' + duplicateMatch[1] + ')')();
for (const [legacyId, targetId] of Object.entries(topicDuplicateOf)) {
  ok(topicIds.has(legacyId), 'Duplicate mapa referencira nepostojeću legacy temu ' + legacyId);
  ok(topicIds.has(targetId), 'Duplicate mapa referencira nepostojeću canonical temu ' + targetId);
  ok(legacyId !== targetId, 'Duplicate mapa ne sme mapirati temu samu na sebe: ' + legacyId);
  ok(!Object.prototype.hasOwnProperty.call(topicDuplicateOf, targetId), 'Canonical tema ne sme biti i legacy ključ: ' + targetId);
}
const canonicalTopicId = id => topicDuplicateOf[id] || id;
const catalogTopics = topics.filter(t => canonicalTopicId(t.id) === t.id);
const legacyAliases = Object.entries(topicDuplicateOf).reduce((acc,[legacyId,targetId]) => {
  const legacy = topics.find(t => t.id === legacyId);
  if (legacy) acc[targetId] = [...(acc[targetId] || []), legacy.title, ...(legacy.aliases || [])];
  return acc;
}, {});
const topicSearchAliases = t => [...new Set([...(t.aliases || []), ...(legacyAliases[t.id] || [])])];
ok(catalogTopics.length === topics.length - Object.keys(topicDuplicateOf).length, 'Broj jedinstvenih tema nije usklađen sa duplicate mapom');
ok(topicDuplicateOf.tonsilitis==='tonzilitis', 'Legacy tonsilitis mora biti mapiran na canonical tonzilitis');

function requireFields(items,label,fields){
  for(const item of items){
    for(const field of fields){
      const value=item[field];
      const empty=value==null||(typeof value==='string'&&!value.trim())||(Array.isArray(value)&&value.length===0);
      ok(!empty,label+' '+item.id+': prazno polje '+field);
    }
  }
}
function uniqueText(items,label,field){
  const seen=new Map();
  for(const item of items){
    const value=String(item[field]||'').trim().toLocaleLowerCase('sr');
    ok(!seen.has(value),label+': duplikat '+field+' "'+value+'" ('+seen.get(value)+' / '+item.id+')');
    seen.set(value,item.id);
  }
}
requireFields(topics,'Tema',['title','category','intro','aliases','symptoms','selfCare','doctor','urgent','evidence']);
requireFields(meds,'Lek',['name','active','group','about','important','check']);
requireFields(naturals,'Prirodni unos',['name','group','claim','evidence','safety','status','platforms']);
uniqueText(topics,'Tema','title');
uniqueText(meds,'Lek','name');
uniqueText(naturals,'Prirodni unos','name');
for(const n of naturals) ok(['supported','limited','none','avoid'].includes(n.status),'Prirodni unos '+n.id+': nepoznat status '+n.status);

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
const buildMeta=index.match(/<meta name="vidar-build" content="([^"]+)">/);
ok(buildMeta && buildMeta[1]===version.version, 'index.html vidar-build nije usklađen sa version.json');
const cacheVersion = String(version.version).replaceAll('.', '-');
ok(sw.includes(cacheVersion), 'Service worker cache nije usklađen sa version.json (' + cacheVersion + ')');

const scripts = [...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
ok(scripts.length > 0, 'Nije pronađen inline JavaScript');
for (const [i, source] of scripts.entries()) {
  try { new Function(source); } catch (e) { fail('JavaScript sintaksna greška u script #' + i + ': ' + e.message); }
}

const CYR_MAP={'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'};
const norm=s=>Array.from(String(s||'').toLocaleLowerCase('sr')).map(ch=>CYR_MAP[ch]||ch).join('').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'dj').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['za','i','ili','u','na','od','do','sa','s','po','kod','je','su','se','mi','me','meni','mene','te','vas','da','li','imam','imas','ima','imamo','imate','imaju','mogu','mozes','moze','osecam','osjecam','oseca','osjeca','neki','neka','neko','lek','leka','lekom','lekovi','prirodni','prirodno','prirodan','prirodna','prirodne','preparat','preparata','preparati','zdravlje','zdravstveni','zdravstvena','protiv','kako','sta','sto','koji','koja','koje','najbolji','najbolja','najbolje','dobar','dobra','dobro','pomaze','pomoci','molim','treba','trebam','hteo','htela','bas','veoma','jako','pun','puna','puno','puni','boli','bole','pece','peku','svrbi','svrbe','gori','curi','stalno','stalo','cesto','dugo','vec','dana','danima']);
function edit1(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}}return true}
function edit2(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>2)return false;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let cur=[i],rowMin=i;for(let j=1;j<=b.length;j++){let v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));cur[j]=v;if(v<rowMin)rowMin=v}if(rowMin>2)return false;prev=cur}return prev[b.length]<=2}
function searchTerms(q){let raw=norm(q),all=raw.split(/\s+/).filter(x=>x.length>1),core=all.filter(x=>!STOP.has(x));return core.length?core:all}
function wordMatch(q,w){if(!q||!w)return 0;if(q===w)return 4;if(q.length>=4&&w.length>=4&&(w.startsWith(q)||q.startsWith(w)))return 3;if(q.length>=5&&w.length>=4&&edit1(q,w))return 2;if(q.length>=6&&w.length>=6&&edit2(q,w))return 1;return 0}
function textTokenScore(terms,text,weight){let ws=norm(text).split(/\s+/).filter(Boolean),hits=0,score=0;for(let q of terms){let best=0;for(let w of ws){let v=wordMatch(q,w);if(v>best)best=v;if(best===4)break}if(best){hits++;score+=best*weight}}return{hits,score}}
function oncologyIntent(q){return /\b(rak|karcinom|tumor|cancer|melanom|leukem\w*|limfom\w*|onkolog\w*)\b/.test(norm(q))}
const TOPIC_SEARCH_CACHE=new Map();
function topicSearchIndex(t){let x=TOPIC_SEARCH_CACHE.get(t.id);if(x)return x;x={title:norm(t.title),aliases:topicSearchAliases(t).map(norm),sym:(t.symptoms||[]).map(norm),intro:norm(t.intro),cat:norm(t.category)};TOPIC_SEARCH_CACHE.set(t.id,x);return x}
function topicMatchScore(t,q){q=norm(q);if(!q)return 0;let terms=searchTerms(q),ix=topicSearchIndex(t),title=ix.title,aliases=ix.aliases,sym=ix.sym,intro=ix.intro,cat=ix.cat,score=0,hitSet=new Set(),core=terms.join(' '),oncologyGuard=t.category==='Onkologija'&&!oncologyIntent(q);if(title===q)return oncologyGuard?120:2200;if(aliases.some(a=>a===q))return oncologyGuard?90:2100;if(title===core)score+=520;if(aliases.some(a=>a===core))score+=480;let fields=[[title,14],...aliases.map(a=>[a,12]),...sym.map(a=>[a,6]),[cat,4],[intro,2]];for(let [field,w] of fields){let r=textTokenScore(terms,field,w);score+=r.score;if(r.hits)for(let term of terms){if(textTokenScore([term],field,1).hits)hitSet.add(term)}}if(!hitSet.size)return 0;let minHits=terms.length>1?Math.ceil(terms.length*.6):1;if(hitSet.size<minHits)return 0;if(hitSet.size===terms.length)score+=45+terms.length*8;else score-=20*(terms.length-hitSet.size);if(oncologyGuard)score=Math.min(score*.35,90);return Math.max(score,0)}
function anchor(q){let nq=norm(q),terms=searchTerms(nq);if(!terms.length)return null;let core=terms.join(' '),exact=catalogTopics.find(t=>{let hit=norm(t.title)===nq||norm(t.title)===core||topicSearchAliases(t).some(a=>norm(a)===nq||norm(a)===core);return hit&&(t.category!=='Onkologija'||oncologyIntent(nq))});if(exact)return exact;let ranked=catalogTopics.map(t=>[t,topicMatchScore(t,nq)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),top=ranked[0],next=ranked[1];if(!top)return null;let gap=top[1]-(next?next[1]:0),dominant=!next||next[1]<=top[1]*.55;if((terms.length===1&&top[1]>=80&&gap>=30&&dominant)||(terms.length>1&&top[1]>=120&&gap>=45&&dominant))return top[0];return null}

function topTopics(q, limit=6) {
  return catalogTopics.map(t=>[t,topicMatchScore(t,q)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]||a[0].title.localeCompare(b[0].title,'sr')).slice(0,limit).map(x=>x[0]);
}

const catalogSearchOwners=new Map();
for (const t of catalogTopics) {
  for (const phrase of [t.title, ...topicSearchAliases(t)]) {
    const key=norm(phrase);
    if(!key) continue;
    if(!catalogSearchOwners.has(key)) catalogSearchOwners.set(key,new Set());
    catalogSearchOwners.get(key).add(t.id);
  }
}
let fullCatalogSearchCoverage=0;
for (const t of catalogTopics) {
  const titleTop=topTopics(t.title,1)[0];
  ok(titleTop?.id===t.id, 'Naslov teme ne vraća sopstvenu temu kao prvi rezultat: '+t.title+' -> '+(titleTop?.id||'nema'));
  fullCatalogSearchCoverage++;
  for (const alias of topicSearchAliases(t)) {
    const key=norm(alias), owners=catalogSearchOwners.get(key);
    if(!key || !owners || owners.size!==1) continue;
    const aliasTop=topTopics(alias,t.category==='Onkologija'&&!oncologyIntent(alias)?6:1);
    const aliasOk=t.category==='Onkologija'&&!oncologyIntent(alias)?aliasTop.some(x=>x.id===t.id):aliasTop[0]?.id===t.id;
    ok(aliasOk, 'Jedinstveni alias ne vraća očekivanu temu: "'+alias+'" -> '+(aliasTop[0]?.id||'nema')+' umesto '+t.id);
    fullCatalogSearchCoverage++;
  }
}
ok(fullCatalogSearchCoverage >= 900, 'Premalo automatskih search coverage provera: '+fullCatalogSearchCoverage);

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
ok(topTopics('puni su mi sinusi')[0]?.id==='sinusi', 'Razgovorni upit za pune sinuse nije prvi rezultat');
ok(topTopics('boli me grlo')[0]?.id==='grlobolja', 'Razgovorni upit za bol u grlu nije prvi rezultat');
ok(['refluks','gastritis','cir-zeluca','hijatalna-hernija'].includes(topTopics('pece me zeludac')[0]?.id), 'Pečenje u želucu ne daje očekivanu digestivnu temu');
ok(!topTopics('pece me zeludac',3).some(t=>t.category==='Onkologija'), 'Generičan simptom želuca ne sme gurati onkologiju u prva 3 rezultata');
ok(topTopics('rak zeluca')[0]?.id==='rak-zeluca', 'Eksplicitan onkološki upit mora i dalje voditi na rak želuca');
ok(topTopics('stalo me boli glava')[0]?.id==='glavobolja', 'Tipfeler u razgovornom upitu za glavobolju nije tolerisan');
ok(topTopics('sinuzzi')[0]?.id==='sinusi', 'Dvostruki tipfeler za sinuse nije tolerisan');
ok(topTopics('hobl')[0]?.id==='copd', 'Legacy upit HOBL mora voditi na canonical COPD temu');
ok(topTopics('hbb')[0]?.id==='hronicna-bubrezna-bolest', 'Legacy upit HBB mora voditi na canonical hroničnu bubrežnu bolest');
ok(topTopics('masld')[0]?.id==='masna-jetra', 'Legacy upit MASLD mora voditi na canonical temu Masna jetra');
ok(topTopics('cmicak')[0]?.id==='jecmenac', 'Upit cmicak mora voditi na temu Čmičak (ječmenac)');
ok(topTopics('čmičak')[0]?.id==='jecmenac', 'Upit čmičak mora voditi na temu Čmičak (ječmenac)');
ok(topTopics('kurje oko')[0]?.id==='kurje-oko', 'Upit kurje oko mora voditi na temu Kurje oko');
ok(topTopics('zulj')[0]?.id==='zulj', 'Upit zulj mora voditi na temu Žulj / plik od trenja');
ok(topTopics('halacion')[0]?.id==='halacion', 'Upit halacion mora voditi na temu Halacion');
ok(topTopics('vaske')[0]?.id==='vaske', 'Upit vaske mora voditi na temu Vaške u kosi');
ok(topTopics('lisaj')[0]?.id==='lisaj-gljivicni', 'Upit lisaj mora voditi na gljivični lišaj');
ok(topTopics('zanoktica')[0]?.id==='paronihija', 'Upit zanoktica mora voditi na paronihiju');
ok(topTopics('krpelj')[0]?.id==='ujed-krpelja', 'Upit krpelj mora voditi na ujed krpelja');
ok(topTopics('kandida u ustima')[0]?.id==='oralna-kandidijaza', 'Upit kandida u ustima mora voditi na oralnu kandidijazu');
ok(topTopics('skrgutanje zubima')[0]?.id==='bruksizam', 'Upit skrgutanje zubima mora voditi na bruksizam');
ok(topTopics('cista na zglobu')[0]?.id==='ganglion-cista', 'Upit cista na zglobu mora voditi na ganglion cistu');
ok(topTopics('uganuo zglob')[0]?.id==='uganuca-istegnuca', 'Upit uganuo zglob mora voditi na uganuće/istegnuće');
ok(topTopics('opekao sam se')[0]?.id==='opekotine', 'Upit opekao sam se mora voditi na opekotine');
ok(topTopics('posekotina')[0]?.id==='posekotine-ogrebotine', 'Upit posekotina mora voditi na rane');
ok(topTopics('gnojni cir')[0]?.id==='cir-koze', 'Upit gnojni cir mora voditi na furunkul');
ok(topTopics('aterom')[0]?.id==='kozna-cista', 'Upit aterom mora voditi na kožnu cistu');
ok(topTopics('muka u autu')[0]?.id==='kinetoza', 'Upit muka u autu mora voditi na kinetozu');
ok(topTopics('ujed psa')[0]?.id==='ujedi-zivotinja', 'Upit ujed psa mora voditi na ugriz životinje');
ok(topTopics('suncanica')[0]?.id==='toplotna-iscrpljenost-udar', 'Upit suncanica mora voditi na toplotnu iscrpljenost/udar');
ok(topTopics('trnu prsti nocu')[0]?.id==='karpalni-tunel', 'Upit trnu prsti nocu mora voditi na karpalni tunel');
ok(topTopics('gliste kod dece')[0]?.id==='decje-gliste', 'Upit gliste kod dece mora voditi na oksiure');
ok(topTopics('zubni apsces')[0]?.id==='zubni-apsces', 'Upit zubni apsces mora voditi na zubni apsces');
ok(topTopics('urastala dlaka')[0]?.id==='urasla-dlaka', 'Upit urastala dlaka mora voditi na uraslu dlaku');
ok(topTopics('baker cista')[0]?.id==='baker-cista', 'Upit baker cista mora voditi na Bakerovu cistu');
ok(topTopics('promrzline')[0]?.id==='promrzline', 'Upit promrzline mora voditi na promrzline');
ok(topTopics('alergija na sunce')[0]?.id==='alergija-sunce', 'Upit alergija na sunce mora voditi na PMLE');
ok(topTopics('viseci fibromi')[0]?.id==='viseci-fibromi', 'Upit viseci fibromi mora voditi na skin tags');
ok(topTopics('petni trn')[0]?.id==='plantarni-fascitis', 'Upit petni trn mora voditi na plantarni fascitis');
ok(topTopics('esencijalni tremor')[0]?.id==='esencijalni-tremor', 'Upit esencijalni tremor mora voditi na esencijalni tremor');
ok(topTopics('svt')[0]?.id==='svt', 'Upit SVT mora voditi na supraventrikularnu tahikardiju');
ok(topTopics('addisonova bolest')[0]?.id==='addisonova-bolest', 'Upit Addisonova bolest mora voditi na adrenalnu insuficijenciju');
ok(topTopics('adenomioza')[0]?.id==='adenomioza', 'Upit adenomioza mora voditi na adenomiozu');
ok(topTopics('naglo ne cujem')[0]?.id==='iznenadni-gubitak-sluha', 'Upit naglo ne cujem mora voditi na iznenadni gubitak sluha');
ok(topTopics('niski trombociti')[0]?.id==='trombocitopenija', 'Upit niski trombociti mora voditi na trombocitopeniju');
ok(topTopics('svt')[0]?.id==='svt', 'SVT mora ostati prepoznat');
ok(topTopics('aortna stenoza')[0]?.id==='aortna-stenoza', 'Aortna stenoza mora biti pronađena');
ok(topTopics('sibo')[0]?.id==='sibo', 'SIBO mora biti pronađen');
ok(topTopics('skleritis')[0]?.id==='skleritis', 'Skleritis mora biti pronađen');
ok(topTopics('niski neutrofili')[0]?.id==='neutropenija', 'Niski neutrofili moraju voditi na neutropeniju');
ok(topTopics('agorafobija')[0]?.id==='agorafobija', 'Agorafobija mora biti pronađena');
ok(topTopics('toksoplazmoza')[0]?.id==='toksoplazmoza', 'Toksoplazmoza mora biti pronađena');
ok(topTopics('hiperemeza gravidarum')[0]?.id==='hiperemeza-gravidarum', 'Hiperemeza mora biti pronađena');
ok(topTopics('rak stitne')[0]?.id==='rak-stitne', 'Rak štitne mora biti pronađen');
ok(topTopics('multipli mijelom')[0]?.id==='multipli-mijelom', 'Multipli mijelom mora biti pronađen');
ok(topTopics('als')[0]?.id==='als', 'ALS mora biti pronađen');
ok(topTopics('diabetes insipidus')[0]?.id==='diabetes-insipidus', 'Diabetes insipidus mora biti pronađen');
ok(topTopics('pbc')[0]?.id==='pbc', 'PBC mora biti pronađen');
ok(topTopics('psc')[0]?.id==='psc', 'PSC mora biti pronađen');
ok(topTopics('familijarna hiperholesterolemija')[0]?.id==='familijarna-hiperholesterolemija', 'Familijarna hiperholesterolemija mora biti pronađena');
ok(topTopics('septicni artritis')[0]?.id==='septicni-artritis', 'Septični artritis mora biti pronađen');
ok(topTopics('behcet')[0]?.id==='behcet', 'Behçet mora biti pronađen');
ok(topTopics('distonija')[0]?.id==='distonija', 'Distonija mora biti pronađena');
ok(topTopics('retinitis pigmentosa')[0]?.id==='retinitis-pigmentosa', 'Retinitis pigmentosa mora biti pronađena');
ok(topTopics('marfan')[0]?.id==='marfan-sindrom', 'Marfan mora biti pronađen');
ok(topTopics('ehlers danlos')[0]?.id==='ehlers-danlos', 'EDS mora biti pronađen');
ok(topTopics('angioedem')[0]?.id==='angioedem', 'Angioedem mora biti pronađen');
ok(topTopics('urinarna retencija')[0]?.id==='urinarna-retencija', 'Urinarna retencija mora biti pronađena');
ok(topTopics('kawasaki')[0]?.id==='kawasaki', 'Kawasaki mora biti pronađen');
ok(topTopics('cisticna fibroza')[0]?.id==='cisticna-fibroza', 'Cistična fibroza mora biti pronađena');
ok(topTopics('holangiokarcinom')[0]?.id==='holangiokarcinom', 'Holangiokarcinom mora biti pronađen');
ok(topTopics('gist')[0]?.id==='gist', 'GIST mora biti pronađen');
ok(topTopics('aortna disekcija')[0]?.id==='aortna-disekcija', 'Aortna disekcija mora biti pronađena');
ok(topTopics('intolerancija fruktoze')[0]?.id==='intolerancija-fruktoze', 'Fruktozna malapsorpcija mora biti pronađena');
ok(topTopics('makularni edem')[0]?.id==='makularni-edem', 'Makularni edem mora biti pronađen');
ok(topTopics('leukoplakija')[0]?.id==='oralna-leukoplakija', 'Oralna leukoplakija mora biti pronađena');
ok(topTopics('rak usta')[0]?.id==='rak-usne-duplje', 'Rak usne duplje mora biti pronađen');
ok(topTopics('mastocitoza')[0]?.id==='mastocitoza', 'Mastocitoza mora biti pronađena');
ok(topTopics('mcas')[0]?.id==='mcas', 'MCAS mora biti pronađen');
ok(topTopics('rak larinksa')[0]?.id==='rak-larinksa', 'Rak larinksa mora biti pronađen');
ok(topTopics('orbitalni celulitis')[0]?.id==='orbitalni-celulitis', 'Orbitalni celulitis mora biti pronađen');
ok(topTopics('hipopituitarizam')[0]?.id==='hipopituitarizam', 'Hipopituitarizam mora biti pronađen');
ok(topTopics('melazma')[0]?.id==='melazma', 'Melazma mora biti pronađena');
ok(topTopics('reaktivni artritis')[0]?.id==='reaktivni-artritis', 'Reaktivni artritis mora biti pronađen');
ok(topTopics('addisonova bolest')[0]?.id==='addison', 'Addisonova bolest mora voditi na canonical Addison');
ok(topTopics('cushingov sindrom')[0]?.id==='cushing', 'Cushingov sindrom mora voditi na canonical Cushing');
ok(topTopics('hijatalna kila')[0]?.id==='hijatalna-hernija', 'Hijatalna kila mora voditi na hijatalnu herniju');
ok(topTopics('bartolinijeva cista')[0]?.id==='bartolinova-cista', 'Bartolinijeva cista mora voditi na Bartolinovu cistu');
ok(topTopics('gnojna angina')[0]?.id==='tonzilitis', 'Upit gnojna angina mora voditi na canonical tonzilitis');
ok(topTopics('urastao nokat')[0]?.id==='urasli-nokat', 'Upit urastao nokat mora voditi na urasli nokat');
ok(topTopics('tortikolis')[0]?.id==='vrat', 'Upit tortikolis mora voditi na bol i ukočenost vrata');
ok(topTopics('glavobolja od sinusa')[0]?.id==='sinusi', 'Upit glavobolja od sinusa mora voditi na sinuse');
ok(topTopics('seboreja')[0]?.id==='seboroeicni-dermatitis', 'Upit seboreja mora voditi na seboroični dermatitis');
ok(topTopics('ispucale usne')[0]?.id==='ispucale-usne', 'Upit ispucale usne mora voditi na suve/ispucale usne');
ok(topTopics('ranice u uglovima usana')[0]?.id==='angularni-heilitis', 'Upit ranice u uglovima usana mora voditi na angularni heilitis');
ok(topTopics('cukalj')[0]?.id==='cukalj', 'Upit cukalj mora voditi na čukalj');
ok(topTopics('ravna stopala')[0]?.id==='ravna-stopala', 'Upit ravna stopala mora voditi na ravna stopala');
ok(topTopics('ispucale pete')[0]?.id==='ispucale-pete', 'Upit ispucale pete mora voditi na suve/ispucale pete');
ok(topTopics('folikulitis')[0]?.id==='folikulitis', 'Upit folikulitis mora voditi na folikulitis');
ok(topTopics('moluske')[0]?.id==='moluske', 'Upit moluske mora voditi na molluscum contagiosum');
ok(topTopics('klikce vilica')[0]?.id==='tmz-vilica', 'Upit klikce vilica mora voditi na TMD');
ok(topTopics('los zadah')[0]?.id==='los-zadah', 'Upit los zadah mora voditi na halitozu');
ok(topTopics('gljivice prepone')[0]?.id==='lisaj-gljivicni', 'Upit gljivice prepone mora voditi na gljivični lišaj');
ok(topTopics('zapuseno uho posle leta')[0]?.id==='eustahijeva-tuba', 'Upit zapuseno uho posle leta mora voditi na Eustahijevu tubu');
ok(topTopics('slivanje sekreta niz grlo')[0]?.id==='postnazalno-slivanje', 'Upit slivanje sekreta niz grlo mora voditi na postnazalno slivanje');
ok(topTopics('geografski jezik')[0]?.id==='geografski-jezik', 'Upit geografski jezik mora voditi na geografsku promenu jezika');
ok(topTopics('pece me jezik')[0]?.id==='burning-mouth', 'Upit pece me jezik mora voditi na burning mouth');
ok(topTopics('pelenski osip')[0]?.id==='pelenski-osip', 'Upit pelenski osip mora voditi na pelenski osip');
ok(topTopics('znojnice')[0]?.id==='znojnice', 'Upit znojnice mora voditi na heat rash');
ok(topTopics('hiperhidroza')[0]?.id==='hiperhidroza', 'Upit hiperhidroza mora voditi na prekomerno znojenje');
ok(topTopics('knedla u grlu')[0]?.id==='globus-grlo', 'Upit knedla u grlu mora voditi na globus');
ok(topTopics('karijes')[0]?.id==='karijes', 'Upit karijes mora voditi na karijes');
ok(topTopics('bol na hladno zub')[0]?.id==='osetljivi-zubi', 'Upit bol na hladno zub mora voditi na osetljive zube');
ok(topTopics('umnjak')[0]?.id==='umnjak', 'Upit umnjak mora voditi na temu umnjak');
ok(topTopics('svrbi me uvo')[0]?.id==='svrab-u-uhu', 'Upit svrbi me uvo mora voditi na svrab u uhu');
ok(topTopics('bol u rebrima')[0]?.id==='kostohondritis', 'Upit bol u rebrima mora voditi na kostohondritis');
ok(topTopics('duple slike')[0]?.id==='diplopija', 'Upit duple slike mora voditi na diplopiju');
ok(topTopics('ne mogu da mokrim')[0]?.id==='retencija-urina', 'Upit ne mogu da mokrim mora voditi na retenciju urina');
ok(topTopics('krv u ispljuvku')[0]?.id==='hemoptizija', 'Upit krv u ispljuvku mora voditi na hemoptiziju');
ok(topTopics('nizak libido')[0]?.id==='nizak-libido', 'Upit nizak libido mora voditi na slabiju seksualnu želju');
ok(topTopics('bol pri odnosu')[0]?.id==='bol-pri-odnosu', 'Upit bol pri odnosu mora voditi na dispareuniju/simptom bola');
ok(topTopics('krvarenje posle odnosa')[0]?.id==='krvarenje-posle-odnosa', 'Upit krvarenje posle odnosa mora voditi na odgovarajuću temu');
ok(topTopics('paraliza sna')[0]?.id==='paraliza-sna', 'Upit paraliza sna mora voditi na paralizu sna');
ok(topTopics('mesecarenje')[0]?.id==='mesecarenje', 'Upit mesecarenje mora voditi na mesečarenje');
ok(topTopics('zubi rastu beba')[0]?.id==='nicanje-zuba-beba', 'Upit zubi rastu beba mora voditi na nicanje zuba');
ok(topTopics('grcevi beba')[0]?.id==='kolike-beba', 'Upit grcevi beba mora voditi na kolike');
ok(topTopics('gojaznost')[0]?.id==='gojaznost', 'Upit gojaznost mora voditi na prekomernu težinu/gojaznost');
ok(topTopics('hladne ruke')[0]?.id==='raynaud', 'Upit hladne ruke mora voditi na Raynaudov fenomen');
ok(topTopics('bol u kuku')[0]?.id==='bol-u-kuku', 'Upit bol u kuku mora voditi na temu bola u kuku');
ok(topTopics('spor puls')[0]?.id==='bradikardija', 'Upit spor puls mora voditi na bradikardiju');
ok(topTopics('osip ispod grudi')[0]?.id==='intertrigo', 'Upit osip ispod grudi mora voditi na intertrigo');
ok(topTopics('ujed zmije','torzija testisa','hipotermija','telo 34 stepena')[0]?.id==='ujed-zmije', 'Upit ujed zmije mora voditi na hitnu temu ujeda zmije');
ok(topTopics('zubni kamenac')[0]?.id==='zubni-kamenac', 'Upit zubni kamenac mora voditi na plak/kamenac');
ok(topTopics('neuralgija trigeminusa')[0]?.id==='trigeminalna-neuralgija', 'Upit neuralgija trigeminusa mora voditi na trigeminalnu neuralgiju');
ok(topTopics('bol ahilova tetiva')[0]?.id==='ahilova-tendinopatija', 'Upit bol ahilova tetiva mora voditi na Ahilovu tendinopatiju');
ok(topTopics('povlacenje desni')[0]?.id==='parodontitis', 'Upit povlacenje desni mora voditi na parodontitis');
ok(topTopics('proliv kod odraslih')[0]?.id==='stomacni-virus', 'Upit proliv kod odraslih mora voditi na proliv/povraćanje');
ok(topTopics('ujed komarca')[0]?.id==='ujedi-insekata', 'Upit ujed komarca mora voditi na ujede insekata');
ok(topTopics('ortostatska hipotenzija')[0]?.id==='nizak-pritisak', 'Upit ortostatska hipotenzija mora voditi na nizak pritisak');
ok(topTopics('bol u zglobu sake')[0]?.id==='bol-rucni-zglob', 'Upit bol u zglobu sake mora voditi na bol ručnog zgloba');
ok(topTopics('bol u clanku')[0]?.id==='bol-clanak', 'Upit bol u clanku mora voditi na bol u članku');
ok(topTopics('dishidroza')[0]?.id==='dishidroza', 'Upit dishidroza mora voditi na pomfoliks');
ok(topTopics('bol u stomaku dete')[0]?.id==='bol-stomak-dete', 'Upit bol u stomaku dete mora voditi na dečji abdominalni bol');
ok(topTopics('bol u preponi')[0]?.id==='bol-u-preponi', 'Upit bol u preponi mora voditi na simptomsku temu prepone');
ok(topTopics('misicna upala')[0]?.id==='uganuca-istegnuca', 'Upit misicna upala mora voditi na istegnuće/uganuće');
ok(topTopics('bol u laktu spolja')[0]?.id==='teniski-lakat', 'Upit bol u laktu spolja mora voditi na teniski lakat');
ok(topTopics('bol u laktu unutra')[0]?.id==='golferski-lakat', 'Upit bol u laktu unutra mora voditi na golferski lakat');
ok(topTopics('ujed pauka')[0]?.id==='ujedi-insekata', 'Upit ujed pauka mora voditi na ujede i ubode');
ok(topTopics('polipi u nosu')[0]?.id==='nosni-polipi', 'Upit polipi u nosu mora voditi na nosne polipe');
ok(topTopics('tonsil stones')[0]?.id==='cepici-krajnika', 'Upit tonsil stones mora voditi na čepiće krajnika');
ok(topTopics('svrab anusa')[0]?.id==='analni-svrab', 'Upit svrab anusa mora voditi na analni svrab');
ok(topTopics('nokturija')[0]?.id==='nokturija', 'Upit nokturija mora voditi na noćno mokrenje');
ok(topTopics('prerana ejakulacija')[0]?.id==='prerana-ejakulacija', 'Upit prerana ejakulacija mora voditi na odgovarajuću temu');
ok(topTopics('vaginalna suvoca')[0]?.id==='vaginalna-suvoca', 'Upit vaginalna suvoca mora voditi na vaginalnu suvoću');
ok(topTopics('meniskus')[0]?.id==='meniskus-povreda', 'Upit meniskus mora voditi na povredu meniskusa');
ok(topTopics('dehidratacija')[0]?.id==='dehidratacija', 'Upit dehidratacija mora voditi na opštu dehidrataciju');
ok(topTopics('golferski lakat')[0]?.id==='golferski-lakat', 'Upit golferski lakat mora voditi na medijalni epikondilitis');
ok(topTopics('gliste kod odraslih')[0]?.id==='decje-gliste', 'Upit gliste kod odraslih mora voditi na proširenu temu o oksiurama');
ok(topTopics('krvarenje desni')[0]?.id==='gingivitis', 'Upit krvarenje desni mora voditi na gingivitis');
ok(topTopics('kiselina u zelucu')[0]?.id==='refluks', 'Upit kiselina u zelucu mora voditi na refluks');
ok(topTopics('peckanje mokrenje')[0]?.id==='urinarna-infekcija', 'Upit peckanje mokrenje mora voditi na urinarnu infekciju');
ok(topTopics('gljivice stopala')[0]?.id==='atletsko-stopalo', 'Upit gljivice stopala mora voditi na atletsko stopalo');
ok(topTopics('putna mucnina')[0]?.id==='kinetoza', 'Upit putna mucnina mora voditi na kinetozu');
ok(topTopics('rubeola')[0]?.id==='rubeola', 'Upit rubeola mora voditi na rubeolu');
ok(topTopics('sesta bolest')[0]?.id==='roseola', 'Upit sesta bolest mora voditi na rozeolu');
ok(topTopics('osip posle temperature')[0]?.id==='roseola', 'Upit osip posle temperature mora voditi na rozeolu');
ok(topTopics('peta bolest')[0]?.id==='peta-bolest', 'Upit peta bolest mora voditi na parvovirus B19');
ok(topTopics('parvovirus b19')[0]?.id==='peta-bolest', 'Upit parvovirus B19 mora voditi na petu bolest');
ok(topTopics('nocno znojenje')[0]?.id==='nocno-znojenje', 'Upit nocno znojenje mora voditi na noćno znojenje');
ok(topTopics('gubitak kilaze')[0]?.id==='nenamerni-gubitak-tezine', 'Upit gubitak kilaze mora voditi na nenamerni gubitak težine');
ok(topTopics('svrbi me koza svuda')[0]?.id==='generalizovani-svrab', 'Upit svrbi me koza svuda mora voditi na generalizovani svrab');
ok(topTopics('strep grlo')[0]?.id==='tonzilitis', 'Upit strep grlo mora voditi na canonical tonzilitis');
ok(topTopics('prehlada dete')[0]?.id==='prehlada', 'Upit prehlada dete mora voditi na prehladu');
ok(topTopics('grip dete')[0]?.id==='grip', 'Upit grip dete mora voditi na grip');
ok(topTopics('kraste u nosu')[0]?.id==='suva-nosna-sluzokoza', 'Upit kraste u nosu mora voditi na suvu nosnu sluzokožu');
ok(topTopics('iver u prstu')[0]?.id==='iver-u-kozi', 'Upit iver u prstu mora voditi na iver u koži');
ok(index.includes("some(id=>canonicalTopicId(id)===t.id)"), 'Povezane teme/prirodni unosi moraju koristiti canonical topic ID');
ok(topTopics('ne osecam mirise')[0]?.id==='gubitak-mirisa', 'Upit ne osecam mirise mora voditi na gubitak mirisa');
ok(topTopics('pukla bubna opna')[0]?.id==='perforacija-bubne-opne', 'Upit pukla bubna opna mora voditi na perforaciju');
ok(topTopics('otok iza uha')[0]?.id==='mastoiditis', 'Upit otok iza uha mora voditi na mastoiditis');
ok(topTopics('ne vidim daleko')[0]?.id==='kratkovidost', 'Upit ne vidim daleko mora voditi na kratkovidost');
ok(topTopics('mutno na blizinu')[0]?.id==='dalekovidost', 'Upit mutno na blizinu mora voditi na dalekovidost');
ok(topTopics('astigmatizam')[0]?.id==='astigmatizam', 'Upit astigmatizam mora voditi na astigmatizam');
ok(topTopics('daltonizam')[0]?.id==='daltonizam', 'Upit daltonizam mora voditi na poremećaj boja');
ok(topTopics('bcc')[0]?.id==='nemelanomski-rak-koze', 'Upit bcc mora voditi na nemelanomski rak kože');
ok(topTopics('gruba fleka od sunca')[0]?.id==='aktinicna-keratoza', 'Upit gruba fleka od sunca mora voditi na aktiničnu keratozu');
ok(topTopics('bele fleke na kozi')[0]?.id==='vitiligo', 'Upit bele fleke na kozi mora voditi na vitiligo');
ok(topTopics('pileca koza')[0]?.id==='keratoza-pilaris', 'Upit pileca koza mora voditi na keratozu pilaris');
ok(topTopics('cir na zelucu')[0]?.id==='cir-zeluca', 'Upit cir na zelucu mora voditi na peptički ulkus');
ok(topTopics('zute beonjace')[0]?.id==='zutica', 'Upit zute beonjace mora voditi na žuticu');
ok(topTopics('hijatalna hernija')[0]?.id==='hijatalna-hernija', 'Upit hijatalna hernija mora voditi na hijatalnu herniju');
ok(topTopics('preaktivna besika')[0]?.id==='preaktivna-besika', 'Upit preaktivna besika mora voditi na OAB');
ok(topTopics('akutno ostecenje bubrega')[0]?.id==='akutna-bubrezna-povreda', 'Upit akutno ostecenje bubrega mora voditi na AKI');
ok(topTopics('torzija testisa')[0]?.id==='torzija-testisa', 'Upit torzija testisa mora voditi na hitnu temu');
ok(topTopics('los spermogram')[0]?.id==='muska-plodnost', 'Upit los spermogram mora voditi na mušku plodnost');
ok(topTopics('spontani pobacaj')[0]?.id==='pobacaj', 'Upit spontani pobacaj mora voditi na pobačaj');
ok(topTopics('tbc')[0]?.id==='tuberkuloza', 'Upit tbc mora voditi na tuberkulozu');
ok(topTopics('hiv')[0]?.id==='hiv', 'Upit hiv mora voditi na HIV');
ok(topTopics('kruzni osip posle krpelja')[0]?.id==='lajmska-bolest', 'Upit kruzni osip posle krpelja mora voditi na Lajmsku bolest');
ok(topTopics('telo 34 stepena')[0]?.id==='hipotermija', 'Upit telo 34 stepena mora voditi na hipotermiju');
ok(topTopics('visok crp')[0]?.id==='crp-upalni-markeri', 'Upit visok crp mora voditi na upalne markere');
ok(topTopics('leukociti visoki')[0]?.id==='krvna-slika', 'Upit leukociti visoki mora voditi na krvnu sliku');
ok(topTopics('alt visok')[0]?.id==='jetreni-enzimi', 'Upit alt visok mora voditi na jetrene enzime');
ok(topTopics('kreatinin visok')[0]?.id==='bubrezni-parametri', 'Upit kreatinin visok mora voditi na bubrežne parametre');
ok(topTopics('kalijum nizak')[0]?.id==='elektroliti', 'Upit kalijum nizak mora voditi na elektrolite');
ok(topTopics('hba1c visok')[0]?.id==='glukoza-hba1c', 'Upit hba1c visok mora voditi na glukozu/HbA1c');
ok(topTopics('bilirubin visok')[0]?.id==='bilirubin-nalaz', 'Upit bilirubin visok mora voditi na bilirubin nalaz');
ok(topTopics('mrsavljenje bez razloga')[0]?.id==='neobjasnjiv-gubitak-tezine', 'Upit mrsavljenje bez razloga mora voditi na neobjašnjiv gubitak težine');
ok(topTopics('stolica kao katran')[0]?.id==='crna-stolica', 'Upit stolica kao katran mora voditi na crnu stolicu');
ok(topTopics('krvarenje u trudnoci')[0]?.id==='krvarenje-trudnoca', 'Upit krvarenje u trudnoci mora voditi na opštu temu');
ok(topTopics('pukao vodenjak')[0]?.id==='curenje-plodove-vode', 'Upit pukao vodenjak mora voditi na plodovu vodu');
ok(topTopics('kontrakcije pre 37 nedelje')[0]?.id==='prevremeni-porodjaj', 'Upit kontrakcije pre 37 nedelje mora voditi na prevremeni porođaj');
ok(topTopics('pph')[0]?.id==='postporodjajno-krvarenje', 'Upit pph mora voditi na postporođajno krvarenje');
ok(topTopics('zacepljen mlecni kanal')[0]?.id==='zastoj-mleka', 'Upit zacepljen mlecni kanal mora voditi na zastoj mleka');
ok(topTopics('beba bljucka')[0]?.id==='refluks-beba', 'Upit beba bljucka mora voditi na refluks kod bebe');
ok(topTopics('trihomonas')[0]?.id==='trihomonijaza', 'Upit trihomonas mora voditi na trihomonijazu');
ok(topTopics('meningitis')[0]?.id==='meningitis', 'Upit meningitis mora voditi na hitnu temu');
ok(topTopics('encefalitis')[0]?.id==='encefalitis', 'Upit encefalitis mora voditi na hitnu temu');
ok(topTopics('potres mozga')[0]?.id==='povreda-glave-potres', 'Upit potres mozga mora voditi na povredu glave');
ok(topTopics('homa ir visok')[0]?.id==='metabolicki-sindrom', 'Upit homa ir visok mora voditi na metabolički sindrom');
ok(topTopics('kortizol visok')[0]?.id==='cushing', 'Upit kortizol visok mora voditi na Cushing');
ok(topTopics('kortizol nizak')[0]?.id==='addison', 'Upit kortizol nizak mora voditi na Addison');
ok(topTopics('hepatitis a')[0]?.id==='hepatitis-a', 'Upit hepatitis a mora voditi na hepatitis A');
ok(topTopics('norovirus')[0]?.id==='norovirus', 'Upit norovirus mora voditi na norovirus');
ok(topTopics('sepsa')[0]?.id==='sepsa', 'Upit sepsa mora voditi na hitnu temu');
ok(topTopics('rak testisa')[0]?.id==='rak-testisa', 'Upit rak testisa mora voditi na rak testisa');
ok(topTopics('rak pankreasa')[0]?.id==='rak-pankreasa', 'Upit rak pankreasa mora voditi na onkologiju');
ok(topTopics('rak zeluca')[0]?.id==='rak-zeluca', 'Upit rak zeluca mora voditi na onkologiju');
ok(topTopics('rak bubrega')[0]?.id==='rak-bubrega', 'Upit rak bubrega mora voditi na onkologiju');
ok(topTopics('rak besike')[0]?.id==='rak-besike', 'Upit rak besike mora voditi na onkologiju');
ok(topTopics('rak jetre')[0]?.id==='rak-jetre', 'Upit rak jetre mora voditi na rak jetre');
ok(topTopics('leukemija')[0]?.id==='leukemija', 'Upit leukemija mora voditi na leukemiju');
ok(topTopics('limfom')[0]?.id==='limfom', 'Upit limfom mora voditi na limfom');
ok(topTopics('cmv')[0]?.id==='cmv', 'Upit cmv mora voditi na CMV');
ok(topTopics('najgora glavobolja u zivotu')[0]?.id==='subarahnoidalno-krvarenje', 'Thunderclap upit mora voditi na SAH');
ok(topTopics('aneurizma mozga')[0]?.id==='aneurizma-mozga', 'Upit aneurizma mozga mora voditi na aneurizmu');
ok(topTopics('tongue tie')[0]?.id==='tongue-tie', 'Upit tongue tie mora voditi na kratku resicu');
ok(topTopics('pupcana kila beba')[0]?.id==='pupcana-kila', 'Upit pupcana kila beba mora voditi na pupčanu kilu');
ok(topTopics('penicilin alergija')[0]?.id==='alergija-lek', 'Upit penicilin alergija mora voditi na alergiju na lek');
ok(topTopics('alergija na ubod pcele')[0]?.id==='alergija-ubod-insekta', 'Upit alergija na ubod pcele mora voditi na alergiju na ubod');
ok(topTopics('me cfs')[0]?.id==='me-cfs', 'Upit ME CFS mora voditi na ME/CFS');
ok(topTopics('long covid')[0]?.id==='long-covid', 'Upit long covid mora voditi na Long COVID');
ok(topTopics('diskus hernija')[0]?.id==='diskus-hernija', 'Upit diskus hernija mora voditi na diskus herniju');
ok(topTopics('skolioza')[0]?.id==='skolioza', 'Upit skolioza mora voditi na skoliozu');
ok(topTopics('kifoza')[0]?.id==='kifoza', 'Upit kifoza mora voditi na kifozu');
ok(topTopics('spondiloza vrata')[0]?.id==='cervikalna-spondiloza', 'Upit spondiloza vrata mora voditi na cervikalnu spondilozu');
ok(topTopics('krv u stolici')[0]?.id==='krv-u-stolici', 'Upit krv u stolici mora voditi na simptomsku temu, ne na rak');
ok(!topTopics('krv u stolici',3).some(t=>t.category==='Onkologija'), 'Generičan upit krv u stolici ne sme gurati onkologiju u prva 3 rezultata');
ok(topTopics('rak debelog creva')[0]?.id==='rak-debelog-creva', 'Eksplicitan upit rak debelog creva mora voditi na onkološku temu');
ok(topTopics('miokarditis')[0]?.id==='miokarditis', 'Upit miokarditis mora voditi na miokarditis');
ok(topTopics('endokarditis')[0]?.id==='endokarditis', 'Upit endokarditis mora voditi na endokarditis');
ok(topTopics('ileus')[0]?.id==='crevna-opstrukcija', 'Upit ileus mora voditi na crevnu opstrukciju');
ok(topTopics('pilonidalna cista')[0]?.id==='pilonidalni-sinus', 'Upit pilonidalna cista mora voditi na pilonidalni sinus');
ok(topTopics('mpox')[0]?.id==='mpox', 'Upit mpox mora voditi na mpox');
ok(topTopics('tetanus')[0]?.id==='tetanus', 'Upit tetanus mora voditi na tetanus');
ok(topTopics('besnilo')[0]?.id==='besnilo', 'Upit besnilo mora voditi na procenu besnila');
ok(topTopics('giardija')[0]?.id==='giardijaza', 'Upit giardija mora voditi na giardijazu');
ok(topTopics('hijatalna kila')[0]?.id==='hijatalna-kila', 'Upit hijatalna kila mora voditi na hijatalnu kilu');
ok(topTopics('hemohromatoza')[0]?.id==='hemohromatoza', 'Upit hemohromatoza mora voditi na hemohromatozu');
ok(topTopics('psorijaticni artritis')[0]?.id==='psorijaticni-artritis', 'Upit psorijaticni artritis mora voditi na psorijatični artritis');
ok(topTopics('polimialgija reumatika')[0]?.id==='polimialgija-reumatika', 'Upit PMR mora voditi na polimialgiju');
ok(topTopics('temporalni arteritis')[0]?.id==='temporalni-arteritis', 'Upit temporalni arteritis mora voditi na GCA');
ok(topTopics('sjogren')[0]?.id==='sjogren', 'Upit sjogren mora voditi na Sjögrenov sindrom');
ok(topTopics('bartolinova cista')[0]?.id==='bartolinova-cista', 'Upit Bartolinova cista mora voditi na odgovarajuću temu');
ok(topTopics('uretritis')[0]?.id==='uretritis', 'Upit uretritis mora voditi na uretritis');
ok(topTopics('lenjo oko')[0]?.id==='ambliopija', 'Upit lenjo oko mora voditi na ambliopiju');
ok(topTopics('dijabeticka retinopatija')[0]?.id==='dijabeticka-retinopatija', 'Upit dijabeticka retinopatija mora voditi na retinopatiju');
ok(topTopics('razrokost')[0]?.id==='strabizam', 'Upit razrokost mora voditi na strabizam');
ok(topTopics('holesteatom')[0]?.id==='holesteatom', 'Upit holesteatom mora voditi na holesteatom');
ok(topTopics('kamen u pljuvacnoj zlezdi')[0]?.id==='kamen-pljuvacna-zlezda', 'Upit kamen u pljuvacnoj zlezdi mora voditi na sialolitijazu');
ok(topTopics('ginekomastija')[0]?.id==='ginekomastija', 'Upit ginekomastija mora voditi na ginekomastiju');
ok(topTopics('uveitis')[0]?.id==='uveitis', 'Upit uveitis mora voditi na uveitis');
ok(topTopics('narkolepsija')[0]?.id==='narkolepsija', 'Upit narkolepsija mora voditi na narkolepsiju');
ok(topTopics('fibroadenom')[0]?.id==='fibroadenom', 'Upit fibroadenom mora voditi na fibroadenom');
ok(topTopics('lichen sclerosus')[0]?.id==='lichen-sclerosus', 'Upit lichen sclerosus mora voditi na odgovarajuću temu');
ok(topTopics('okluzija vene mreznjace')[0]?.id==='okluzija-vene-mreznjace', 'Upit okluzija vene mrežnjače mora voditi na odgovarajuću temu');
ok(topTopics('otoskleroza')[0]?.id==='otoskleroza', 'Upit otoskleroza mora voditi na otosklerozu');
ok(topTopics('invaginacija creva')[0]?.id==='invaginacija-creva', 'Upit invaginacija creva mora voditi na pedijatrijsku temu');
ok(topTopics('nespusten testis')[0]?.id==='nespusten-testis', 'Upit nespusten testis mora voditi na kriptorhizam');
ok(topTopics('adhd')[0]?.id==='adhd', 'Upit ADHD mora voditi na ADHD');
ok(topTopics('autizam')[0]?.id==='autizam', 'Upit autizam mora voditi na autizam');
ok(topTopics('hiperparatireoidizam')[0]?.id==='hiperparatireoidizam', 'Upit hiperparatireoidizam mora voditi na paratireoidnu temu');
ok(topTopics('paget kosti')[0]?.id==='paget-kosti', 'Upit paget kosti mora voditi na Pagetovu bolest kostiju');
ok(topTopics('postnatalna depresija')[0]?.id==='postporodjajna-depresija', 'Upit postnatalna depresija mora voditi na postojeću postporođajnu depresiju');
ok(topTopics('bipolarni poremecaj')[0]?.id==='bipolarni-poremecaj', 'Upit bipolarni poremecaj mora voditi na bipolarni poremećaj');
ok(topTopics('shizofrenija')[0]?.id==='shizofrenija', 'Upit shizofrenija mora voditi na shizofreniju');
ok(topTopics('psihoza')[0]?.id==='psihoza', 'Upit psihoza mora voditi na psihozu');
ok(topTopics('poremecaj ishrane')[0]?.id==='poremecaji-ishrane', 'Upit poremecaj ishrane mora voditi na temu poremećaja ishrane');
ok(topTopics('hipoparatireoidizam')[0]?.id==='hipoparatireoidizam', 'Upit hipoparatireoidizam mora voditi na odgovarajuću temu');
ok(topTopics('hepatitis e')[0]?.id==='hepatitis-e', 'Upit hepatitis e mora voditi na hepatitis E');
ok(topTopics('wilsonova bolest')[0]?.id==='wilsonova-bolest', 'Upit Wilsonova bolest mora voditi na Wilsonovu bolest');
ok(topTopics('osteomalacija')[0]?.id==='osteomalacija', 'Upit osteomalacija mora voditi na osteomalaciju');
ok(topTopics('mycoplasma genitalium')[0]?.id==='mycoplasma-genitalium', 'Upit Mycoplasma genitalium mora voditi na Mgen');
ok(topTopics('pityriasis rosea')[0]?.id==='pityriasis-rosea', 'Upit pityriasis rosea mora voditi na odgovarajući osip');
ok(topTopics('hipospadija')[0]?.id==='hipospadija', 'Upit hipospadija mora voditi na hipospadiju');
ok(topTopics('galaktoreja')[0]?.id==='galaktoreja', 'Upit galaktoreja mora voditi na galaktoreju');
ok(topTopics('torzija jajnika')[0]?.id==='torzija-jajnika', 'Upit torzija jajnika mora voditi na hitnu temu');
ok(topTopics('stenice')[0]?.id==='stenice', 'Upit stenice mora voditi na ujede stenica');
ok(topTopics('ujed buve')[0]?.id==='ujedi-insekata', 'Upit ujed buve mora voditi na postojeću temu ujeda insekata');
ok(topTopics('glomerulonefritis')[0]?.id==='glomerulonefritis', 'Upit glomerulonefritis mora voditi na glomerulonefritis');
ok(topTopics('hemofilija')[0]?.id==='hemofilija', 'Upit hemofilija mora voditi na hemofiliju');
ok(topTopics('von willebrand')[0]?.id==='von-willebrand', 'Upit von Willebrand mora voditi na odgovarajući poremećaj');
ok(topTopics('talasemija')[0]?.id==='talasemija', 'Upit talasemija mora voditi na talasemiju');
ok(topTopics('srpasta anemija')[0]?.id==='srpasta-anemija', 'Upit srpasta anemija mora voditi na srpastu bolest');
ok(topTopics('gastropareza')[0]?.id==='gastropareza', 'Upit gastropareza mora voditi na gastroparezu');
ok(topTopics('ahalazija')[0]?.id==='ahalazija', 'Upit ahalazija mora voditi na ahalaziju');
ok(topTopics('keratitis')[0]?.id==='mikrobni-keratitis', 'Upit keratitis mora voditi na mikrobni keratitis');
ok(topTopics('barrettov jednjak')[0]?.id==='barrett-jednjak', 'Upit Barrettov jednjak mora voditi na Barrettovu temu');
ok(topTopics('fekalna inkontinencija')[0]?.id==='fekalna-inkontinencija', 'Upit fekalna inkontinencija mora voditi na odgovarajuću temu');
ok(topTopics('analna fistula')[0]?.id==='analna-fistula', 'Upit analna fistula mora voditi na analnu fistulu');
ok(topTopics('perianalni apsces')[0]?.id==='perianalni-apsces', 'Upit perianalni apsces mora voditi na perianalni apsces');
ok(topTopics('rektalni prolaps')[0]?.id==='rektalni-prolaps', 'Upit rektalni prolaps mora voditi na rektalni prolaps');
ok(topTopics('mikroskopski kolitis')[0]?.id==='mikroskopski-kolitis', 'Upit mikroskopski kolitis mora voditi na mikroskopski kolitis');
ok(topTopics('gilbertov sindrom')[0]?.id==='gilbertov-sindrom', 'Upit Gilbertov sindrom mora voditi na Gilbert');
ok(topTopics('policisticni bubrezi')[0]?.id==='policisticna-bolest-bubrega', 'Upit policisticni bubrezi mora voditi na ADPKD');
ok(['divertikulitis'].includes(topTopics('divertikuloza')[0]?.id), 'Upit divertikuloza mora voditi na postojeću divertikularnu bolest');
for (const hiddenId of Object.keys(topicDuplicateOf)) {
  ok(!topTopics(topics.find(t=>t.id===hiddenId)?.title||hiddenId, 10).some(t=>t.id===hiddenId), 'Skrivena duplicate tema ne sme se vratiti u rezultate: '+hiddenId);
}
ok(index.includes("if(isConversationalQuery(state.q)&&topics.length&&!intent.natural&&!intent.med)return openTopicResults(state.q)"), 'Nedostaje zaštita za duge/nejasne razgovorne upite');
ok(index.includes("$$('[data-show-naturals]').forEach"), 'Globalni handler za Prirodno mora koristiti querySelectorAll');
ok(index.includes("$$('[data-show-all]').forEach"), 'Globalni handler za povezane teme mora koristiti querySelectorAll');
ok(index.includes("$$('[data-show-meds]').forEach"), 'Globalni handler za Lekove mora koristiti querySelectorAll');
ok(index.includes("vidarRecentSearches"), 'Nedostaje lokalna istorija pretrage');
ok(index.includes("clearRecentSearches"), 'Nedostaje kontrola za brisanje poslednjih pretraga');
ok(index.includes("Antibiotici su odvojeni od ostalih preparata."), 'Antibiotici nisu jasno odvojeni u povezanim preparatima');
ok(index.includes("function urgentSearchBanner"), 'Nedostaje urgent safety banner u pretrazi');
ok(index.includes("tel:194") && index.includes("tel:112"), 'Urgent safety nema 194/112 pozive');
ok(index.includes("mozdani-udar-tia") && index.includes("naglo-gubljenje-vida") && index.includes("bol-u-grudima"), 'Nedostaju ključne urgent teme u detekciji');
ok(index.includes("function topicEmergencyBanner"), 'Nedostaje urgent upozorenje na detalju teme');
const urgentRules=[
  /\b(bol|stezanje|pritisak|pece|pecenje)\b.{0,18}\bgrud(ima|i)?\b|\bgrud(ima|i)?\b.{0,18}\b(bol|stezanje|pritisak)\b/,
  /\b(mozdani udar|slog|tia|mini stroke)\b|\b(slabost|utrnulost)\b.{0,22}\b(lic\w*|ruk\w*|nog\w*|jedn\w* stran\w*)\b|\b(lic\w*|ruk\w*|nog\w*)\b.{0,22}\b(slabost|utrnulost)\b|\b(problem|tesko|ne mogu)\b.{0,18}\b(govor\w*|da govorim)\b|\b(slabost|utrnulost)\b.{0,35}\b(govor\w*)\b/,
  /\b(ne vidim|gubitak vida|crna zavesa|naglo zamagljenje|naglo izgubio vid|naglo izgubila vid)\b|\bizgubi\w*\b.{0,14}\bvid\b/,
  /\b(gusim se|tesko disem|otezano disanje|jedva disem)\b|\bne (mogu|moze|mozes|mozemo) da dis\w*\b|\bpresta\w*.{0,12}\bdis\w*\b|\bne dis(?:e|em)\b(?!\s+na\s+nos)/,
  /\b(otok|oticanje)\b.{0,14}\b(usana|jezika|grla)\b|\banafilaks/i,
  /\b(iznenadan|nagao|jak|veoma jak)\b.{0,18}\bbol\b.{0,12}\btestis(u|a|ima)?\b|\btestis\b.{0,12}\b(iznenadan|nagao|jak)\b/,
  /\btrudn\w*\b.{0,34}\b(krvarenje|krvarim|krvari|jak bol|bol sa jedne strane|bol u ramenu)\b|\b(krvarenje|krvarim|krvari|jak bol)\b.{0,28}\btrudn\w*\b/,
  /\b(bez svesti|ne reaguje|kolaps|onesvestio se|onesvestila se)\b/,
  /\b(jako|obilno|nekontrolisano)\b.{0,14}\bkrvar\w*\b|\bkrvar\w*\b.{0,18}\b(ne prestaje|ne staje)\b/,
  /\b(predozir\w*|overdose|trovanje|otrova\w*)\b|\b(popio|popila|uzeo|uzela)\b.{0,20}\b(previse|mnogo)\b.{0,14}\b(lekova|tableta)\b/,
  /\b(napad|grcevi|konvulzij\w*)\b.{0,24}\b(5 minuta|pet minuta|duze od 5|ne prestaj\w*|ne staj\w*)\b/,
  /\b(toplotni udar|heatstroke)\b|\b(suncanica|pregreja\w*|pregrevanj\w*)\b.{0,28}\b(konfuz\w*|ne reaguje|bez svesti|onesvest\w*|napad|grcevi)\b/,
  /\b(hemijska|hemijska opekotina|elektricna|elektricna opekotina)\b.{0,18}\bopek\w*\b|\bopek\w*\b.{0,18}\b(hemij\w*|elektric\w*)\b/,
  /\b(ujed|ugriz)\b.{0,10}\bzmij\w*\b|\bzmij\w*\b.{0,10}\b(ujed|ugriz)\b|\bsnake ?bite\b/,
  /\b(ne mogu|ne moze)\b.{0,10}\bda mokr\w*\b.{0,28}\b(jak bol|bol u donjem stomaku|puna besika|napeta besika)\b|\b(puna|napeta) besika\b.{0,28}\b(ne mogu|ne moze)\b.{0,10}\bmokr\w*\b/,
  /\b(mnogo|obilno|puno)\b.{0,18}\bkrv\w*\b.{0,22}\b(iskaslj\w*|kaslj\w*)\b|\b(iskaslj\w*|kaslj\w*)\b.{0,22}\b(mnogo|obilno|puno)\b.{0,18}\bkrv\w*\b|\b(krv\w*|krvi)\b.{0,24}\b(iskaslj\w*|kaslj\w*)\b.{0,30}\b(tesko dis\w*|otezano dis\w*|bol u grud\w*)\b/,
  /\b(torzija testisa|testicular torsion|uvrnut testis|uvrnuo se testis)\b/,
  /\b(torzija jajnika|ovarian torsion|adnexal torsion|uvrnut jajnik|uvrnuo se jajnik)\b/,
  /\b(hipotermija|hypothermia|telo 3[0-4](?:[.,]\d+)? stepen\w*|temperatura tela 3[0-4](?:[.,]\d+)?)\b/,
  /\b(sepsa|sepsis|septicki sok|septicki šok)\b/,
  /\b(meningitis)\b/,
  /\b(encefalitis|encephalitis)\b/,
  /\b(postporodjajno krvarenje|postporodajno krvarenje|postpartum haemorrhage|postpartum hemorrhage|pph)\b/
];
const urgentPositiveQueries=[
  'bol u grudima','stezanje u grudima','slabost ruke i problem sa govorom',
  'utrnula mi je ruka i tesko govorim','slabost jedne strane tela',
  'ne vidim na jedno oko','izgubio sam vid na jedno oko','gusim se','ne moze da dise','prestao je da dise','otok jezika','iznenadan jak bol u testisu',
  'trudna sam i krvarim','torzija jajnika','bez svesti','obilno krvarenje ne prestaje','predozirao se','popio previse lekova','napad traje 5 minuta','grcevi ne prestaju','toplotni udar','suncanica i konfuzija','hemijska opekotina','elektricna opekotina','ujed zmije','zmijski ugriz','ne mogu da mokrim puna besika jak bol','iskasljavam mnogo krvi','krv u ispljuvku kasljem tesko disem'
];
const urgentNegativeQueries=[
  'bol u dojkama','gorusica','sinusi','tesko spavam','boli me grlo',
  'visok pritisak','migrena','erektilna disfunkcija','krvarenje iz nosa','napad panike','ne disem na nos','suncanica','opekotina od sunca','elektricni bol u ruci','krv u ispljuvku','tesko mokrim','nocno mokrenje'
];
for(const q of urgentPositiveQueries) ok(urgentRules.some(re=>re.test(norm(q))), 'Urgent upit nije prepoznat: '+q);
for(const q of urgentNegativeQueries) ok(!urgentRules.some(re=>re.test(norm(q))), 'Lažni urgent alarm za običan upit: '+q);
ok(index.includes("const routeRaw=") && index.includes("const routeParams=") && index.includes("const queryRoute="), 'Nedostaju URL query helperi');
ok(index.includes("queryRoute('topics'") && index.includes("queryRoute('lekovi'") && index.includes("queryRoute('prirodno'"), 'Pretrage se ne upisuju u URL');
ok(index.includes("params.get('q')"), 'Render ne obnavlja pretragu iz URL-a');
ok(index.includes("data-copy-search") && index.includes("navigator.clipboard.writeText(url)"), 'Nedostaje kopiranje linka pretrage');
ok(index.includes("function appStatusCard") && index.includes("connection-pill"), 'Nedostaje status baze i mreže u Podešavanjima');
ok(index.includes("window.addEventListener('offline'") && index.includes("window.addEventListener('online'"), 'Nedostaje online/offline status');
ok(index.includes("searchShareButton(state.q)") && index.includes("searchShareButton(state.natQ)") && index.includes("searchShareButton(state.medQ)"), 'Link pretrage nije dostupan u sva tri kataloga');
ok(sw.includes('/data/topics.json') && sw.includes('/data/meds.json') && sw.includes('/data/naturals.json'), 'Service worker ne kešira sve tri baze podataka za offline rad');
ok(index.includes('<link rel="apple-touch-icon" href="./assets/icon.svg">'), 'Apple touch icon pokazuje na nepostojeći fajl');
for (const t of topics) {
  ok(typeof t.intro === 'string' && t.intro.trim().length > 0, 'Tema '+t.id+' nema uvod');
  ok(typeof t.evidence === 'string' && t.evidence.trim().length > 0, 'Tema '+t.id+' nema medicinski pregled/evidence');
  ok(Array.isArray(t.sources) && t.sources.length > 0, 'Tema '+t.id+' nema izvor');
  ok(Array.isArray(t.symptoms) && t.symptoms.length > 0, 'Tema '+t.id+' nema simptome');
  ok(Array.isArray(t.doctor) && t.doctor.length > 0, 'Tema '+t.id+' nema kada kod zdravstvenog radnika');
  ok(Array.isArray(t.urgent) && t.urgent.length > 0, 'Tema '+t.id+' nema hitne znake');
}
ok(index.includes('function topicById') && index.includes('function canonicalTopicIds'), 'Nedostaje canonical topic helper za legacy rute i lokalno stanje');
ok(index.includes('topicSearchAliases(t)') && index.includes('TOPIC_LEGACY_ALIASES'), 'Legacy nazivi nisu uključeni u pretragu canonical tema');
ok(index.includes('canonicalTopicIds(MED_TOPIC_LINKS[m.id]||[])'), 'Lekovi ne canonicalizuju duplicate topic veze');
ok(index.includes('some(id=>canonicalTopicId(id)===t.id)'), 'Canonical tema ne prepoznaje lekove vezane za legacy duplicate ID');
ok(index.includes("pool.filter(m=>(MED_TOPIC_LINKS[m.id]||[]).some(id=>canonicalTopicId(id)===anchor.id))"), 'Rankiranje lekova mora canonicalizovati topic veze');
ok(index.includes("let t=topicById(r.split('/')[1])"), 'Legacy /tema ruta se ne preusmerava logički na canonical temu');
ok(index.includes('function relatedTopicsForTopicBlock'), 'Nedostaje blok povezanih zdravstvenih tema');
ok(index.includes("catalogTopics().slice(0,6)"), 'Početna mora koristiti canonical katalog bez skrivenih duplikata');
ok(index.includes("new Set(catalogTopics().map(x=>x.category))"), 'Filter kategorija mora koristiti canonical katalog');
ok(index.includes("${catalogTopics().length}</b><span>jedinstvenih tema"), 'Brojač na početnoj mora prikazivati jedinstvene teme');
ok(index.includes("function trendCard(tr){let t=topicById(tr.topicId)"), 'Radar mora canonicalizovati legacy topic ID');
ok(index.includes('v6.13 MOBILE HOME') && index.includes('order:1!important') && index.includes('height:205px!important'), 'Nedostaje završni mobilni content-first hero override');
ok(index.includes('padding-bottom:calc(88px + env(safe-area-inset-bottom))!important'), 'Mobilni sadržaj nema dovoljan razmak iznad donje navigacije');
ok(index.includes('RELATED_CATEGORY_FAMILIES'), 'Nedostaje ograničenje povezanih tema po oblastima');
for (const n of naturals) {
  ok((Array.isArray(n.topics) && n.topics.length > 0) || n.standalone === true, 'Prirodni unos '+n.id+' mora imati povezanu temu ili standalone=true');
}
ok(!index.includes("kamen-u-zuci','Glavobolja"), 'Nevažeći hardkodovani odnos Glavobolja → Kamen u žuči');

console.log('VIDAR validation OK');
console.log(JSON.stringify({
  version: version.version,
  topics: topics.length,
  meds: meds.length,
  naturals: naturals.length,
  medLinks: Object.keys(medLinks).length,
  searchRegression: 'OK',
  fullCatalogSearchCoverage
}, null, 2));
