import test from 'node:test';import assert from 'node:assert/strict';
import * as G from '../js/core.mjs';import {defaults} from '../js/profile.mjs';
import {captureBackup,encodeBackup,decodeBackup} from '../js/backup.mjs';
const deck=Array.from({length:100},(_,i)=>({id:'test'+i,en:'Word '+i,zh:'詞'+i}));
const players=(a,b)=>Array.from({length:a+b},(_,i)=>({id:'p'+i,name:'家人'+i,team:i<a?0:1}));
const finish=g=>{while(!g.finished){G.reveal(g);G.start(g,1000);G.end(g,'giveup',null,1100);G.next(g);}return g;};
test('equal team opportunities, no back-to-back team turns, and cumulative personal turns balanced across consecutive games',()=>{
 for(const [a,b] of [[3,2],[2,3],[4,3],[3,4],[5,4],[4,5],[6,5],[5,6],[2,2],[6,6]])for(const roundsEach of [1,2,3]){
  const roster=players(a,b),totals=roster.map(()=>0);let previous=null;
  for(let gameNo=0;gameNo<Math.min(a,b)*2;gameNo++){
   const bytes=JSON.stringify(previous),g=G.newGame(roster,{...defaults,mode:'teams',roundsEach,drawPolicy:'unique'},deck,2000+gameNo,previous);
   assert.equal(JSON.stringify(previous),bytes);assert.ok(G.validGame(g));assert.equal(g.schedule.length,Math.max(a,b)*roundsEach*2);
   const counts=roster.map((_,i)=>g.schedule.filter(n=>n===i).length);
   assert.equal(g.schedule.filter(i=>roster[i].team===0).length,g.schedule.filter(i=>roster[i].team===1).length);
   g.schedule.forEach((i,j)=>{assert.equal(roster[i].team,j%2);totals[i]++;});
   for(const t of [0,1]){const per=counts.filter((_,i)=>roster[i].team===t),sum=totals.filter((_,i)=>roster[i].team===t);assert.ok(Math.max(...per)-Math.min(...per)<=1);assert.ok(Math.max(...sum)-Math.min(...sum)<=1);}
   previous=finish(g);
  }
 }
});
test('only completed turns advance matching team queues; reorder uses stable player IDs, changed teams reset',()=>{
 const roster=players(3,2),settings={...defaults,mode:'teams',roundsEach:1};const prior=G.newGame(roster,settings,deck,1000);
 G.reveal(prior);G.start(prior,1000);G.end(prior,'giveup',null,1100);
 const bytes=JSON.stringify(prior),next=G.scheduleFor(roster,'teams',1,prior);assert.equal(next[0],1);assert.equal(next[1],3);assert.equal(JSON.stringify(prior),bytes);
 const complete=finish(G.newGame(roster,settings,deck));const reordered=[...roster].reverse();const q=G.scheduleFor(reordered,'teams',1,complete);
 assert.equal(reordered[q[1]].id,'p4');
 const changed=roster.map(p=>({...p,id:p.id+'new'}));assert.deepEqual(G.scheduleFor(changed,'teams',1,complete),G.scheduleFor(changed,'teams',1));
 for(const mode of ['coop','individual'])assert.deepEqual(G.scheduleFor(roster,mode,2,complete),G.scheduleFor(roster,mode,2));
});
test('old scheduled games and custom words survive backup without rescheduling',async()=>{
 const roster=players(3,2),settings={...defaults,mode:'teams',roundsEach:3};const game=G.newGame(roster,settings,deck,1000);G.reveal(game);const before=JSON.stringify(game);
 const profile={version:1,language:'zh',muted:true,onboardingSeen:true,players:roster,custom:['原有詞庫'],settings};
 const data=captureBackup({getItem:()=>null},{profile,game,last:null},[]);const parts=await encodeBackup(data);const restored=await decodeBackup(parts.map(p=>({size:Buffer.byteLength(p.text),text:async()=>p.text})));
 assert.deepEqual(restored.current.game.schedule,game.schedule);assert.deepEqual(restored.current.profile,profile);assert.equal(JSON.stringify(game),before);assert.ok(G.validGame(restored.current.game));
});
