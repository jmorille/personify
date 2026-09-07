/**
 * LocalConnect BLE write framing.
 * Reverse-engineered from LocalConnectBleLink.LocalConnectWrite: the payload is
 * split into (MTU-1) byte chunks, each prefixed with a control byte equal to the
 * number of chunks still remaining (so the final chunk is prefixed with 0).
 * Encryption (AES-CTR) is applied per frame after this step, by the caller.
 */

export const CONTROL_BYTE_COMPLETED = 0;
export const CONTROL_BYTE_ERROR = 0xff;
export const DEFAULT_MTU = 247;

/** Split into (mtu-1) byte chunks, each prefixed with a decreasing control byte. */
export function frameWriteList(payload: Uint8Array, mtu: number = DEFAULT_MTU): Uint8Array[] {
  const chunkSize = mtu - 1;
  if (chunkSize < 1) throw new Error("mtu must be at least 2");

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < payload.length; i += chunkSize) {
    chunks.push(payload.subarray(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push(new Uint8Array(0));

  return chunks.map((chunk, idx) => {
    const control = chunks.length - 1 - idx;
    const frame = new Uint8Array(chunk.length + 1);
    frame[0] = control;
    frame.set(chunk, 1);
    return frame;
  });
}
