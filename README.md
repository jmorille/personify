# Personify — app web de pilotage d'environnement

App Next.js (App Router, TS, Tailwind, shadcn/ui) qui pilote des nœuds d'éclairage
**Acuity LocalConnect** en **Bluetooth (Web Bluetooth)**, en réimplémentant le
protocole reverse-engineeré de l'app `com.acuitybrands.pca` (« Personify »).

Le protocole a été reverse-engineeré depuis l'app Android Acuity PCA ; la spec
détaillée est conservée en privé (hors de ce dépôt).

## Ce qui est réel vs simulé

- **Éclairage** : commandes **réelles** LocalConnect — handshake **ECDH P-256 →
  AES-128-CTR**, trames **KLV** chiffrées (`CurrentDimLevel`, `CCT`, `Identify`).
  Testé de bout en bout contre un simulateur qui exécute le côté device.
- **Climat & scènes** : **simulés** en mémoire (le protocole WRC/UniTouch derrière
  la partie CVC/stores n'a pas été reconstitué — nécessite un device pour le reverse).

⚠️ Aucun matériel réel n'a été disponible pour valider les trames sur un vrai
appareil. Le code est fidèle au binaire décompilé et vérifié par tests, mais le
pilotage d'un vrai luminaire reste à confirmer sur device.

## Lancer

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # 17 tests (KLV, framing, ECDH/AES-CTR, KEK, e2e chiffré)
pnpm build
```

- **Démo (simulateur)** : fonctionne partout, sans matériel.
- **Connecter en Bluetooth** : nécessite **Chrome/Edge desktop ou Chrome Android**
  (Web Bluetooth), servi en **HTTPS** ou `localhost`. Pas d'iOS/Safari/Firefox.

## Architecture

```
src/lib/ble/
  klv.ts          # KLV (ControlKeys / KLVPacket / RequestPacket)
  framing.ts      # découpage MTU + octet de contrôle
  security.ts     # ECDH P-256, SHA-256, AES-128-CTR, KEK passcode
  localconnect.ts # LocalConnectSession : handshake + commandes haut niveau
  link.ts         # interface GATT commune
  webble.ts       # transport Web Bluetooth (navigateur)
  simulator.ts    # device simulé (côté périphérique, chiffrement complet)
  uuids.ts        # UUIDs GATT LocalConnect
src/lib/store.ts  # état applicatif (zustand)
src/components/   # UI (cartes éclairage / climat / scènes)
```

## Prochaines étapes

- Valider les trames sur un **vrai contrôleur LocalConnect** (ajuster l'échelle de
  gradation 0–255 vs %, et l'`assetId+acuityOrgId` réel comme passcode).
- Reverser le protocole **WRC/UniTouch** (CVC/stores) sur un device réel, puis
  brancher un adaptateur derrière l'UI Climat/Scènes déjà en place.
