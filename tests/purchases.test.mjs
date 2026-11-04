import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FREE_WORD_IDS, freeDeck, freeSettings } from "../js/access.mjs";
import { createPurchases, FULL_PRODUCT_ID } from "../js/purchases.mjs";
import { purchaseText } from "../js/purchase-copy.mjs";
import { locales } from "../js/languages.mjs";
import { scheduleFor, setupError } from "../js/core.mjs";
import { defaults } from "../js/profile.mjs";
const content = JSON.parse(
  fs.readFileSync(new URL("../js/content.json", import.meta.url)),
);
const response = (unlocked = false, result = "ready") => ({
  productId: FULL_PRODUCT_ID,
  unlocked,
  ready: true,
  available: true,
  price: "US$1.99",
  result,
});
test("exactly 50 fixed active concepts cover all eight topics without custom/held cards", () => {
  const deck = freeDeck(content);
  assert.equal(deck.length, 50);
  assert.equal(new Set(FREE_WORD_IDS).size, 50);
  assert.deepEqual(
    [...new Set(deck.map((w) => w.topic))].sort(),
    Object.keys(content.topics).sort(),
  );
  assert.deepEqual([...new Set(deck.map((w) => w.difficulty))].sort(), [
    "easy",
    "medium",
  ]);
  for (const locale of locales) {
    const catalog = JSON.parse(
      fs.readFileSync(
        new URL(`../js/locales/${locale.code}.json`, import.meta.url),
      ),
    );
    for (const word of deck) assert.ok(catalog.words[word.id]);
  }
});
test("all legal free setups reserve one swap per turn without modifying preferences", () => {
  for (let count = 2; count <= 12; count++)
    for (const mode of ["coop", "individual", "teams"])
      for (let rounds = 1; rounds <= 3; rounds++)
        for (let split = 1; split < count; split++) {
          const players = Array.from({ length: count }, (_, i) => ({
            id: String(i),
            name: "P" + i,
            team: i < split ? 0 : 1,
          }));
          const original = {
            ...defaults,
            mode,
            roundsEach: rounds,
            topic: "food+animals",
            difficulty: "easy",
          };
          const before = structuredClone(original),
            settings = freeSettings(original, players);
          if (setupError(players, settings, freeDeck(content))) continue;
          assert.ok(
            scheduleFor(players, mode, settings.roundsEach).length * 2 <= 50,
          );
          assert.deepEqual(original, before);
          assert.equal(settings.topic, "mixed");
          assert.equal(settings.difficulty, "general");
        }
});
test("browser has no payment authority; malformed and unverified responses never grant access", async () => {
  assert.equal((await createPurchases().purchase()).unlocked, false);
  for (const result of [
    null,
    {},
    { ...response(true), productId: "other" },
    { ...response(true), unlocked: "true" },
  ]) {
    const store = createPurchases({
      bridge: { postMessage: async () => result },
    });
    assert.equal((await store.purchase()).unlocked, false);
  }
});
test("purchase, pending, cancel, restore, refund and offline refresh preserve only native authority", async () => {
  let next = response(false, "pending");
  const store = createPurchases({ bridge: { postMessage: async () => next } });
  assert.equal((await store.purchase()).unlocked, false);
  next = response(false, "cancelled");
  assert.equal((await store.purchase()).result, "cancelled");
  next = response(true, "purchased");
  assert.equal((await store.purchase()).unlocked, true);
  next = response(true);
  assert.equal((await store.refresh()).unlocked, true);
  next = response(true, "restored");
  assert.equal((await store.restore()).result, "restored");
  next = response(false);
  assert.equal((await store.refresh()).unlocked, false);
  next = response(false, "notFound");
  assert.equal((await store.restore()).unlocked, false);
});
test("duplicate taps cannot open concurrent purchase requests; transport failures do not revoke verified ownership", async () => {
  let finish;
  let calls = 0;
  const store = createPurchases({
    bridge: {
      postMessage: () => {
        calls++;
        return new Promise((r) => (finish = r));
      },
    },
  });
  const first = store.purchase();
  const duplicate = store.purchase();
  const restoreDuringPurchase = store.restore();
  assert.equal(calls, 1);
  finish(response(true, "purchased"));
  await Promise.all([first, duplicate, restoreDuringPurchase]);
  const next = store.refresh();
  finish(null);
  await next;
  assert.equal(store.state.unlocked, true);
});
test("every selectable region has complete purchase copy and the future-update promise", () => {
  for (const locale of locales)
    for (const key of [
      "title",
      "unlock",
      "restore",
      "promise",
      "features",
      "free",
      "limits",
      "checking",
      "working",
      "owned",
      "purchased",
      "restored",
      "notFound",
      "pending",
      "cancelled",
      "failed",
      "unavailable",
      "ready",
      "busy",
      "preserved",
    ])
      assert.ok(purchaseText(locale.code, key), locale.code + ":" + key);
});

test("overlapping startup/foreground checks share authority and products wait for readiness", async () => {
  let finish;
  const calls = [];
  const store = createPurchases({
    bridge: {
      postMessage: ({ action }) => {
        calls.push(action);
        return action === "status"
          ? new Promise((r) => (finish = r))
          : Promise.resolve(response(true));
      },
    },
  });
  const startup = store.refresh(),
    foreground = store.refresh(),
    products = store.products();
  assert.deepEqual(calls, ["status"]);
  finish(response(true));
  await Promise.all([startup, foreground, products]);
  assert.deepEqual(calls, ["status", "products"]);
  assert.equal(store.state.ready, true);
  assert.equal(store.state.unlocked, true);
});

test("transaction notification during a pending purchase triggers a fresh status after its reply", async () => {
  const calls = [];
  let finish;
  const store = createPurchases({
    bridge: {
      postMessage: ({ action }) => {
        calls.push(action);
        return action === "purchase"
          ? new Promise((r) => (finish = r))
          : Promise.resolve(response(true, "owned"));
      },
    },
  });
  const purchase = store.purchase();
  const notification = store.refresh();
  finish(response(false, "pending"));
  await Promise.all([purchase, notification]);
  assert.deepEqual(calls, ["purchase", "status"]);
  assert.equal(store.state.unlocked, true);
});


test("unchanged entitlement refreshes do not notify or repaint the UI", async () => {
  let paints = 0;
  const store = createPurchases({bridge: {postMessage: async () => response(true, "owned")}, onChange: () => paints++});
  await store.refresh();
  for (let i=0;i<20;i++) await store.refresh();
  assert.equal(paints, 1);
});

test("transaction notification during a status scan is followed by a fresh scan", async () => {
  let finish, calls=0;
  const store = createPurchases({bridge: {postMessage: () => ++calls === 1
    ? new Promise(r => {finish=r;}) : Promise.resolve(response(true, "owned"))}});
  const first = store.refresh();
  const update = store.refresh({ changed: true });
  finish(response(false));
  await Promise.all([first,update]);
  assert.equal(calls,2);
  assert.equal(store.state.unlocked,true);
});

test('verified restore/purchase feedback survives routine owned refresh but clears on revocation', async () => {
  for (const result of ['restored', 'purchased']) {
    let reply = response(true, result);
    const p = createPurchases({bridge:{postMessage:async()=>reply}});
    await (result === 'restored' ? p.restore() : p.purchase());
    reply = response(true, 'owned'); await p.refresh();
    assert.equal(p.state.result, result); assert.equal(p.state.unlocked, true);
    reply = response(false, 'ready'); await p.refresh({changed:true});
    assert.equal(p.state.unlocked, false); assert.equal(p.state.result, 'ready');
  }
});
