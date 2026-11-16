import type { WalletEngine } from "./engine.ts";

let passkeyModule: Promise<typeof import("./passkey-engine.ts")> | null = null;
function loadPasskeyModule(): Promise<typeof import("./passkey-engine.ts")> {
  passkeyModule ??= import("./passkey-engine.ts");
  return passkeyModule;
}

const connectPasskey = async () =>
  (await loadPasskeyModule()).connectPasskeyWallet();

export const mobileWalletEngine: WalletEngine = {
  detect: async () => ({ kind: "unchecked" }),
  connect: connectPasskey,
  createPasskey: async () => (await loadPasskeyModule()).createPasskeyWallet(),
  connectPasskey,
  disconnect: async () => {
    if (passkeyModule) {
      await (await passkeyModule).disconnectPasskeyWallet();
    }
  },
};
