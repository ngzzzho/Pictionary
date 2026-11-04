const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE); const assert=require('node:assert/strict');
(async()=>{const G=await import('../js/core.mjs');let cases=0;
const players=[0,1,2,3].map(i=>({id:'p'+i,name:'Player '+i,team:i%2}));
const settings={mode:'teams',surface:'canvas',topic:'mixed',difficulty:'general',cardLanguage:'en',seconds:60,roundsEach:1,drawPolicy:'unique'};
const words=Array.from({length:12},(_,i)=>({id:'test'+i,en:'Test '+i,zh:'測試'+i}));
for(const engine of ['chromium','webkit']){const browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});try{
for(const viewport of [{width:390,height:844},{width:1024,height:768},{width:844,height:390}]){
 const g=G.newGame(players,settings,words);G.reveal(g);
 const c=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(({g,players,settings})=>{if(!localStorage.sg_v1_profile){localStorage.sg_v1_profile=JSON.stringify({version:1,language:'en',muted:true,onboardingSeen:true,players,custom:[],settings});localStorage.sg_v1_game=JSON.stringify(g)}},{g:G.snapshot(g),players,settings});
 await p.addInitScript(()=>{const staged=sessionStorage.getItem('test-stage');if(staged){const {key,g}=JSON.parse(staged);localStorage.setItem(key,JSON.stringify(g));localStorage.removeItem('sg_v1_timer_checkpoint');sessionStorage.removeItem('test-stage')}});
 await p.goto(process.env.TEST_URL);await p.locator('[data-action="resume-game"]').click();if(await p.locator('[data-action="uncover"]').count())await p.locator('[data-action="uncover"]').click();
 const first=await p.locator('.secret-ticket').innerText();await p.locator('[data-action="swap"]').click();await p.locator('[data-action="return-original"]').click();assert.equal(await p.locator('.secret-ticket').innerText(),first);
 await p.locator('[data-action="draw"]').click();const canvas=await p.locator('#drawing-canvas').boundingBox();await p.mouse.move(canvas.x+30,canvas.y+30);await p.mouse.down();await p.mouse.move(canvas.x+100,canvas.y+100,{steps:5});await p.mouse.up();
 await p.locator('[data-action="clear-canvas"]').click();assert.equal(await p.locator('#clear-dialog').count(),1);await p.waitForTimeout(3000);await p.locator('[data-action="cancel-clear"]').click();
 assert.ok((await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game))).strokes.length);
 await p.locator('[data-action="clear-canvas"]').click();await p.locator('[data-action="confirm-clear"]').click();await p.locator('[data-action="undo-stroke"]').click();
 await p.locator('[data-action="judge"]').click();await p.locator('[data-action="correct"][data-id="p1"]').click();assert.deepEqual((await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game))).teamScores,[0,1]);
 const keep=p.locator('.result-actions [data-action="open-artwork"]');await keep.click();await p.locator('.share-card-preview').waitFor();
 for(const action of ['save-artwork','share-artwork']){const box=await p.locator(`[data-action="${action}"]`).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height,`${engine} ${viewport.width} ${action} visible`)}
 await p.locator('[data-action="close-artwork"]').click();await p.locator('[data-action="undo"]').click();assert.deepEqual((await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game))).teamScores,[0,0]);
 // Restore a synthetic expired round and verify explicit correction survives.
 const expired=await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game));expired.timer.msLeft=0;G.end(expired,'timeout');await p.evaluate(g=>sessionStorage.setItem('test-stage',JSON.stringify({key:'sg_v1_game',g})),expired);await p.reload();await p.locator('[data-action="resume-game"]').click();if(await p.locator('[data-action="uncover"]').count())await p.locator('[data-action="uncover"]').click();await p.locator('[data-action="undo"]').click();await p.locator('[data-action="correct"][data-id="p1"]').click();assert.deepEqual((await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game))).teamScores,[0,1]);
 // Final screen keeps a direct drawing export entry.
 const final=await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game));G.finish(final);await p.evaluate(g=>sessionStorage.setItem('test-stage',JSON.stringify({key:'sg_v1_last',g})),final);await p.reload();await p.locator('[data-action="last"]').click();await p.locator('.replay-actions [data-action="open-artwork"]').click();await p.locator('.share-card-preview').waitFor();
 assert.deepEqual(errors,[]);await c.close();cases++;
}
}finally{await browser.close()}}console.log({cases});})().catch(e=>{console.error(e);process.exitCode=1});
