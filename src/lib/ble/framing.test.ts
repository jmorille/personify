import { describe, it, expect } from "vitest";
import { frameWriteList, CONTROL_BYTE_COMPLETED } from "./framing";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("frameWriteList", () => {
  it("emits a single frame with control byte 0 when payload fits one chunk", () => {
    const frames = frameWriteList(new Uint8Array([0xaa, 0xbb, 0xcc]), 247);
    expect(frames).toHaveLength(1);
    expect(hex(frames[0])).toBe("00aabbcc");
    expect(frames[0][0]).toBe(CONTROL_BYTE_COMPLETED);
  });

  it("chunks by (mtu-1) and prefixes a decreasing control byte ending at 0", () => {
    // mtu=5 -> chunk size 4; 9 bytes -> 3 chunks, control bytes 2,1,0
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const frames = frameWriteList(payload, 5);
    expect(frames.map(hex)).toEqual(["0201020304", "0105060708", "0009"]);
  });
});
