"use client";
/**
 * App state. Lighting is driven through the real reverse-engineered
 * LocalConnectSession — the only difference between "simulator" and "ble" mode is
 * the GattLink underneath (SimulatedLuminaire vs Web Bluetooth). HVAC and scenes
 * are simulated in-store (the WRC/UniTouch protocol behind them is not reversed).
 */
import { create } from "zustand";
import { LocalConnectSession } from "./ble/localconnect";
import { SimulatedLuminaire } from "./ble/simulator";
import { WebBluetoothLink } from "./ble/webble";
import { pctToByte, byteToPct } from "./ble/scale";

export type Mode = "disconnected" | "simulator" | "ble";
export type ConnStatus = "idle" | "connecting" | "connected" | "error";

export interface LightState {
  on: boolean;
  level: number; // 0-100 %
  cct: number; // Kelvin
}
export type HvacMode = "off" | "heat" | "cool" | "auto";
export interface HvacState {
  setpoint: number; // °C
  ambient: number; // °C (read-only-ish)
  mode: HvacMode;
  fan: 0 | 1 | 2 | 3; // off / low / med / high
}
export interface Scene {
  id: string;
  name: string;
  emoji: string;
  light: Partial<LightState>;
  hvac?: Partial<HvacState>;
}

interface AppState {
  mode: Mode;
  status: ConnStatus;
  deviceName: string;
  error?: string;
  light: LightState;
  hvac: HvacState;
  scenes: Scene[];
  activeScene?: string;

  connectSimulator: () => Promise<void>;
  connectBle: (passcode: Uint8Array) => Promise<void>;
  disconnect: () => void;

  setPower: (on: boolean) => Promise<void>;
  setLevel: (level: number) => Promise<void>;
  setCct: (kelvin: number) => Promise<void>;
  identify: () => Promise<void>;

  setHvac: (patch: Partial<HvacState>) => void;
  recallScene: (id: string) => Promise<void>;
}

// Non-serializable transport kept out of React state.
let session: LocalConnectSession | null = null;
let bleLink: WebBluetoothLink | null = null;
let lastLevel = 80;

// LocalConnect handshake material (assetId + acuityOrgId). For the demo we use a
// fixed value; a real deployment reads it from the device / provisioning data.
const DEMO_PASSCODE = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02]);

const DEFAULT_SCENES: Scene[] = [
  { id: "morning", name: "Matin", emoji: "🌅", light: { on: true, level: 70, cct: 4000 }, hvac: { setpoint: 21, mode: "heat" } },
  { id: "work", name: "Travail", emoji: "💼", light: { on: true, level: 100, cct: 5000 }, hvac: { setpoint: 22, mode: "auto" } },
  { id: "relax", name: "Détente", emoji: "🛋️", light: { on: true, level: 35, cct: 2700 }, hvac: { setpoint: 23, mode: "auto" } },
  { id: "night", name: "Nuit", emoji: "🌙", light: { on: false, level: 0, cct: 2200 }, hvac: { setpoint: 19, mode: "off" } },
];

export const useApp = create<AppState>((set, get) => ({
  mode: "disconnected",
  status: "idle",
  deviceName: "",
  light: { on: false, level: 80, cct: 3000 },
  hvac: { setpoint: 21, ambient: 21, mode: "auto", fan: 1 },
  scenes: DEFAULT_SCENES,

  connectSimulator: async () => {
    set({ status: "connecting", error: undefined });
    try {
      const sim = new SimulatedLuminaire({ passcode: DEMO_PASSCODE, dimLevel: pctToByte(80), cct: 3000 });
      session = new LocalConnectSession(sim.link, { passcode: DEMO_PASSCODE });
      await session.connect();
      const level = byteToPct(await session.readDimLevel());
      const cct = await session.readCct();
      set({
        mode: "simulator",
        status: "connected",
        deviceName: "Luminaire simulé",
        light: { on: level > 0, level, cct },
      });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  connectBle: async (passcode: Uint8Array) => {
    set({ status: "connecting", error: undefined });
    try {
      bleLink = await WebBluetoothLink.request();
      session = new LocalConnectSession(bleLink, { passcode });
      await session.connect();
      const level = byteToPct(await session.readDimLevel());
      const cct = await session.readCct();
      set({
        mode: "ble",
        status: "connected",
        deviceName: bleLink.name,
        light: { on: level > 0, level, cct },
      });
    } catch (e) {
      set({ status: "error", error: humanizeError(e) });
    }
  },

  disconnect: () => {
    bleLink?.disconnect();
    bleLink = null;
    session = null;
    set({ mode: "disconnected", status: "idle", deviceName: "" });
  },

  setPower: async (on: boolean) => {
    const { light } = get();
    if (on) lastLevel = light.level || lastLevel;
    const targetPct = on ? lastLevel : 0;
    await session?.setDimLevel(pctToByte(targetPct));
    set({ light: { ...light, on, level: on ? lastLevel : light.level } });
  },

  setLevel: async (level: number) => {
    lastLevel = level;
    await session?.setDimLevel(pctToByte(level));
    set((s) => ({ light: { ...s.light, level, on: level > 0 } }));
  },

  setCct: async (kelvin: number) => {
    await session?.setCct(kelvin);
    set((s) => ({ light: { ...s.light, cct: kelvin } }));
  },

  identify: async () => {
    await session?.identify();
  },

  setHvac: (patch) => set((s) => ({ hvac: { ...s.hvac, ...patch } })),

  recallScene: async (id) => {
    const scene = get().scenes.find((sc) => sc.id === id);
    if (!scene) return;
    const l = scene.light;
    if (l.level !== undefined) {
      lastLevel = l.level || lastLevel;
      await session?.setDimLevel(pctToByte(l.level));
    }
    if (l.cct !== undefined) await session?.setCct(l.cct);
    set((s) => ({
      activeScene: id,
      light: { ...s.light, ...l, on: l.on ?? (l.level ?? 0) > 0 } as LightState,
      hvac: scene.hvac ? { ...s.hvac, ...scene.hvac } : s.hvac,
    }));
  },
}));

function humanizeError(e: unknown): string {
  const msg = String(e);
  if (msg.includes("User cancelled") || msg.includes("cancelled")) return "Sélection annulée.";
  if (msg.includes("not available")) return "Web Bluetooth indisponible (utilise Chrome/Edge ou Android).";
  return msg;
}
