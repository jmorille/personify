/**
 * Mapping between the UI dim percentage (0-100) and the 1-byte LocalConnect
 * CurrentDimLevel value (0-255). The exact device scale is unverified without
 * hardware; this is a linear approximation.
 */

export function pctToByte(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round((clamped * 255) / 100);
}

export function byteToPct(byte: number): number {
  return Math.round((byte * 100) / 255);
}
