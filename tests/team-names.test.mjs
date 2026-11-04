import test from 'node:test';import assert from 'node:assert/strict';
import {cleanTeamName,validTeamNames,displayTeamName} from '../js/team-names.mjs';
import * as G from '../js/core.mjs';import {defaults,validProfile} from '../js/profile.mjs';
import {publicTVFrame,validTVFrame} from '../js/tv.mjs';
const players=Array.from({length:4},(_,i)=>({id:String(i),name:'Private'+i,team:i%2}));
const deck=Array.from({length:20},(_,i)=>({id:String(i),en:'Secret'+i,zh:'秘密'+i}));
test('team names are optional bounded metadata and old games stay valid',()=>{
 const settings={...defaults,mode:'teams'},g=G.newGame(players,settings,deck);
 assert.ok(G.validGame(g));assert.ok(validTeamNames(undefined));
 const schedule=structuredClone(g.schedule);g.settings.teamNames=['火龍隊','Blue & Gold'];
 assert.ok(G.validGame(g));assert.deepEqual(g.schedule,schedule);assert.deepEqual(g.teamScores,[0,0]);
 const snapshot=G.snapshot(g);assert.deepEqual(snapshot.settings.teamNames,g.settings.teamNames);
 const profile={version:1,language:'zh',muted:true,players,custom:['保留'],settings:g.settings};assert.ok(validProfile(profile));
 for(const bad of [null,[],['A'],['A','x'.repeat(21)],['A','\n'],['A',12]]) {assert.equal(validTeamNames(bad),false);assert.equal(G.validGame({...g,settings:{...settings,teamNames:bad}}),false);}
 assert.equal(cleanTeamName('  火\n龍\u202e隊  '),'火龍隊');assert.equal(displayTeamName({teamNames:['','']} ,0,'紅隊'),'紅隊');
});
test('TV only publishes explicit bounded team labels, never player names or secret word',()=>{
 const g=G.newGame(players,{...defaults,mode:'teams',teamNames:['火龍隊','Blue & Gold']},deck);G.reveal(g);G.start(g);
 const f=publicTVFrame({game:g,visible:true,epoch:1,seq:1});assert.ok(validTVFrame(f));assert.deepEqual(f.teamNames,g.settings.teamNames);
 assert.ok(!JSON.stringify(f).includes('Private'));assert.ok(!JSON.stringify(f).includes('Secret'));
 assert.equal(validTVFrame({...f,teamNames:['x'.repeat(21),'B']}),false);assert.equal(validTVFrame({...f,mode:'coop',scores:[0]}),false);
 delete g.settings.teamNames;assert.equal(Object.hasOwn(publicTVFrame({game:g,visible:true,epoch:1,seq:1}),'teamNames'),false);
});
