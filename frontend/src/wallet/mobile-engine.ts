import { isMobileGameplayDevice } from "../platform/viewport.ts";
import type { WalletEngine } from "./engine.ts";
import { realEngine } from "./real-engine.ts";

let passkeyModule: Promise<typeof import("./passkey-engine.ts")> | null = null;
let connectionKind: "stellar" | "passkey" | null = null;
function loadPasskeyModule(): Promise<typeof import("./passkey-engine.ts")> {
  passkeyModule ??= import("./passkey-engine.ts");
  return passkeyModule;
}

export const mobileWalletEngine: WalletEngine = {
  ...realEngine,
  connect: async () => {
    const connected = await realEngine.connect();
    connectionKind = "stellar";
    return connected;
  },
  createPasskey: async () => {
    const connected = await (await loadPasskeyModule()).createPasskeyWallet();
    connectionKind = "passkey";
    return connected;
  },
  connectPasskey: async () => {
    const connected = await (await loadPasskeyModule()).connectPasskeyWallet();
    connectionKind = "passkey";
    return connected;
  },
  disconnect: async () => {
    const kind = connectionKind;
    connectionKind = null;
    if (kind === "passkey" && passkeyModule) {
      await (await passkeyModule).disconnectPasskeyWallet();
    } else if (kind === "stellar") {
      await realEngine.disconnect();
    }
  },
};

export function walletEngineForViewport(): WalletEngine {
  return isMobileGameplayDevice() ? mobileWalletEngine : realEngine;
}
