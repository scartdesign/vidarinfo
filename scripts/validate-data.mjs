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
ok(topics.length === 270, 'Očekivano 270 tema, pronađeno ' + topics.length);
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
function topicMatchScore(t,q){q=norm(q);if(!q)return 0;let terms=searchTerms(q),title=norm(t.title),aliases=topicSearchAliases(t).map(norm),sym=(t.symptoms||[]).map(norm),intro=norm(t.intro),cat=norm(t.category),score=0,hitSet=new Set(),core=terms.join(' ');if(title===q||title===core)score+=160;if(aliases.some(a=>a===q||a===core))score+=145;let fields=[[title,14],...aliases.map(a=>[a,12]),...sym.map(a=>[a,6]),[cat,4],[intro,2]];for(let [field,w] of fields){let r=textTokenScore(terms,field,w);score+=r.score;if(r.hits)for(let term of terms){if(textTokenScore([term],field,1).hits)hitSet.add(term)}}if(!hitSet.size)return 0;let minHits=terms.length>1?Math.ceil(terms.length*.6):1;if(hitSet.size<minHits)return 0;if(hitSet.size===terms.length)score+=45+terms.length*8;else score-=20*(terms.length-hitSet.size);return Math.max(score,0)}
function anchor(q){let nq=norm(q),terms=searchTerms(nq);if(!terms.length)return null;let core=terms.join(' '),exact=catalogTopics.find(t=>norm(t.title)===nq||norm(t.title)===core||topicSearchAliases(t).some(a=>norm(a)===nq||norm(a)===core));if(exact)return exact;let ranked=catalogTopics.map(t=>[t,topicMatchScore(t,nq)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),top=ranked[0],next=ranked[1];if(!top)return null;let gap=top[1]-(next?next[1]:0),dominant=!next||next[1]<=top[1]*.55;if((terms.length===1&&top[1]>=80&&gap>=30&&dominant)||(terms.length>1&&top[1]>=120&&gap>=45&&dominant))return top[0];return null}

function topTopics(q, limit=6) {
  return catalogTopics.map(t=>[t,topicMatchScore(t,q)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]||a[0].title.localeCompare(b[0].title,'sr')).slice(0,limit).map(x=>x[0]);
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
ok(topTopics('puni su mi sinusi')[0]?.id==='sinusi', 'Razgovorni upit za pune sinuse nije prvi rezultat');
ok(topTopics('boli me grlo')[0]?.id==='grlobolja', 'Razgovorni upit za bol u grlu nije prvi rezultat');
ok(['refluks','gastritis'].includes(topTopics('pece me zeludac')[0]?.id), 'Pečenje u želucu ne daje očekivanu digestivnu temu');
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
ok(index.includes("some(id=>canonicalTopicId(id)===t.id)"), 'Povezane teme/prirodni unosi moraju koristiti canonical topic ID');
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
  /\b(napad|grcevi|konvulzij\w*)\b.{0,24}\b(5 minuta|pet minuta|duze od 5|ne prestaj\w*|ne staj\w*)\b/
];
const urgentPositiveQueries=[
  'bol u grudima','stezanje u grudima','slabost ruke i problem sa govorom',
  'utrnula mi je ruka i tesko govorim','slabost jedne strane tela',
  'ne vidim na jedno oko','izgubio sam vid na jedno oko','gusim se','ne moze da dise','prestao je da dise','otok jezika','iznenadan jak bol u testisu',
  'trudna sam i krvarim','bez svesti','obilno krvarenje ne prestaje','predozirao se','popio previse lekova','napad traje 5 minuta','grcevi ne prestaju'
];
const urgentNegativeQueries=[
  'bol u dojkama','gorusica','sinusi','tesko spavam','boli me grlo',
  'visok pritisak','migrena','erektilna disfunkcija','krvarenje iz nosa','napad panike','ne disem na nos'
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
ok(index.includes("let t=topicById(r.split('/')[1])"), 'Legacy /tema ruta se ne preusmerava logički na canonical temu');
ok(index.includes('function relatedTopicsForTopicBlock'), 'Nedostaje blok povezanih zdravstvenih tema');
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
  searchRegression: 'OK'
}, null, 2));
