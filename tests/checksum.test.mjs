import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { sha256 } from "../js/checksum.mjs";
test("native checksum fallback matches SHA-256 vectors and padding boundaries", () => {
  for (const text of ["", "abc", "a".repeat(1000000), "作品備份🖍️"])
    assert.equal(
      sha256(new TextEncoder().encode(text)),
      createHash("sha256").update(text).digest("hex"),
    );
  for (const size of [55, 56, 63, 64, 65, 127, 128, 129, 100001]) {
    const bytes = randomBytes(size);
    assert.equal(
      sha256(bytes),
      createHash("sha256").update(bytes).digest("hex"),
    );
  }
});
