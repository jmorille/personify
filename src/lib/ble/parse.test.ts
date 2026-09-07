import { describe, it, expect } from "vitest";
import { parseKlvList } from "./localconnect";
import { ControlKeys, encodeKlv, encodeRequest } from "./klv";

const bytes = (...xs: number[]) => Uint8Array.from(xs);
const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("parseKlvList", () => {
  it("round-trips multiple encoded KLV entries into a key->payload map", () => {
    const body = Uint8Array.from([
      ...encodeKlv(ControlKeys.CurrentDimLevel, bytes(0x32)),
      ...encodeKlv(ControlKeys.CCT, bytes(0x0d, 0xac)),
    ]);
    const map = parseKlvList(body);
    expect(hex(map.get(ControlKeys.CurrentDimLevel)!)).toBe("32");
    expect(hex(map.get(ControlKeys.CCT)!)).toBe("0dac");
    expect(map.size).toBe(2);
  });

  it("handles a zero-length (error) entry followed by a normal entry", () => {
    // CurrentDimLevel with length 0 (error/empty), then CCT with 2-byte payload
    const body = Uint8Array.from([
      0x00,
      ControlKeys.CurrentDimLevel,
      0x00,
      ...encodeKlv(ControlKeys.CCT, bytes(0x10, 0x00)),
    ]);
    const map = parseKlvList(body);
    expect(hex(map.get(ControlKeys.CurrentDimLevel)!)).toBe("");
    expect(hex(map.get(ControlKeys.CCT)!)).toBe("1000");
  });

  it("masks the indexed-driver high bit back to the base key", () => {
    // CurrentDimLevel (0x001C) with the indexed high bit set on the 2nd byte
    // (0x1C -> 0x9C). parseKlvList must strip 0x80 and recover CurrentDimLevel.
    const indexed = encodeKlv(ControlKeys.CurrentDimLevel, bytes(0x40), 3);
    expect(indexed[1]).toBe(0x9c); // 0x1c | 0x80
    // Reshape to the non-indexed KLV layout parseKlvList consumes: key(2) len(1) payload
    const body = Uint8Array.from([indexed[0], indexed[1], 0x01, 0x40]);
    const map = parseKlvList(body);
    expect(map.has(ControlKeys.CurrentDimLevel)).toBe(true);
    expect(hex(map.get(ControlKeys.CurrentDimLevel)!)).toBe("40");
  });
});

describe("encodeRequest", () => {
  it("encodes several keys as consecutive 2-byte big-endian values", () => {
    const out = encodeRequest([
      ControlKeys.CurrentDimLevel,
      ControlKeys.CCT,
      ControlKeys.FirmwareVersion,
    ]);
    expect(hex(out)).toBe("001c00600040");
  });

  it("returns an empty buffer for no keys", () => {
    expect(encodeRequest([]).length).toBe(0);
  });
});
