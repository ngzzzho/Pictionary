// Synthetic PointerEvent regression for iPhone canvas input. No screenshots or pixel reads.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");

const url = process.env.TEST_URL || "http://127.0.0.1:8766/";
const profile = {
  version: 1,
  language: "en",
  muted: true,
  onboardingSeen: false,
  players: [1, 2, 3].map((i) => ({
    id: String(i),
    name: `Player ${i}`,
    team: i % 2,
  })),
  custom: [],
  settings: {
    mode: "individual",
    surface: "canvas",
    topic: "mixed",
    difficulty: "easy",
    cardLanguage: "both",
    seconds: 60,
    roundsEach: 1,
  },
};
const failures = [];
const passed = [];

async function openDrawing(browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((value) => {
    localStorage.sg_v1_profile = JSON.stringify(value);
  }, profile);
  await page.goto(url);
  await page.locator(".mascot-welcome").waitFor();
  await page.locator('[data-action="quick"]').click();
  if (await page.locator('[data-action="intro-start"]').count())
    await page.locator('[data-action="intro-start"]').click();
  await page.locator('[data-action="reveal"]').click();
  await page.locator('[data-action="draw"]').click();
  await page.locator("canvas#drawing-canvas").waitFor({ state: "visible" });
  // Synthetic PointerEvents do not receive trusted browser pointer IDs, so only
  // pointer capture is replaced; all application event handlers still run.
  await page.locator("canvas").evaluate((canvas) => {
    canvas.setPointerCapture = (id) => {
      canvas.dataset.syntheticCapture = String(id);
    };
  });
  return { context, page, pageErrors };
}
async function stored(page) {
  return page.evaluate(() => JSON.parse(localStorage.sg_v1_game));
}
async function emit(
  page,
  type,
  {
    id,
    x,
    y,
    button = 0,
    buttons = 0,
    pointerType = "touch",
    isPrimary = true,
  },
) {
  await page.locator("canvas").evaluate(
    (canvas, d) => {
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent(d.type, {
          bubbles: true,
          cancelable: true,
          pointerId: d.id,
          pointerType: d.pointerType,
          isPrimary: d.isPrimary,
          clientX: r.left + r.width * d.x,
          clientY: r.top + r.height * d.y,
          button: d.button,
          buttons: d.buttons,
          pressure: d.buttons ? 0.5 : 0,
        }),
      );
    },
    { type, id, x, y, button, buttons, pointerType, isPrimary },
  );
}
async function runCase(browser, name, fn) {
  let env;
  try {
    env = await openDrawing(browser);
    await fn(env.page);
    assert.deepEqual(env.pageErrors, [], "no uncaught application errors");
    passed.push(name);
  } catch (e) {
    failures.push({ name, error: e.message });
  } finally {
    await env?.context.close();
  }
}

(async () => {
  const browser = await (process.env.TEST_ENGINE === "webkit" ? webkit : chromium).launch({
    ...(process.env.TEST_ENGINE !== "webkit" && process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
  });
  try {
    for (const event of ["contextmenu", "selectstart", "blur", "touchcancel"]) {
      await runCase(browser, `${event} releases stroke and accepts next gesture`, async page => {
        await emit(page,"pointerdown",{id:100,x:0.2,y:0.2,buttons:1});
        await page.evaluate(event => {
          const canvas=document.querySelector('#drawing-canvas');
          if(event==='contextmenu'||event==='selectstart') {
            const e=new Event(event,{bubbles:true,cancelable:true});canvas.dispatchEvent(e);
            if(!e.defaultPrevented) throw Error('callout not blocked');
          } else if(event==='touchcancel') {const e=new Event(event);Object.defineProperty(e,'touches',{value:[]});window.dispatchEvent(e);}
          else window.dispatchEvent(new Event(event));
        },event);
        await emit(page,"pointerdown",{id:101,x:0.4,y:0.4,buttons:1});
        await emit(page,"pointerup",{id:101,x:0.6,y:0.6});
        assert.equal((await stored(page)).strokes.length,2);
      });
    }
    await runCase(
      browser,
      "rapid down/up stores distinct endpoints without a move",
      async (page) => {
        await emit(page, "pointerdown", {
          id: 21,
          x: 0.21,
          y: 0.28,
          buttons: 1,
        });
        await emit(page, "pointerup", { id: 21, x: 0.69, y: 0.73 });
        const strokes = (await stored(page)).strokes;
        assert.equal(strokes.length, 1);
        assert.deepEqual(strokes[0].points, [
          [0.21, 0.28],
          [0.69, 0.73],
        ]);
      },
    );

    await runCase(
      browser,
      "right mouse button does not create a stroke",
      async (page) => {
        await emit(page, "pointerdown", {
          id: 22,
          x: 0.25,
          y: 0.3,
          button: 2,
          buttons: 2,
          pointerType: "mouse",
        });
        await emit(page, "pointerup", {
          id: 22,
          x: 0.7,
          y: 0.8,
          button: 2,
          pointerType: "mouse",
        });
        assert.equal((await stored(page)).strokes.length, 0);
      },
    );

    await runCase(
      browser,
      "secondary pointer cannot add or terminate the primary stroke",
      async (page) => {
        await emit(page, "pointerdown", {
          id: 31,
          x: 0.2,
          y: 0.25,
          buttons: 1,
        });
        await emit(page, "pointerdown", {
          id: 32,
          x: 0.8,
          y: 0.8,
          buttons: 1,
          isPrimary: false,
        });
        await emit(page, "pointerup", {
          id: 32,
          x: 0.85,
          y: 0.85,
          isPrimary: false,
        });
        assert.equal(
          (await stored(page)).strokes.length,
          0,
          "secondary up must not commit/terminate the active stroke",
        );
        await emit(page, "pointermove", {
          id: 31,
          x: 0.4,
          y: 0.45,
          buttons: 1,
        });
        await emit(page, "pointerup", { id: 31, x: 0.55, y: 0.6 });
        const strokes = (await stored(page)).strokes;
        assert.equal(strokes.length, 1);
        assert.ok(strokes[0].points.length >= 2);
        assert.ok(
          !strokes[0].points.some(([x, y]) => x > 0.75 && y > 0.75),
          "secondary coordinates do not leak into primary stroke",
        );
      },
    );

    await runCase(
      browser,
      "pointercancel preserves accepted partial stroke",
      async (page) => {
        await emit(page, "pointerdown", {
          id: 41,
          x: 0.16,
          y: 0.22,
          buttons: 1,
        });
        await emit(page, "pointermove", {
          id: 41,
          x: 0.35,
          y: 0.42,
          buttons: 1,
        });
        await emit(page, "pointermove", {
          id: 41,
          x: 0.51,
          y: 0.58,
          buttons: 1,
        });
        await emit(page, "pointercancel", { id: 41, x: 0.51, y: 0.58 });
        const strokes = (await stored(page)).strokes;
        assert.equal(strokes.length, 1);
        assert.ok(strokes[0].points.length >= 3);
        assert.deepEqual(strokes[0].points[0], [0.16, 0.22]);
      },
    );

    await runCase(
      browser,
      "viewport/orientation change commits before new coordinates and preserves normalized shape/ratio",
      async (page) => {
        const before = await stored(page);
        assert.equal(before.canvasRatio, 1);
        await emit(page, "pointerdown", {
          id: 51,
          x: 0.18,
          y: 0.24,
          buttons: 1,
        });
        await emit(page, "pointermove", {
          id: 51,
          x: 0.38,
          y: 0.46,
          buttons: 1,
        });
        await page.setViewportSize({ width: 844, height: 390 });
        await page.evaluate(() =>
          window.dispatchEvent(new Event("orientationchange")),
        );
        await page.waitForTimeout(100);
        let state = await stored(page);
        assert.equal(
          state.strokes.length,
          1,
          "rotation commits the in-progress stroke before more input",
        );
        assert.deepEqual(state.strokes[0].points, [
          [0.18, 0.24],
          [0.38, 0.46],
        ]);
        assert.equal(
          state.canvasRatio,
          1,
          "new-game square document ratio is preserved",
        );
        await emit(page, "pointerdown", {
          id: 52,
          x: 0.61,
          y: 0.32,
          buttons: 1,
        });
        await emit(page, "pointerup", { id: 52, x: 0.72, y: 0.41 });
        state = await stored(page);
        assert.equal(
          state.strokes.length,
          2,
          "coordinates after rotation form a separate stroke",
        );
        assert.deepEqual(state.strokes[1].points, [
          [0.61, 0.32],
          [0.72, 0.41],
        ]);
        assert.ok(
          state.strokes
            .flatMap((s) => s.points)
            .every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1),
        );
      },
    );

    await runCase(
      browser,
      "undo/redo preserve the exact serialized stroke",
      async (page) => {
        await emit(page, "pointerdown", {
          id: 61,
          x: 0.11,
          y: 0.17,
          buttons: 1,
        });
        await emit(page, "pointermove", {
          id: 61,
          x: 0.36,
          y: 0.43,
          buttons: 1,
        });
        await emit(page, "pointerup", { id: 61, x: 0.77, y: 0.82 });
        const original = (await stored(page)).strokes[0];
        await page.locator('[data-action="undo-stroke"]').click();
        assert.equal((await stored(page)).strokes.length, 0);
        await page.locator('[data-action="redo-stroke"]').click();
        assert.deepEqual((await stored(page)).strokes[0], original);
      },
    );

    const result = {
      status: failures.length ? "fail" : "pass",
      url,
      passed,
      failures,
    };
    console.log(JSON.stringify(result, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
