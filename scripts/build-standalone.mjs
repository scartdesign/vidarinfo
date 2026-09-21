import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const index = read('index.html');
const db = JSON.parse(read('data/topics.json'));
const meds = JSON.parse(read('data/meds.json'));
const naturals = JSON.parse(read('data/naturals.json'));

let html = index;

const init = 'let DB={topics:[]},MEDS=[],NATURALS=[];';
if (!html.includes(init)) throw new Error('VIDAR runtime init marker nije pronađen');
html = html.replace(
  init,
  'let DB=' + JSON.stringify(db) + ',MEDS=' + JSON.stringify(meds) + ',NATURALS=' + JSON.stringify(naturals) + ';'
);

const loaderStart = html.indexOf('async function __vidarJson(path){');
const bootStart = html.indexOf('async function __vidarBoot(){');
if (loaderStart < 0 || bootStart < 0 || bootStart <= loaderStart) {
  throw new Error('VIDAR loader/boot marker nije pronađen');
}
html = html.slice(0, loaderStart) + html.slice(bootStart);

const dataStart = html.indexOf("const [__db,__meds,__naturals]=await Promise.all([", html.indexOf('async function __vidarBoot(){'));
const dataEndMarker = 'DB=__db;MEDS=__meds;NATURALS=__naturals;';
const dataEnd = html.indexOf(dataEndMarker, dataStart);
if (dataStart < 0 || dataEnd < 0) throw new Error('VIDAR boot data block nije pronađen');
html = html.slice(0, dataStart) + html.slice(dataEnd + dataEndMarker.length);

if (html.includes('__vidarJson(')) throw new Error('Standalone i dalje sadrži poziv na JSON loader');
if (html.includes('fetch(')) throw new Error('Standalone i dalje sadrži fetch');
if (!html.includes('let DB={"topics":[')) throw new Error('Topics baza nije ugrađena');
if (!html.includes(',MEDS=[')) throw new Error('Meds baza nije ugrađena');
if (!html.includes(',NATURALS=[')) throw new Error('Naturals baza nije ugrađena');

fs.writeFileSync(new URL('../standalone.html', import.meta.url), html, 'utf8');
console.log('Standalone VIDAR generated:', {
  topics: db.topics?.length ?? 0,
  meds: meds.length,
  naturals: naturals.length,
  bytes: Buffer.byteLength(html)
});
