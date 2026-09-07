import { describe, it, expect } from "vitest";
import { frameWriteList, CONTROL_BYTE_COMPLETED, DEFAULT_MTU } from "./framing";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("frameWriteList edge cases", () => {
  it("emits one completed frame (control 0, no payload) for an empty payload", () => {
    const frames = frameWriteList(new Uint8Array(0), 247);
    expect(frames).toHaveLength(1);
    expect(hex(frames[0])).toBe("00");
    expect(frames[0][0]).toBe(CONTROL_BYTE_COMPLETED);
  });

  it("keeps a payload of exactly (mtu-1) bytes in a single frame", () => {
    const payload = Uint8Array.from({ length: 4 }, (_, i) => i + 1); // mtu=5 -> chunk 4
    const frames = frameWriteList(payload, 5);
    expect(frames).toHaveLength(1);
    expect(hex(frames[0])).toBe("0001020304");
  });

  it("splits into two frames when payload is (mtu-1)+1 bytes", () => {
    const payload = Uint8Array.from({ length: 5 }, (_, i) => i + 1); // mtu=5 -> 4 + 1
    const frames = frameWriteList(payload, 5);
    expect(frames.map(hex)).toEqual(["0101020304", "0005"]);
  });

  it("defaults to a 247 MTU (246-byte chunks)", () => {
    const payload = new Uint8Array(246 * 2); // exactly two full chunks
    const frames = frameWriteList(payload); // default mtu
    expect(DEFAULT_MTU).toBe(247);
    expect(frames).toHaveLength(2);
    expect(frames[0][0]).toBe(1);
    expect(frames[1][0]).toBe(0);
    expect(frames[0].length).toBe(247); // control byte + 246 chunk
  });

  it("throws when mtu is too small to carry any payload byte", () => {
    expect(() => frameWriteList(new Uint8Array([1]), 1)).toThrow();
  });
});
