import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const topics = read('data/topics.json').topics;
const meds = read('data/meds.json');
const naturals = read('data/naturals.json');

const errors = [];
const warnings = [];
const ok = (condition, message) => { if (!condition) errors.push(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const httpsUrl = value => {
  if (!nonempty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && nonempty(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
};
const requiredText = (item, key, context) => ok(nonempty(item[key]), `${context}: missing ${key}`);
const requiredArray = (item, key, context, allowEmpty = false) =>
  ok(Array.isArray(item[key]) && (allowEmpty || item[key].length > 0), `${context}: missing/empty ${key}`);

function checkIds(group, entries) {
  ok(Array.isArray(entries) && entries.length > 0, `${group}: empty collection`);
  const seen = new Set();
  for (const entry of entries) {
    const label = `${group}/${entry.id ?? '?'}`;
    ok(nonempty(entry.id), `${label}: missing id`);
    if (!nonempty(entry.id)) continue;
    ok(!seen.has(entry.id), `${label}: duplicate id`);
    seen.add(entry.id);
    if (entry.id !== entry.id.normalize('NFC') || !/^[a-z0-9-]+$/.test(entry.id)) {
      warnings.push(`${label}: non-standard ID, do not rename without checking existing saved links`);
    }
    ok(Array.isArray(entry.aliases), `${label}: missing aliases array`);
    for (const alias of entry.aliases || []) ok(nonempty(alias), `${label}: empty alias`);
  }
}
checkIds('topics', topics);
checkIds('meds', meds);
checkIds('naturals', naturals);

const topicIds = new Set(topics.map(item => item.id));
let sourceCount = 0;
let duplicateSources = 0;
for (const item of topics) {
  const label = `topics/${item.id}`;
  for (const key of ['title', 'category', 'intro', 'evidence']) requiredText(item, key, label);
  for (const key of ['symptoms', 'selfCare', 'doctor', 'urgent', 'sources']) requiredArray(item, key, label);
  for (const key of ['trends', 'social', 'natural']) requiredArray(item, key, label, true);

  const sourceUrls = new Set();
  for (const source of item.sources || []) {
    sourceCount++;
    ok(nonempty(source.name), `${label}: source missing name`);
    ok(httpsUrl(source.url), `${label}: invalid source HTTPS URL ${String(source.url)}`);
    if (sourceUrls.has(source.url)) {
      duplicateSources++;
      warnings.push(`${label}: repeated source ${source.url}`);
    }
    sourceUrls.add(source.url);
  }
  for (const trend of item.trends || []) {
    for (const key of ['href', 'evidenceHref']) {
      if (trend[key] != null && trend[key] !== '') {
        ok(httpsUrl(trend[key]), `${label}: invalid trend ${key}`);
      }
    }
  }
}
for (const item of meds) {
  const label = `meds/${item.id}`;
  for (const key of ['name', 'active', 'group', 'about']) requiredText(item, key, label);
  for (const key of ['important', 'check']) {
    requiredArray(item, key, label);
    for (const warning of item[key] || []) ok(nonempty(warning), `${label}: empty ${key} entry`);
  }
}
const statuses = new Set(['supported', 'limited', 'none', 'avoid']);
let missingEvidenceLinks = 0;
for (const item of naturals) {
  const label = `naturals/${item.id}`;
  for (const key of ['name', 'group', 'claim', 'status', 'evidence', 'safety']) requiredText(item, key, label);
  ok(statuses.has(item.status), `${label}: unknown evidence status`);
  requiredArray(item, 'platforms', label);
  requiredArray(item, 'topics', label, true);
  for (const id of item.topics || []) ok(topicIds.has(id), `${label}: dangling topic id ${id}`);
  if (item.evidenceHref) {
    ok(httpsUrl(item.evidenceHref), `${label}: invalid evidenceHref`);
  } else {
    missingEvidenceLinks++;
  }
}

const report = {
  topics: topics.length,
  meds: meds.length,
  naturals: naturals.length,
  topicSourceLinks: sourceCount,
  duplicateTopicSources: duplicateSources,
  naturalsWithoutDirectEvidenceURL: missingEvidenceLinks,
  errors: errors.length,
  warnings: warnings.length
};
console.log('VIDAR medical content integrity audit');
console.log(JSON.stringify(report, null, 2));
if (warnings.length) {
  console.warn('Editorial warnings (non-blocking):');
  warnings.slice(0, 20).forEach(message => console.warn(' - ' + message));
  if (warnings.length > 20) console.warn(` ... and ${warnings.length - 20} more`);
}
if (errors.length) {
  errors.slice(0, 60).forEach(message => console.error('ERROR: ' + message));
  if (errors.length > 60) console.error(`... and ${errors.length - 60} more`);
  process.exitCode = 1;
}
