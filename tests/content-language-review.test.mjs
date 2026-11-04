import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyLanguageReview} from '../scripts/content-language-review.mjs';
import {cardLines,catalogs} from '../js/localization.mjs';
import {makeDeck,eligibleReplayDeck} from '../js/decks.mjs';
import {freeDeck} from '../js/access.mjs';
import * as G from '../js/core.mjs';
import {defaults} from '../js/profile.mjs';
import {captureBackup,encodeBackup,decodeBackup} from '../js/backup.mjs';
import {publicTVFrame,validTVFrame} from '../js/tv.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const old=read('scripts/content-language-baseline.json'), now=read('js/content.json'), policy=read('scripts/content-language-review.json');
const codes=Object.keys(catalogs), active=now.words.filter(w=>w.review!=='held');
test('edition changes only the explicit 16 label revisions and three held cards; generator is source-bound and idempotent',()=>{
 assert.equal(Object.keys(policy.entries).length,16);assert.equal(Object.keys(policy.held).length,3);
 assert.deepEqual(applyLanguageReview(old),now);assert.deepEqual(applyLanguageReview(now),now);
 const bad=structuredClone(old);bad.words[0].en='changed';assert.throws(()=>applyLanguageReview(bad));
 for(const previous of old.words){const current=now.words.find(w=>w.id===previous.id);const entry=policy.entries[previous.id];
 const expected=entry?{...previous,en:entry.labels.en,zh:entry.labels.zh,labelRevision:policy.revision}:policy.held[previous.id]?{...previous,review:'held'}:previous;
 assert.deepEqual(current,expected);}
 assert.equal(active.length,776);assert.equal(active.filter(w=>w.difficulty==='easy').length,296);
 assert.equal(active.filter(w=>w.difficulty==='medium').length,480);
 assert.deepEqual(freeDeck(now).map(w=>w.id),freeDeck(old).map(w=>w.id));
});
test('all historical labels remain exact in all 18 languages; revised labels remain distinct within each language',()=>{
 for(const code of codes){const seen=new Set();
  for(const w of old.words.filter(w=>w.review!=='held'))assert.deepEqual(cardLines(w,code),[{code,text:catalogs[code].words[w.id],original:false}]);
  for(const w of active){const lines=cardLines(w,code);assert.equal(lines.length,1);assert.equal(lines[0].original,false);const text=lines[0].text.normalize('NFKC').toLocaleLowerCase();assert.ok(!seen.has(text),`${code}:${w.id}:${text}`);seen.add(text);}
 }
 for(const entry of Object.values(policy.entries))assert.deepEqual(Object.keys(entry.labels).sort(),codes.sort());
});
test('regional corrections preserve intent and custom words cannot acquire a built-in translation',()=>{
 const label=(id,code)=>cardLines(now.words.find(w=>w.id===id),code)[0].text;
 assert.equal(label('n:cutting-a-celebration-cake','zh'),'切蛋糕');
 assert.equal(label('n:anteater','zh-TW'),'食蟻獸');
 assert.equal(label('n:wrench','en-GB'),'spanner');assert.equal(label('n:wrench','en-US'),'wrench');
 assert.equal(label('w:occupations:delivery-rider','es-ES'),label('w:occupations:delivery-rider','es-MX'));
 assert.equal(label('n:nesting-dolls','es-MX'),'muñecas rusas');
 for(const marker of [policy.revision,'missing','__proto__',null,{toString:null,valueOf:null},[]])assert.deepEqual(cardLines({id:'custom:mine',en:'My exact word',zh:'',labelRevision:marker},'es-MX'),[{code:'',text:'My exact word',original:true}]);
});
test('new play and replay omit held cards while every topic retains 72 cards for full schedules and swaps',()=>{
 for(const topic of ['mixed',...Object.keys(now.topics)]){
  const settings={...defaults,topic,difficulty:'general'};const deck=makeDeck(now,[],settings);
  assert.ok(deck.length>=72,topic);assert.ok(deck.every(w=>!policy.held[w.id]));
  const replay=eligibleReplayDeck(now,old.words.filter(w=>w.review!=='held'),settings);
  assert.deepEqual(replay,deck);
 }
});
test('old and new games retain words, strokes and custom text across backup roundtrip; TV uses the correct result edition',async()=>{
 const players=[{id:'a',name:'家人甲',team:0},{id:'b',name:'家人乙',team:1}];
 for(const bank of [old,now]){
  const settings={...defaults,mode:'coop',roundsEach:1,cardLanguage:'es-ES+es-MX',surface:'canvas'};
  const words=bank.words.filter(w=>Object.hasOwn(policy.entries,w.id));const g=G.newGame(players,settings,words,1000);G.reveal(g);G.start(g,1000);
  g.strokes=[{color:'#123456',width:7,points:[[.1,.2],[.3,.4]]}];G.end(g,'giveup',null,1200);
  const profile={version:1,language:'zh',muted:true,onboardingSeen:true,players,custom:['保留自訂詞'],settings};
  const raw=new Map([['pp_custom_words','["原來詞庫"]']]);const storage={getItem:k=>raw.get(k)??null};
  const files=await encodeBackup(captureBackup(storage,{profile,game:g,last:null},[]),2048);
  const restored=await decodeBackup(files.map(f=>({size:Buffer.byteLength(f.text),text:async()=>f.text})));
  assert.deepEqual(restored.current.game,G.snapshot(g));assert.deepEqual(restored.current.profile,profile);
  const answer=cardLines(g.word,settings.cardLanguage).map(l=>l.text).join(' · ');
  assert.deepEqual(cardLines(restored.current.game.word,settings.cardLanguage),cardLines(g.word,settings.cardLanguage));
  const args={game:g,visible:true,epoch:1,seq:1,completedAnswer:answer};
  const frame=publicTVFrame(args);assert.ok(validTVFrame(frame));assert.equal(frame.completedAnswer,answer);
  G.next(g);assert.equal(publicTVFrame({...args,game:g,seq:2}).completedAnswer,'');
 }
});

test('held candy cane cannot enter new decks but an existing saved card retains its exact label',()=>{
 const id='w:festivals:candy-cane';
 assert.equal(now.words.find(w=>w.id===id).review,'held');
 assert.ok(!makeDeck(now,[],{...defaults,topic:'food',difficulty:'general'}).some(w=>w.id===id));
 const historical=old.words.find(w=>w.id===id);
 assert.equal(cardLines(historical,'zh')[0].text,'拐杖糖');
 const game=G.newGame([{id:'a',name:'A',team:0},{id:'b',name:'B',team:1}],{...defaults,mode:'coop',roundsEach:1},[historical,...old.words.filter(w=>w.id!==id&&w.review!=='held').slice(0,8)]);
 const saved=G.snapshot(game);assert.ok(G.validGame(saved));assert.deepEqual(saved.deck.find(w=>w.id===id),historical);
});
