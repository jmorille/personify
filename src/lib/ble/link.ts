/**
 * GATT-level link abstraction shared by the Web Bluetooth transport and the
 * in-memory simulator. Characteristic-oriented, mirroring the operations
 * LocalConnectBleLink performs on Android.
 */
export interface GattLink {
  read(service: string, characteristic: string): Promise<Uint8Array>;
  writeWithAck(service: string, characteristic: string, data: Uint8Array): Promise<void>;
  writeNoResponse(service: string, characteristic: string, data: Uint8Array): Promise<void>;
  /** Subscribe to indications/notifications on a characteristic. */
  subscribe(
    service: string,
    characteristic: string,
    onValue: (data: Uint8Array) => void,
  ): Promise<void>;
}
