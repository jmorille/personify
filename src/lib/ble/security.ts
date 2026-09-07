/**
 * LocalConnect session security.
 * Reverse-engineered from AcuityBrands.BluetoothLE.Zone.Security.{SecurityManager,
 * SecurityHelper, Aes128CtrEngine} (see docs/PROTOCOL.md).
 *
 * ECDH P-256 -> SHA-256(sharedSecret) -> AES-128-CTR encode/decode streams.
 * Implemented entirely on Web Crypto (subtle): ECDH deriveBits, SHA-256, and a
 * faithful custom CTR built on AES-ECB (obtained via single-block AES-CBC, IV=0).
 */

import aesjs from "aes-js";

const subtle = globalThis.crypto.subtle;

/** Copy into a fresh ArrayBuffer-backed view so Web Crypto's BufferSource type is satisfied. */
function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

export interface SessionKeys {
  key: Uint8Array; // 16 bytes
  encodeIv: Uint8Array; // 16 bytes (TX counter start)
  decodeIv: Uint8Array; // 16 bytes (RX counter start)
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest("SHA-256", ab(data)));
}

/** SecurityManager.Init: slice SHA-256(sharedSecret) into key + two IVs. */
export async function deriveSessionKeys(sharedSecret: Uint8Array): Promise<SessionKeys> {
  const h = await sha256(sharedSecret);
  const key = h.slice(0, 16);
  const decodeIv = new Uint8Array(16);
  decodeIv.set(h.slice(16, 24), 0);
  const encodeIv = new Uint8Array(16);
  encodeIv.set(h.slice(24, 32), 0);
  return { key, encodeIv, decodeIv };
}

/**
 * Faithful port of Aes128CtrEngine: keystream = AES-ECB(counter), big-endian
 * increment per 16-byte block, leftover keystream retained across calls.
 */
export class Aes128CtrStream {
  private counter: Uint8Array;
  private leftover: number[] = [];
  private keyPromise: Promise<CryptoKey>;

  constructor(key: Uint8Array, iv: Uint8Array) {
    if (key.length !== 16) throw new Error("key must be 16 bytes");
    if (iv.length !== 16) throw new Error("iv must be 16 bytes");
    this.counter = Uint8Array.from(iv);
    // AES-CBC used as an ECB primitive: CBC(IV=0) of one block == ECB(block).
    this.keyPromise = subtle.importKey("raw", ab(key), { name: "AES-CBC" }, false, ["encrypt"]);
  }

  private incrementCounter() {
    for (let i = 15; i >= 0; i--) {
      if (this.counter[i] === 0xff) this.counter[i] = 0;
      else {
        this.counter[i]++;
        break;
      }
    }
  }

  private async nextKeyBlock(): Promise<void> {
    const key = await this.keyPromise;
    const zeroIv = new Uint8Array(16);
    const enc = new Uint8Array(
      await subtle.encrypt({ name: "AES-CBC", iv: ab(zeroIv) }, key, ab(this.counter)),
    );
    // First 16 bytes are ECB(counter); remaining bytes are PKCS7 padding block.
    for (let i = 0; i < 16; i++) this.leftover.push(enc[i]);
    this.incrementCounter();
  }

  async process(bytes: Uint8Array): Promise<Uint8Array> {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      if (this.leftover.length === 0) await this.nextKeyBlock();
      out[i] = bytes[i] ^ (this.leftover.shift() as number);
    }
    return out;
  }
}

// --- Passcode KEK (AES-256-ECB, key = SHA-256(passcode)) ----------------------
// SecurityManager.PerformHandshakeWithKek: the app's public key is AES-ECB
// encrypted under SHA-256(passcode) before exchange, and the device's returned
// key is decrypted the same way. AES-256-ECB/NoPadding over full 16-byte blocks.

async function kekKey(passcode: Uint8Array): Promise<Uint8Array> {
  return sha256(passcode); // 32 bytes -> AES-256
}

export async function kekEncrypt(passcode: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const ecb = new aesjs.ModeOfOperation.ecb(await kekKey(passcode));
  return Uint8Array.from(ecb.encrypt(data));
}

export async function kekDecrypt(passcode: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const ecb = new aesjs.ModeOfOperation.ecb(await kekKey(passcode));
  return Uint8Array.from(ecb.decrypt(data));
}

// --- ECDH P-256 ---------------------------------------------------------------

/** Raw 64-byte public key (X||Y) from a P-256 CryptoKey. */
async function exportRawPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = new Uint8Array(await subtle.exportKey("raw", key)); // 0x04 || X || Y
  return raw.slice(1); // drop the uncompressed-point prefix
}

/** Import a raw 64-byte (X||Y) P-256 public key for ECDH. */
async function importRawPublicKey(raw64: Uint8Array): Promise<CryptoKey> {
  if (raw64.length !== 64) throw new Error("Expected 64 byte public key");
  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.set(raw64, 1);
  return subtle.importKey("raw", ab(point), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

export interface EcdhKeyPair {
  privateKey: CryptoKey;
  publicKeyRaw: Uint8Array; // 64 bytes
}

export async function ecdhGenerateKeyPair(): Promise<EcdhKeyPair> {
  const pair = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKeyRaw: await exportRawPublicKey(pair.publicKey) };
}

/** ECDH agreement -> 32-byte X coordinate (matches BouncyCastle ToByteArrayUnsigned). */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  foreignPublicKeyRaw64: Uint8Array,
): Promise<Uint8Array> {
  const pub = await importRawPublicKey(foreignPublicKeyRaw64);
  const bits = await subtle.deriveBits({ name: "ECDH", public: pub }, privateKey, 256);
  return new Uint8Array(bits);
}
