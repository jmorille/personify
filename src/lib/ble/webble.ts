/**
 * Web Bluetooth implementation of GattLink. Browser-only (Chrome/Edge/Android).
 * Thin adapter over navigator.bluetooth — the protocol logic lives in
 * LocalConnectSession; this only moves bytes to/from GATT characteristics.
 */
import { GattLink } from "./link";
import * as U from "./uuids";

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export class WebBluetoothLink implements GattLink {
  private constructor(
    private device: BluetoothDevice,
    private server: BluetoothRemoteGATTServer,
  ) {}

  get name(): string {
    return this.device.name ?? "Unknown device";
  }

  onDisconnected(cb: () => void) {
    this.device.addEventListener("gattserverdisconnected", cb);
  }

  /** Prompt the user to pick a LocalConnect device and connect its GATT server. */
  static async request(): Promise<WebBluetoothLink> {
    if (!isWebBluetoothAvailable()) {
      throw new Error("Web Bluetooth n'est pas disponible dans ce navigateur.");
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [U.LOCALCONNECT_SERVICE] }, { services: [U.KEY_EXCHANGE_SERVICE] }],
      optionalServices: [U.KEY_EXCHANGE_SERVICE, U.LOCALCONNECT_SERVICE],
    });
    const server = await device.gatt!.connect();
    return new WebBluetoothLink(device, server);
  }

  private async char(service: string, characteristic: string) {
    const svc = await this.server.getPrimaryService(service);
    return svc.getCharacteristic(characteristic);
  }

  async read(service: string, characteristic: string): Promise<Uint8Array> {
    const c = await this.char(service, characteristic);
    const view = await c.readValue();
    return new Uint8Array(view.buffer);
  }

  async writeWithAck(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    const c = await this.char(service, characteristic);
    await c.writeValueWithResponse(data as unknown as BufferSource);
  }

  async writeNoResponse(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    const c = await this.char(service, characteristic);
    await c.writeValueWithoutResponse(data as unknown as BufferSource);
  }

  async subscribe(
    service: string,
    characteristic: string,
    onValue: (data: Uint8Array) => void,
  ): Promise<void> {
    const c = await this.char(service, characteristic);
    c.addEventListener("characteristicvaluechanged", (ev) => {
      const view = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (view) onValue(new Uint8Array(view.buffer));
    });
    await c.startNotifications();
  }

  disconnect() {
    if (this.server.connected) this.server.disconnect();
  }
}
