import { describe, it, expect } from "vitest";
import { createHash, createCipheriv } from "node:crypto";
import { kekEncrypt, kekDecrypt } from "./security";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("passcode KEK (AES-256-ECB, key = SHA-256(passcode))", () => {
  const passcode = new TextEncoder().encode("123456");
  const publicKey = Uint8Array.from({ length: 64 }, (_, i) => (i * 3) & 0xff);

  it("encrypts with AES-256-ECB using SHA-256(passcode) as the key", async () => {
    const kek = Uint8Array.from(createHash("sha256").update(Buffer.from(passcode)).digest());
    const ecb = createCipheriv("aes-256-ecb", Buffer.from(kek), null);
    ecb.setAutoPadding(false);
    const expected = Uint8Array.from(
      Buffer.concat([ecb.update(Buffer.from(publicKey)), ecb.final()]),
    );

    const out = await kekEncrypt(passcode, publicKey);
    expect(hex(out)).toBe(hex(expected));
  });

  it("round-trips encrypt -> decrypt", async () => {
    const enc = await kekEncrypt(passcode, publicKey);
    const dec = await kekDecrypt(passcode, enc);
    expect(hex(dec)).toBe(hex(publicKey));
  });
});
