import deployments from "../../../deployments.json";
import sandboxDeployments from "../../../deployments.sandbox.json";
import type { Level } from "../levels/index.ts";

type ContractRecord = {
  id?: string | undefined;
  wasm_hash?: string | undefined;
};

type Deployments = {
  network: string;
  contracts: Record<string, ContractRecord | undefined> & { breaker_core: { id: string } };
};

const profile = import.meta.env["VITE_DEPLOYMENT_PROFILE"] as string | undefined;

export const DEPLOYMENT_PROFILE = profile === "sandbox" ? "sandbox" : "play";

const selectedDeployments: Deployments = DEPLOYMENT_PROFILE === "sandbox"
  ? sandboxDeployments
  : deployments;

export const RPC_URL: string =
  (import.meta.env["VITE_RPC_URL"] as string | undefined) ??
  "https://soroban-testnet.stellar.org";

export const NETWORK: string = selectedDeployments.network;

export const PASSPHRASE = "Test SDF Network ; September 2015";

export const CORE_ID: string = selectedDeployments.contracts.breaker_core.id;

export const SEASON_ID: string | undefined =
  selectedDeployments.contracts["breaker_season"]?.id;

const pad = (id: number) => String(id).padStart(2, "0");

export function auxId(level: Level): string | undefined {
  if (level.aux === undefined) return undefined;

  const key = `breaker_level_${pad(level.id)}_${level.aux}`;
  const contracts = selectedDeployments.contracts as Record<string, { id?: string } | undefined>;
  return contracts[key]?.id;
}


export const HORIZON_URL = "https://horizon-testnet.stellar.org";
