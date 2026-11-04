import test from 'node:test';import assert from 'node:assert/strict';
import * as G from '../js/core.mjs';import {defaults} from '../js/profile.mjs';import {publicTVFrame} from '../js/tv.mjs';
test('every outcome keeps completed ink, answer and scores until Continue, including the final round',()=>{
 const players=[{id:'a',name:'A',team:0},{id:'b',name:'B',team:1},{id:'c',name:'C',team:0},{id:'d',name:'D',team:1}];
 const deck=Array.from({length:30},(_,i)=>({id:'x'+i,en:'Answer '+i,zh:'答案'+i}));
 for(const mode of ['coop','individual','teams'])for(const outcome of ['correct','giveup','timeout']){
  const g=G.newGame(mode==='coop'?players.slice(0,2):players,{...defaults,mode,roundsEach:1,surface:'canvas',drawPolicy:'unique'},deck,0);
  const frame=()=>publicTVFrame({game:g,visible:true,epoch:1,seq:1,round:g.turn+1,completedAnswer:g.word?.en||''});
  while(!g.finished){G.reveal(g);G.start(g,1000);g.strokes=[{color:'#123456',width:7,points:[[.2,.3],[.7,.8]]}];
   G.end(g,outcome,G.eligible(g)[0]?.id,outcome==='timeout'?200000:1100);
   assert.equal(g.phase,'result');const expected=frame();assert.equal(expected.phase,'result');assert.equal(expected.completedAnswer,g.word.en);assert.deepEqual(expected.strokes,g.strokes);
   assert.deepEqual(expected.scores,mode==='coop'?[g.successes]:mode==='teams'?g.teamScores:g.players.map(p=>p.score));
   for(let i=0;i<5;i++)assert.deepEqual(frame(),expected);
   G.next(g);const next=frame();assert.equal(next.phase,'waiting');assert.equal(next.completedAnswer,'');assert.deepEqual(next.strokes,[]);
  }
 }
});
