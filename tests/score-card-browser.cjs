const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE);const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const G=await import('../js/core.mjs');const {defaults}=await import('../js/profile.mjs');let cases=0;
for(const engine of ['chromium','webkit']){const browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});try{
for(const [mode,language,viewport] of [['individual','en',{width:1024,height:768}],['teams','zh',{width:390,height:844}],['coop','ar',{width:844,height:390}]]){
 const players=Array.from({length:mode==='coop'?2:12},(_,i)=>({id:String(i),name:i===0?'A long player name for export review':'玩家 '+i,team:i%2}));
 const settings={...defaults,mode,roundsEach:10,drawPolicy:'unique',teamNames:['火龍隊','Blue & Gold']};
 const words=Array.from({length:250},(_,i)=>({id:String(i),en:'SECRET_'+i,zh:'秘密'+i}));const game=G.newGame(players,settings,words);G.reveal(game);G.start(game);G.end(game,'correct','1');G.finish(game);
 const c=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(({players,settings,language,game})=>{localStorage.sg_v1_profile=JSON.stringify({version:1,language,muted:true,onboardingSeen:true,players,custom:[],settings});localStorage.sg_v1_last=JSON.stringify(game)},{players,settings,language,game:G.snapshot(game)});
 await p.goto(process.env.TEST_URL);await p.locator('[data-action="setup"]').click();await p.locator('[data-action="step"][data-step="1"]').click();
 for(const n of [5,10]){const b=p.locator(`[data-key="roundsEach"][data-value="${n}"]`);await b.click();assert.equal(await b.getAttribute('aria-pressed'),'true')}
 await p.locator('header [data-action="home"]').click();await p.locator('[data-action="last"]').click();await p.locator('[data-action="open-scorecard"]').click();await p.locator('.share-card-preview').waitFor();
 assert.equal(await p.locator('[data-share-answer]').count(),0);
 for(const action of ['save-artwork','share-artwork']){const box=await p.locator(`[data-action="${action}"]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=viewport.height)}
 const src=await p.locator('.share-card-preview').getAttribute('src');const png=Buffer.from(src.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),mode==='individual'?2000:1600);
 const download=p.waitForEvent('download');await p.locator('[data-action="save-artwork"]').click();assert.deepEqual(fs.readFileSync(await(await download).path()),png);
 if(engine==='chromium')fs.writeFileSync(`${process.env.EVIDENCE}/${mode}.png`,png);
 assert.deepEqual(errors,[]);await c.close();cases++;
}
}finally{await browser.close()}}console.log({cases});})().catch(e=>{console.error(e);process.exitCode=1});
