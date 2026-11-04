import test from 'node:test';import assert from 'node:assert/strict';import * as G from '../js/core.mjs';import {defaults,validProfile} from '../js/profile.mjs';
const roster=Array.from({length:4},(_,i)=>({id:String(i),name:'P'+i,team:i%2}));const words=Array.from({length:20},(_,i)=>({id:String(i),en:'W'+i,zh:'詞'+i}));
const create=rule=>G.newGame(roster,{...defaults,mode:'teams',...(rule?{teamGuessing:rule}:{})},words,1000);
test('team guessing rule controls eligibility, scoring, undo and corrections',()=>{
 for(const rule of ['own','open',undefined]){const g=create(rule);G.reveal(g);G.start(g,1000);
 assert.deepEqual(G.eligible(g).map(p=>p.id),rule==='own'?['2']:['1','2','3']);
 assert.equal(G.end(g,'correct','1',1500),rule!=='own');
 if(rule==='own')G.end(g,'correct','2',1500);
 assert.deepEqual(g.teamScores,rule==='own'?[1,0]:[0,1]);
 assert.equal(G.correctResult(g,'3'),rule!=='own');assert.equal(G.validGame(G.snapshot(g)),true);
 G.undo(g);assert.deepEqual(g.teamScores,[0,0]);assert.equal(g.history.length,0);
 }
});
test('optional rule preserves legacy profiles and snapshots but rejects invalid values',()=>{
 for(const rule of [undefined,'own','open','bad',false]){const settings={...defaults,...(rule===undefined?{}:{teamGuessing:rule})};
 assert.equal(validProfile({version:1,language:'en',muted:true,players:roster,custom:[],settings}),[undefined,'own','open'].includes(rule));
 const g=create('open');g.settings.teamGuessing=rule;assert.equal(G.validGame(g),[undefined,'own','open'].includes(rule));}
 const g=create('own');const before=G.snapshot(g);const changed={...g.settings,teamGuessing:'open'};assert.equal(before.settings.teamGuessing,'own');assert.equal(changed.teamGuessing,'open');
});
