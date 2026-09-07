import { describe, it, expect } from "vitest";
import { createHash, createCipheriv } from "node:crypto";
import {
  deriveSessionKeys,
  Aes128CtrStream,
  ecdhGenerateKeyPair,
  deriveSharedSecret,
} from "./security";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

// Independent AES-128-ECB keystream oracle (node:crypto), matching the custom
// Aes128CtrEngine: keystream block = ECB(counter), big-endian increment per block.
function ctrKeystream(key: Uint8Array, iv: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  const counter = Uint8Array.from(iv);
  let produced = 0;
  while (produced < n) {
    const ecb = createCipheriv("aes-128-ecb", Buffer.from(key), null);
    ecb.setAutoPadding(false);
    const block = Uint8Array.from(
      Buffer.concat([ecb.update(Buffer.from(counter)), ecb.final()]),
    );
    for (let i = 0; i < 16 && produced < n; i++) out[produced++] = block[i];
    for (let j = 15; j >= 0; j--) {
      if (counter[j] === 0xff) counter[j] = 0;
      else {
        counter[j]++;
        break;
      }
    }
  }
  return out;
}

describe("deriveSessionKeys", () => {
  it("derives key/encodeIv/decodeIv by slicing SHA-256(sharedSecret)", async () => {
    const secret = new Uint8Array([1, 2, 3, 4, 5]);
    const h = Uint8Array.from(createHash("sha256").update(Buffer.from(secret)).digest());
    const keys = await deriveSessionKeys(secret);

    expect(hex(keys.key)).toBe(hex(h.slice(0, 16)));
    // decodeIv = H[16..24] in first 8 bytes, zero-padded to 16
    const decodeIv = new Uint8Array(16);
    decodeIv.set(h.slice(16, 24), 0);
    expect(hex(keys.decodeIv)).toBe(hex(decodeIv));
    // encodeIv = H[24..32] in first 8 bytes, zero-padded to 16
    const encodeIv = new Uint8Array(16);
    encodeIv.set(h.slice(24, 32), 0);
    expect(hex(keys.encodeIv)).toBe(hex(encodeIv));
  });
});

describe("Aes128CtrStream", () => {
  const key = Uint8Array.from({ length: 16 }, (_, i) => i);
  const iv = new Uint8Array(16); // all zero counter

  it("XORs plaintext with the AES-ECB(counter) keystream", async () => {
    const pt = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // XOR 0 -> keystream
    const stream = new Aes128CtrStream(key, iv);
    const ct = await stream.process(pt);
    expect(hex(ct)).toBe(hex(ctrKeystream(key, iv, pt.length)));
  });

  it("retains leftover keystream across partial-block calls", async () => {
    const stream = new Aes128CtrStream(key, iv);
    const a = await stream.process(new Uint8Array(5)); // 5 bytes
    const b = await stream.process(new Uint8Array(20)); // spans block boundary
    const combined = new Uint8Array([...a, ...b]);
    expect(hex(combined)).toBe(hex(ctrKeystream(key, iv, 25)));
  });

  it("round-trips: a paired stream decodes what another encoded", async () => {
    const enc = new Aes128CtrStream(key, iv);
    const dec = new Aes128CtrStream(key, iv);
    const pt = Uint8Array.from({ length: 37 }, (_, i) => (i * 7) & 0xff);
    const ct = await enc.process(pt);
    const back = await dec.process(ct);
    expect(hex(back)).toBe(hex(pt));
    expect(hex(ct)).not.toBe(hex(pt));
  });
});

describe("ECDH P-256", () => {
  it("both parties derive the same shared secret from raw 64-byte public keys", async () => {
    const app = await ecdhGenerateKeyPair();
    const dev = await ecdhGenerateKeyPair();
    expect(app.publicKeyRaw.length).toBe(64);

    const s1 = await deriveSharedSecret(app.privateKey, dev.publicKeyRaw);
    const s2 = await deriveSharedSecret(dev.privateKey, app.publicKeyRaw);
    expect(hex(s1)).toBe(hex(s2));
    expect(s1.length).toBe(32);
  });
});
