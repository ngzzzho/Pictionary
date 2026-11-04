const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE);const assert=require('node:assert/strict');
(async()=>{let cases=0;for(const engine of ['chromium','webkit']){const browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});try{for(const rule of ['own','open']){
 const c=await browser.newContext({viewport:rule==='own'?{width:390,height:844}:{width:844,height:390},serviceWorkers:'block',reducedMotion:'reduce'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{if(!localStorage.sg_v1_profile)localStorage.sg_v1_profile=JSON.stringify({version:1,language:'zh',muted:true,onboardingSeen:true,players:[0,1,2,3].map(i=>({id:String(i),name:'玩家'+i,team:i%2})),custom:['保留'],settings:{mode:'teams',surface:'canvas',topic:'mixed',difficulty:'easy',cardLanguage:'zh',seconds:60,roundsEach:1}})});
 await p.goto(process.env.TEST_URL);await p.locator('[data-action="setup"]').click();await p.locator(`[data-key="teamGuessing"][data-value="${rule}"]`).click();
 assert.equal(await p.locator(`[data-key="teamGuessing"][data-value="${rule}"]`).getAttribute('aria-pressed'),'true');
 await p.reload();await p.locator('[data-action="setup"]').click();assert.equal(await p.locator(`[data-key="teamGuessing"][data-value="${rule}"]`).getAttribute('aria-pressed'),'true');
 await p.locator('[data-action="step"][data-step="3"]').click();assert.ok((await p.locator('.team-guessing-summary').innerText()).includes(rule==='own'?'只限自己隊伍':'兩隊都可以搶答'));
 await p.locator('[data-action="start-game"]').click();await p.locator('[data-action="reveal"]').click();await p.locator('[data-action="draw"]').click();await p.locator('[data-action="judge"]').click();
 assert.equal(await p.locator('[data-action="correct"]').count(),rule==='own'?1:3);
 await p.locator(`[data-action="correct"][data-id="${rule==='own'?'2':'1'}"]`).click();
 const saved=await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game));assert.deepEqual(saved.teamScores,rule==='own'?[1,0]:[0,1]);assert.equal(saved.settings.teamGuessing,rule);
 await p.locator('[data-action="undo"]').click();assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.sg_v1_game).teamScores),[0,0]);assert.deepEqual(errors,[]);await c.close();cases++;
}}finally{await browser.close()}}console.log({cases});})().catch(e=>{console.error(e);process.exitCode=1});
