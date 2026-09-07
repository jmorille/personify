/**
 * LocalConnect KLV (Key-Length-Value) encoding.
 * Reverse-engineered from AcuityBrands.LocalConnect.Sdk.Packets.KLVPacket /
 * RequestPacket (see docs/PROTOCOL.md).
 */

/** Subset of AcuityBrands.LocalConnect.Sdk.Enums.ControlKeys (ushort). */
export enum ControlKeys {
  AssetId = 1,
  DeviceLabel = 7,
  Dim0 = 9,
  CurrentDimLevel = 28,
  AssetState = 53,
  AmbientLight = 54,
  Command1 = 59,
  Notifications = 60,
  FirmwareVersion = 64,
  CCT = 96,
  DimLinear = 194,
}

/** AcuityBrands.LocalConnect.Sdk.Enums.Commands. */
export enum Commands {
  RestoreFactoryDefaults = 1,
  Identify = 2,
  LatchData = 4,
  RevertToLuminaireControl = 8,
}

/** ControlKey as 2-byte big-endian. */
function keyBytes(controlKey: ControlKeys): [number, number] {
  return [(controlKey >> 8) & 0xff, controlKey & 0xff];
}

/**
 * Encode a single KLV: [key:2 BE][len:1][payload].
 * When `driverIndex` is provided, sets the high bit of the 2nd key byte and
 * inserts the driver index between the key and the length.
 */
export function encodeKlv(
  controlKey: ControlKeys,
  payload: Uint8Array,
  driverIndex?: number,
): Uint8Array {
  const [b0, b1] = keyBytes(controlKey);
  const head: number[] = [b0, b1];
  if (driverIndex !== undefined) {
    head[1] = b1 | 0x80;
    head.push(driverIndex & 0xff);
  }
  head.push(payload.length & 0xff);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head, 0);
  out.set(payload, head.length);
  return out;
}

/** Encode a device command as a Command1 KLV carrying the 1-byte command code. */
export function encodeCommand(command: Commands): Uint8Array {
  return encodeKlv(ControlKeys.Command1, new Uint8Array([command]));
}

/** Encode a read request: concatenated 2-byte big-endian control keys. */
export function encodeRequest(controlKeys: ControlKeys[]): Uint8Array {
  const out = new Uint8Array(controlKeys.length * 2);
  controlKeys.forEach((k, i) => {
    const [b0, b1] = keyBytes(k);
    out[i * 2] = b0;
    out[i * 2 + 1] = b1;
  });
  return out;
}
