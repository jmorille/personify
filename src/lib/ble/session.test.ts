import { describe, it, expect } from "vitest";
import { LocalConnectSession } from "./localconnect";
import { SimulatedLuminaire } from "./simulator";

describe("LocalConnectSession over a simulated luminaire (end-to-end, encrypted)", () => {
  const passcode = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2]); // assetId + acuityOrgId

  it("performs the ECDH handshake and controls dim level with encrypted frames", async () => {
    const sim = new SimulatedLuminaire({ passcode, dimLevel: 0, cct: 2700 });
    const session = new LocalConnectSession(sim.link, { passcode });

    await session.connect();
    expect(session.isConnected).toBe(true);

    await session.setDimLevel(50);
    expect(sim.state.dimLevel).toBe(50); // device actually applied the decrypted command

    const level = await session.readDimLevel();
    expect(level).toBe(50);
  });

  it("controls CCT as a 2-byte big-endian value", async () => {
    const sim = new SimulatedLuminaire({ passcode, dimLevel: 0, cct: 2700 });
    const session = new LocalConnectSession(sim.link, { passcode });
    await session.connect();

    await session.setCct(3500);
    expect(sim.state.cct).toBe(3500);
    expect(await session.readCct()).toBe(3500);
  });

  it("rejects control before a successful handshake", async () => {
    const sim = new SimulatedLuminaire({ passcode });
    const session = new LocalConnectSession(sim.link, { passcode });
    await expect(session.setDimLevel(10)).rejects.toThrow(/not connected/i);
  });
});
