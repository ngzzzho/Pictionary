import test from "node:test";
import assert from "node:assert/strict";
import { initialTVStatus, requiresTVContinue } from "../js/tv.mjs";
import { tvView } from "../js/tv-ui.mjs";
import { locales } from "../js/languages.mjs";
import { catalogs } from "../js/localization.mjs";

test("cold TV-off lifecycle does not require TV onboarding, but unsafe routes still do", () => {
  const initial = initialTVStatus(true);
  for (const reason of ["initializing", "off", "background", "reconnecting"])
    assert.equal(
      requiresTVContinue({ ...initial, reason }, initial, false),
      false,
    );
  for (const reason of ["captured", "route"])
    assert.equal(
      requiresTVContinue({ ...initial, reason }, initial, false),
      true,
    );
  assert.equal(
    requiresTVContinue(
      { ...initial, enabled: true, reason: "waiting" },
      initial,
      false,
    ),
    true,
  );
  const ready = {
    ...initial,
    privateAllowed: true,
    resetRequired: false,
    reason: "off",
  };
  assert.equal(requiresTVContinue(ready, initial, false), false);
  for (const reason of ["background", "reconnecting"])
    assert.equal(requiresTVContinue({ ...initial, reason }, ready, true), false);
  for (const reason of ["captured", "route"])
    assert.equal(requiresTVContinue({ ...initial, reason }, ready, true), true);
  assert.equal(requiresTVContinue({ ...initial, enabled: true, reason: "background" }, { ...ready, enabled: true }, true), true);
});

test("all locales separate generic startup, optional four-step TV guide, and real privacy warnings", () => {
  const initial = initialTVStatus(true);
  for (const { code } of locales) {
    const copy = catalogs[code];
    const loading = tvView(initial, code, { guarded: true, startup: true });
    assert.ok(loading.includes(copy.tv.loadingTitle));
    assert.ok(!loading.includes(copy.tv.intro));
    assert.ok(!loading.includes('data-action="tv-enable"'));
    assert.ok(!loading.includes('data-action="tv-continue"'));
    const optional = tvView(
      { ...initial, privateAllowed: true, resetRequired: false, reason: "off" },
      code,
    );
    assert.ok(optional.includes(copy.tv.optional));
    assert.equal((optional.match(/<li>/g) || []).length, 4);
    assert.ok(optional.includes('class="tv-mirror-icon"'));
    assert.ok(optional.includes(copy.tv.phoneOnly));
    const waiting = tvView(
      { ...initial, enabled: true, reason: "waiting" },
      code,
      { guarded: true },
    );
    assert.equal((waiting.match(/<li>/g) || []).length, 4);
    assert.ok(waiting.includes('data-action="tv-disable"'));
    const captured = tvView({ ...initial, reason: "captured" }, code, {
      guarded: true,
    });
    assert.ok(captured.includes(copy.tv.capturedHint));
    assert.ok(!captured.includes('data-action="tv-continue"'));
    assert.ok(copy.native.connectionSteps.includes("4."));
    assert.ok(copy.native.connectionHint);
  }
});
