/**
 * In-memory simulated LocalConnect luminaire. Implements the device side of the
 * reverse-engineered protocol (ECDH+KEK handshake, AES-CTR framing, KLV) so the
 * full LocalConnectSession runs end-to-end without hardware — and so the UI has
 * something to drive when no real device is present.
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
import { ControlKeys, encodeKlv } from "./klv";
import { CONTROL_BYTE_COMPLETED } from "./framing";
import * as U from "./uuids";

export interface LuminaireState {
  dimLevel: number; // 0-255
  cct: number; // Kelvin
}

interface SimOptions {
  passcode: Uint8Array;
  dimLevel?: number;
  cct?: number;
  label?: string;
}

export class SimulatedLuminaire {
  readonly state: LuminaireState;
  readonly label: string;
  private passcode: Uint8Array;

  // device-side session crypto
  private devPubRaw!: Uint8Array;
  private encPubForApp!: Uint8Array;
  private encode?: Aes128CtrStream; // device -> app
  private decode?: Aes128CtrStream; // app -> device

  // indication subscribers registered by the session
  private subscribers = new Map<string, (d: Uint8Array) => void>();

  constructor(opts: SimOptions) {
    this.passcode = opts.passcode;
    this.label = opts.label ?? "Simulated Luminaire";
    this.state = { dimLevel: opts.dimLevel ?? 0, cct: opts.cct ?? 2700 };
  }

  /** The GattLink the session talks to. */
  link: GattLink = {
    read: async (_service, characteristic) => {
      if (characteristic === U.CHAR_READ_PUBLIC_KEY) return this.encPubForApp;
      return new Uint8Array(0);
    },
    writeWithAck: async (_service, characteristic, data) => {
      if (characteristic === U.CHAR_WRITE_CONFIG_KEY) await this.onKeyExchange(data);
      // CHAR_AUTHENTICATE: accepted (no-op for the simulator)
    },
    writeNoResponse: async (_service, characteristic, data) => {
      if (characteristic === U.CHAR_WRITE_LIST) await this.onWriteList(data);
      else if (characteristic === U.CHAR_READ_LIST) await this.onReadList(data);
    },
    subscribe: async (_service, characteristic, onValue) => {
      this.subscribers.set(characteristic, onValue);
    },
  };

  private async onKeyExchange(encAppPub: Uint8Array) {
    const appPub = await kekDecrypt(this.passcode, encAppPub);
    const dev = await ecdhGenerateKeyPair();
    this.devPubRaw = dev.publicKeyRaw;
    this.encPubForApp = await kekEncrypt(this.passcode, dev.publicKeyRaw);

    const shared = await deriveSharedSecret(dev.privateKey, appPub);
    const keys = await deriveSessionKeys(shared);
    // Swapped relative to the app: device decodes the app's encode stream, and
    // encodes on the app's decode stream.
    this.decode = new Aes128CtrStream(keys.key, keys.encodeIv);
    this.encode = new Aes128CtrStream(keys.key, keys.decodeIv);
  }

  private async decodeFrames(data: Uint8Array): Promise<{ body: Uint8Array; complete: boolean }> {
    const frame = await this.decode!.process(data);
    const control = frame[0];
    return { body: frame.subarray(1), complete: control === CONTROL_BYTE_COMPLETED };
  }

  private reassembly: number[] = [];

  private async onWriteList(data: Uint8Array) {
    const { body, complete } = await this.decodeFrames(data);
    for (const b of body) this.reassembly.push(b);
    if (!complete) return;
    const payload = Uint8Array.from(this.reassembly);
    this.reassembly = [];
    this.applyKlvWrites(payload);
    await this.emit(U.CHAR_WRITE_LIST_RESPONSE, Uint8Array.from([CONTROL_BYTE_COMPLETED]));
  }

  private async onReadList(data: Uint8Array) {
    const { body, complete } = await this.decodeFrames(data);
    for (const b of body) this.reassembly.push(b);
    if (!complete) return;
    const req = Uint8Array.from(this.reassembly);
    this.reassembly = [];
    const keys = parseRequestKeys(req);
    const response = this.buildKlvResponse(keys);
    const frame = new Uint8Array(response.length + 1);
    frame[0] = CONTROL_BYTE_COMPLETED;
    frame.set(response, 1);
    await this.emit(U.CHAR_READ_RESPONSE, frame);
  }

  private applyKlvWrites(payload: Uint8Array) {
    let i = 0;
    while (i + 3 <= payload.length) {
      const key = ((payload[i] << 8) | (payload[i + 1] & 0x7f)) as ControlKeys;
      const len = payload[i + 2];
      const value = payload.subarray(i + 3, i + 3 + len);
      if (key === ControlKeys.CurrentDimLevel || key === ControlKeys.DimLinear) {
        this.state.dimLevel = value[0] ?? this.state.dimLevel;
      } else if (key === ControlKeys.CCT && value.length >= 2) {
        this.state.cct = (value[0] << 8) | value[1];
      }
      i += 3 + len;
    }
  }

  private buildKlvResponse(keys: ControlKeys[]): Uint8Array {
    const parts: number[] = [];
    for (const key of keys) {
      let value: Uint8Array;
      if (key === ControlKeys.CCT) {
        value = new Uint8Array([(this.state.cct >> 8) & 0xff, this.state.cct & 0xff]);
      } else if (key === ControlKeys.CurrentDimLevel || key === ControlKeys.DimLinear) {
        value = new Uint8Array([this.state.dimLevel & 0xff]);
      } else {
        value = new Uint8Array(0);
      }
      for (const b of encodeKlv(key, value)) parts.push(b);
    }
    return Uint8Array.from(parts);
  }

  private async emit(characteristic: string, plaintextFrame: Uint8Array) {
    const cb = this.subscribers.get(characteristic);
    if (!cb) return;
    const enc = await this.encode!.process(plaintextFrame);
    cb(enc);
  }
}

/** Parse a request payload (2-byte big-endian keys, high bit = indexed). */
function parseRequestKeys(req: Uint8Array): ControlKeys[] {
  const keys: ControlKeys[] = [];
  for (let i = 0; i + 2 <= req.length; i += 2) {
    keys.push(((req[i] << 8) | (req[i + 1] & 0x7f)) as ControlKeys);
  }
  return keys;
}
