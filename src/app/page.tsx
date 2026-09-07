import { ConnectBar } from "@/components/connect-bar";
import { LightCard } from "@/components/light-card";
import { HvacCard } from "@/components/hvac-card";
import { ScenesCard } from "@/components/scenes-card";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Personify</h1>
        <p className="text-sm text-muted-foreground">
          Pilotage d&apos;environnement · protocole BLE LocalConnect (reverse-engineeré)
        </p>
      </header>

      <ConnectBar />

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <LightCard />
        <HvacCard />
      </div>
      <div className="mt-6">
        <ScenesCard />
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        Éclairage : commandes KLV chiffrées (ECDH P-256 → AES-128-CTR). Climat &amp; scènes :
        simulés (protocole WRC/UniTouch non reconstitué). Requiert Chrome/Edge ou Android pour le
        Bluetooth réel.
      </footer>
    </main>
  );
}
