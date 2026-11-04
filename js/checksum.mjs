// SHA-256 checksum fallback for native WKWebViews without WebCrypto.
// Used for file integrity and deterministic IDs, never passwords or authentication.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rot = (x, n) => (x >>> n) | (x << (32 - n));
export function sha256(bytes) {
  const h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ]),
    w = new Uint32Array(64),
    last = Math.ceil((bytes.length + 9) / 64) * 64;
  for (let offset = 0; offset < last; offset += 64) {
    w.fill(0);
    for (let j = 0; j < 64; j++) {
      const index = offset + j;
      let byte =
        index < bytes.length ? bytes[index] : index === bytes.length ? 128 : 0;
      if (index >= last - 8) {
        const bit = bytes.length * 8,
          shift = (last - 1 - index) * 8;
        byte =
          shift >= 32
            ? (Math.floor(bit / 2 ** 32) >>> (shift - 32)) & 255
            : (bit >>> shift) & 255;
      }
      w[j >>> 2] |= byte << (24 - (j % 4) * 8);
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15],
        b = w[i - 2];
      w[i] =
        (w[i - 16] +
          (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) +
          w[i - 7] +
          (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, v] = h;
    for (let i = 0; i < 64; i++) {
      const one =
          (v +
            (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) +
            ((e & f) ^ (~e & g)) +
            K[i] +
            w[i]) >>>
          0,
        two =
          ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) >>>
          0;
      v = g;
      g = f;
      f = e;
      e = (d + one) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (one + two) >>> 0;
    }
    [a, b, c, d, e, f, g, v].forEach((n, i) => (h[i] = (h[i] + n) >>> 0));
  }
  return [...h].map((n) => n.toString(16).padStart(8, "0")).join("");
}
