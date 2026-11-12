import type { ModuleInterface } from "@creit.tech/stellar-wallets-kit/types";

import { PASSPHRASE } from "../chain/network.ts";
import {
  WalletSelectionCancelled,
  type Connected,
  type Detection,
  type Signer,
  type WalletEngine,
} from "./engine.ts";

type WalletKit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;
type WalletTheme = typeof import("@creit.tech/stellar-wallets-kit/types").SwkAppDarkTheme;
type KitNetworks = typeof import("@creit.tech/stellar-wallets-kit/types").Networks;
type LoadedWalletKit = {
  readonly kit: WalletKit;
  readonly theme: WalletTheme;
  readonly networks: KitNetworks;
  readonly modules: ModuleInterface[];
};

let kitPromise: Promise<LoadedWalletKit> | null = null;
function loadKit(): Promise<LoadedWalletKit> {
  kitPromise ??= Promise.all([
    import("@creit.tech/stellar-wallets-kit/sdk"),
    import("@creit.tech/stellar-wallets-kit/types"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/bitget"),
    import("@creit.tech/stellar-wallets-kit/modules/cactuslink"),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/hana"),
    import("@creit.tech/stellar-wallets-kit/modules/klever"),
    import("@creit.tech/stellar-wallets-kit/modules/onekey"),
    import("@creit.tech/stellar-wallets-kit/modules/rabet"),
    import("@creit.tech/stellar-wallets-kit/modules/scopuly"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
  ]).then(([sdk, types, albedo, bitget, cactusLink, freighter, hana, klever, oneKey, rabet, scopuly, xbull]) => ({
    kit: sdk.StellarWalletsKit,
    theme: types.SwkAppDarkTheme,
    networks: types.Networks,
    modules: [
      new freighter.FreighterModule(), new xbull.xBullModule(), new albedo.AlbedoModule(),
      new rabet.RabetModule(), new hana.HanaModule(), new klever.KleverModule(),
      new bitget.BitgetModule(), new oneKey.OneKeyModule(), new cactusLink.CactusLinkModule(),
      new scopuly.ScopulyModule(),
    ],
  }));
  return kitPromise;
}

async function select(): Promise<WalletKit> {
  const { kit, modules, theme, networks } = await loadKit();
  kit.init({ modules, theme, network: networks.TESTNET });
  return kit;
}

const INCOMPATIBLE: readonly { global: string; name: string }[] = [
  { global: "lobstr", name: "LOBSTR" },
];

function detectIncompatible(): string | null {
  if (typeof window === "undefined") return null;

  for (const c of INCOMPATIBLE) {
    if (c.global in window) return c.name;
  }
  return null;
}

function wasCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === -1
  );
}

function detectWallets(): Detection {
  const incompatible = detectIncompatible();
  if (incompatible) return { kind: "incompatible", wallet: incompatible };
  return { kind: "unchecked" };
}


function detect(): Promise<Detection> {
  return Promise.resolve(detectWallets());
}

async function connect(): Promise<Connected> {
  const kit = await select();

  let address: string;
  try {
    ({ address } = await kit.authModal());
  } catch (error) {
    if (wasCancelled(error)) throw new WalletSelectionCancelled();
    throw error;
  }

  let rightNetwork: boolean | null = null;
  try {
    const network = await kit.getNetwork();
    rightNetwork = network.networkPassphrase === PASSPHRASE;
  } catch {

  }

  const signer: Signer = {
    signTransaction: async (xdr) => {
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        networkPassphrase: PASSPHRASE,
        address,
      });
      return signedTxXdr;
    },

    signAuthEntry: async (entryXdr) => {
      const { signedAuthEntry } = await kit.signAuthEntry(entryXdr, {
        networkPassphrase: PASSPHRASE,
        address,
      });
      return signedAuthEntry;
    },
  };

  return { address: address, rightNetwork, signer };
}

async function disconnect(): Promise<void> {
  await (await select()).disconnect();
}

export const realEngine: WalletEngine = { detect, connect, disconnect };
