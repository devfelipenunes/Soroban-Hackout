import { contract } from "../contracts/breaker_core/src/index.ts";
import type { Signer } from "../wallet/engine.ts";
import { callbacks } from "./core.ts";
import { PASSPHRASE, RPC_URL, SEASON_ID } from "./network.ts";

export type SeasonClient = {
  claim: (args: { player: string }) => Promise<{
    signAndSend: () => Promise<{ result: unknown }>;
  }>;
  has_claimed: (args: { player: string }) => Promise<{ result: unknown }>;
  token_of: (args: { player: string }) => Promise<{ result: unknown }>;
  token_uri: (args: { token_id: number }) => Promise<{ result: unknown }>;
  balance: (args: { owner: string }) => Promise<{ result: unknown }>;
  owner_of: (args: { token_id: number }) => Promise<{ result: unknown }>;
};

export function hasSeasonContract(): boolean {
  return SEASON_ID !== undefined;
}

export async function seasonClient(address: string, signer: Signer): Promise<SeasonClient> {
  if (SEASON_ID === undefined) throw new Error("season contract is not deployed");

  const client = await contract.Client.from({
    contractId: SEASON_ID,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: address,
    ...callbacks(signer),
  });

  return client as unknown as SeasonClient;
}
