// Disposable profiles only; simulate time spent in a blocking confirmation.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
  const records = [];
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
    try {
      for (const [action, accepted] of [['clear-canvas',false],['clear-canvas',true]]) {
        const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}), page = await context.newPage();
        await page.goto(process.env.TEST_URL);
        const click = a => page.locator(`[data-action="${a}"]`).first().click();
        await click('quick'); await click('intro-start'); await click('reveal');
        await page.evaluate(() => { window.testNow = Date.now(); Date.now = () => window.testNow; });
        await click('draw');
        const box = await page.locator('#drawing-canvas').boundingBox();
        await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:8});await page.mouse.up();
        const read = () => page.evaluate(() => JSON.parse(localStorage.sg_v1_game));
        const before = await read();
        await page.evaluate(accepted => { window.confirm = () => {window.testNow += 5000;return accepted;}; },accepted);
        await click(action);
        const after = await read(), paused = await page.locator('.pause-cover').count() === 1;
        const preserved = JSON.stringify(after.strokes) === JSON.stringify(before.strokes);
        let undoRestored = null;
        if (accepted) { await click('undo-stroke');undoRestored = JSON.stringify((await read()).strokes) === JSON.stringify(before.strokes); }
        const pass = after.timer.msLeft === before.timer.msLeft && paused && !after.finished && (accepted ? after.strokes.length === 0 && undoRestored : preserved);
        records.push({engine,action,accepted,before:before.timer.msLeft,after:after.timer.msLeft,paused,strokesPreserved:preserved,undoRestored,pass});
        // Explicit Continue is required after either confirmation outcome.
        await click('toggle-pause');
        if (paused) assert.equal(await page.locator('.pause-cover').count(),0);
        await context.close();
      }
    } finally {await browser.close();}
  }
  if(process.env.RECEIPT) fs.writeFileSync(process.env.RECEIPT,JSON.stringify({records},null,2)+'\n');
  assert.equal(records.filter(r=>!r.pass).length,0,JSON.stringify(records));
  console.log(JSON.stringify({cases:records.length,failures:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
