"use client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isWebBluetoothAvailable } from "@/lib/ble/webble";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export function ConnectBar() {
  const { mode, status, deviceName, error, connectSimulator, connectBle, disconnect } = useApp();
  // Web Bluetooth availability is static per session; false on the server so the
  // initial render matches, then the real value on the client (no hydration flash).
  const bleOk = useSyncExternalStore(noopSubscribe, isWebBluetoothAvailable, () => false);

  const connected = status === "connected";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            connected ? "bg-emerald-500" : status === "connecting" ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/40"
          }`}
        />
        <div>
          <div className="text-sm font-medium">
            {connected ? deviceName : status === "connecting" ? "Connexion…" : "Non connecté"}
          </div>
          <div className="text-xs text-muted-foreground">
            {connected ? (mode === "ble" ? "Bluetooth réel (LocalConnect)" : "Simulateur — protocole réel de bout en bout") : "Choisis une source pour piloter l'éclairage"}
          </div>
        </div>
        {mode === "ble" && connected && <Badge variant="secondary">BLE</Badge>}
        {mode === "simulator" && connected && <Badge variant="outline">SIMULÉ</Badge>}
      </div>

      <div className="flex items-center gap-2">
        {!connected ? (
          <>
            <Button
              variant="default"
              size="sm"
              disabled={!bleOk || status === "connecting"}
              onClick={() => connectBle(new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2]))}
              title={bleOk ? "Scanner un vrai appareil" : "Web Bluetooth indisponible"}
            >
              Connecter en Bluetooth
            </Button>
            <Button variant="outline" size="sm" disabled={status === "connecting"} onClick={connectSimulator}>
              Démo (simulateur)
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={disconnect}>
            Déconnecter
          </Button>
        )}
      </div>

      {error && <div className="w-full text-xs text-red-500 sm:w-auto">{error}</div>}
    </div>
  );
}
