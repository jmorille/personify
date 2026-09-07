import { describe, it, expect } from "vitest";
import { ControlKeys, Commands, encodeKlv, encodeCommand, encodeRequest } from "./klv";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("encodeKlv", () => {
  it("encodes a control key as 2-byte big-endian, length, then payload", () => {
    // CurrentDimLevel = 28 (0x001C), payload = [0x64] (100%)
    const out = encodeKlv(ControlKeys.CurrentDimLevel, new Uint8Array([0x64]));
    expect(hex(out)).toBe("001c0164");
  });

  it("encodes CCT (96 = 0x0060) with a 2-byte payload", () => {
    const out = encodeKlv(ControlKeys.CCT, new Uint8Array([0x0f, 0xa0]));
    expect(hex(out)).toBe("0060020fa0");
  });

  it("sets the high bit of the second key byte and inserts driverIndex when indexed", () => {
    // CurrentDimLevel indexed on driver 2: key byte1 |= 0x80 -> 0x9C, then driverIndex, then len, payload
    const out = encodeKlv(ControlKeys.CurrentDimLevel, new Uint8Array([0x64]), 2);
    expect(hex(out)).toBe("009c020164");
  });
});

describe("encodeCommand", () => {
  it("wraps a command code in a Command1 KLV", () => {
    // Command1 = 59 (0x003B), payload = [Identify=2]
    const out = encodeCommand(Commands.Identify);
    expect(hex(out)).toBe("003b0102");
  });
});

describe("encodeRequest", () => {
  it("concatenates control keys as 2-byte big-endian values", () => {
    const out = encodeRequest([ControlKeys.CurrentDimLevel, ControlKeys.CCT]);
    expect(hex(out)).toBe("001c0060");
  });
});
