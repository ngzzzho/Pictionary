import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
export function applyLanguageReview(input) {
  const policy = read('scripts/content-language-review.json');
  const bytes = fs.readFileSync('scripts/content-language-baseline.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), policy.inputSHA256);
  const baseline = JSON.parse(bytes);
  // Apply only to the reviewed edition, or return its exact idempotent output.
  const out = structuredClone(baseline);
  const byId = new Map(out.words.map(w => [w.id,w]));
  for (const [id, entry] of Object.entries(policy.entries)) {
    const word = byId.get(id);
    assert.ok(word && word.review !== 'held' && !policy.held[id]);
    assert.equal(word.en, entry.source.en); assert.equal(word.zh, entry.source.zh);
    for (const [code, source] of Object.entries(entry.source)) {
      assert.equal(read(`js/locales/${code}.json`).words[id], source);
      assert.ok(typeof entry.labels[code] === 'string' && entry.labels[code].trim() && entry.labels[code].length <= 120);
    }
    word.en = entry.labels.en; word.zh = entry.labels.zh;
    word.labelRevision = policy.revision;
  }
  for (const id of Object.keys(policy.held)) {
    const word = byId.get(id); assert.ok(word && word.review !== 'held');
    word.review = 'held';
  }
  out.edition = 9; out.selectionPolicy = policy.revision;
  for (const collection of Object.values(out.collections))
    collection.wordIds = collection.wordIds.filter(id => !policy.held[id]);
  if (input.edition === out.edition) assert.deepEqual(input,out);
  else assert.deepEqual(input,baseline);
  const expected = {[policy.revision]:Object.fromEntries(Object.entries(policy.entries).map(([id,e])=>[id,e.labels]))};
  assert.deepEqual(read('js/word-label-revisions.json'),expected);
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = applyLanguageReview(read('js/content.json'));
  fs.writeFileSync('js/content.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({edition:result.edition,active:result.words.filter(w=>w.review!=='held').length,held:result.words.filter(w=>w.review==='held').length}));
}
