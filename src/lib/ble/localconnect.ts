/**
 * LocalConnectSession — orchestrates the reverse-engineered LocalConnect control
 * flow over a GattLink: ECDH+KEK handshake, AES-CTR framing, KLV commands.
 * Ports AcuityBrands.BluetoothLE.Zone.Comm.LocalConnectBleLink + SecurityManager.
 */
import { GattLink } from "./link";
import {
  Aes128CtrStream,
  deriveSessionKeys,
  deriveSharedSecret,
  ecdhGenerateKeyPair,
  kekDecrypt,
  kekEncrypt,
} from "./security";
import { ControlKeys, encodeKlv, encodeRequest, encodeCommand, Commands } from "./klv";
import { frameWriteList, CONTROL_BYTE_COMPLETED, CONTROL_BYTE_ERROR, DEFAULT_MTU } from "./framing";
import * as U from "./uuids";

/** Minimal FIFO awaitable queue for indication payloads. */
class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: ((v: T) => void)[] = [];
  enqueue(v: T) {
    const w = this.waiters.shift();
    if (w) w(v);
    else this.items.push(v);
  }
  dequeue(): Promise<T> {
    const v = this.items.shift();
    if (v !== undefined) return Promise.resolve(v);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export interface SessionOptions {
  /** assetId + acuityOrgId bytes used as the handshake passcode/KEK material. */
  passcode: Uint8Array;
  mtu?: number;
}

export class LocalConnectSession {
  private encode!: Aes128CtrStream;
  private decode!: Aes128CtrStream;
  private readResponses = new AsyncQueue<Uint8Array>();
  private writeResponses = new AsyncQueue<Uint8Array>();
  private mtu: number;
  isConnected = false;

  constructor(
    private link: GattLink,
    private opts: SessionOptions,
  ) {
    this.mtu = opts.mtu ?? DEFAULT_MTU;
  }

  async connect(): Promise<void> {
    const { privateKey, publicKeyRaw } = await ecdhGenerateKeyPair();

    // 1. Send our KEK-encrypted public key, read the device's (KEK-encrypted) key.
    const encPub = await kekEncrypt(this.opts.passcode, publicKeyRaw);
    await this.link.writeWithAck(U.KEY_EXCHANGE_SERVICE, U.CHAR_WRITE_CONFIG_KEY, encPub);
    const devEnc = await this.readFull(U.CHAR_READ_PUBLIC_KEY, 64);
    const devPub = await kekDecrypt(this.opts.passcode, devEnc);

    // 2. Derive the shared secret and the two CTR session streams.
    const shared = await deriveSharedSecret(privateKey, devPub);
    const keys = await deriveSessionKeys(shared);
    this.encode = new Aes128CtrStream(keys.key, keys.encodeIv);
    this.decode = new Aes128CtrStream(keys.key, keys.decodeIv);

    // 3. Subscribe to indication characteristics (payloads are stream-decoded).
    await this.link.subscribe(U.LOCALCONNECT_SERVICE, U.CHAR_READ_RESPONSE, (d) =>
      this.onIndication(d, this.readResponses),
    );
    await this.link.subscribe(U.LOCALCONNECT_SERVICE, U.CHAR_WRITE_LIST_RESPONSE, (d) =>
      this.onIndication(d, this.writeResponses),
    );

    // 4. Authenticate with the passcode.
    await this.link.writeWithAck(U.KEY_EXCHANGE_SERVICE, U.CHAR_AUTHENTICATE, this.opts.passcode);

    this.isConnected = true;
  }

  private async readFull(characteristic: string, length: number): Promise<Uint8Array> {
    const out = new Uint8Array(length);
    let received = 0;
    while (received < length) {
      const chunk = await this.link.read(U.KEY_EXCHANGE_SERVICE, characteristic);
      out.set(chunk.subarray(0, length - received), received);
      received += chunk.length;
    }
    return out;
  }

  private async onIndication(raw: Uint8Array, queue: AsyncQueue<Uint8Array>) {
    const decoded = await this.decode.process(raw);
    queue.enqueue(decoded);
  }

  private ensureConnected() {
    if (!this.isConnected) throw new Error("LocalConnect session is not connected");
  }

  /** Send a payload over WriteList (framed + encrypted) and await completion. */
  private async writeList(payload: Uint8Array): Promise<void> {
    this.ensureConnected();
    for (const frame of frameWriteList(payload, this.mtu)) {
      const enc = await this.encode.process(frame);
      await this.link.writeNoResponse(U.LOCALCONNECT_SERVICE, U.CHAR_WRITE_LIST, enc);
    }
    await this.awaitResponse(this.writeResponses);
  }

  /** Request control keys over ReadList and reassemble the KLV response. */
  private async requestList(keys: ControlKeys[]): Promise<Map<ControlKeys, Uint8Array>> {
    this.ensureConnected();
    const payload = encodeRequest(keys);
    for (const frame of frameWriteList(payload, this.mtu)) {
      const enc = await this.encode.process(frame);
      await this.link.writeNoResponse(U.LOCALCONNECT_SERVICE, U.CHAR_READ_LIST, enc);
    }
    const body = await this.awaitResponse(this.readResponses);
    return parseKlvList(body);
  }

  /** Collect indication frames until the completion control byte, return the body. */
  private async awaitResponse(queue: AsyncQueue<Uint8Array>): Promise<Uint8Array> {
    const parts: number[] = [];
    for (;;) {
      const frame = await queue.dequeue();
      const control = frame[0];
      for (let i = 1; i < frame.length; i++) parts.push(frame[i]);
      if (control === CONTROL_BYTE_ERROR) throw new Error("Device returned an error frame");
      if (control === CONTROL_BYTE_COMPLETED) break;
    }
    return Uint8Array.from(parts);
  }

  // --- High-level lighting API ------------------------------------------------

  async setDimLevel(level: number): Promise<void> {
    await this.writeList(encodeKlv(ControlKeys.CurrentDimLevel, new Uint8Array([clampByte(level)])));
  }

  async readDimLevel(): Promise<number> {
    const map = await this.requestList([ControlKeys.CurrentDimLevel]);
    return map.get(ControlKeys.CurrentDimLevel)?.[0] ?? 0;
  }

  async setCct(kelvin: number): Promise<void> {
    const v = kelvin & 0xffff;
    await this.writeList(encodeKlv(ControlKeys.CCT, new Uint8Array([(v >> 8) & 0xff, v & 0xff])));
  }

  async readCct(): Promise<number> {
    const map = await this.requestList([ControlKeys.CCT]);
    const p = map.get(ControlKeys.CCT);
    return p && p.length >= 2 ? (p[0] << 8) | p[1] : 0;
  }

  async identify(): Promise<void> {
    await this.writeList(encodeCommand(Commands.Identify));
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse a concatenation of KLV packets into a key -> payload map. */
export function parseKlvList(body: Uint8Array): Map<ControlKeys, Uint8Array> {
  const out = new Map<ControlKeys, Uint8Array>();
  let i = 0;
  while (i + 3 <= body.length) {
    const key = ((body[i] << 8) | (body[i + 1] & 0x7f)) as ControlKeys;
    const len = body[i + 2];
    const payload = body.subarray(i + 3, i + 3 + len);
    out.set(key, Uint8Array.from(payload));
    i += 3 + len;
  }
  return out;
}
