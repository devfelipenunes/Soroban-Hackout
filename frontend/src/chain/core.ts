import type { Signer } from "../wallet/engine.ts";
import { Client, contract } from "../contracts/breaker_core/src/index.ts";
import { CORE_ID, PASSPHRASE, RPC_URL } from "./network.ts";

export type InstanceClient = {
  readonly spec: unknown;
} & Record<string, unknown>;

export function callbacks(signer: Signer): {
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>;
  signAuthEntry: (entryXdr: string) => Promise<{ signedAuthEntry: string }>;
} {
  return {
    signTransaction: async (xdr: string) => ({
      signedTxXdr: await signer.signTransaction(xdr),
    }),

    signAuthEntry: async (entryXdr: string) => ({
      signedAuthEntry: await signer.signAuthEntry(entryXdr),
    }),
  };
}

export function coreClient(address: string, signer: Signer): Client {
  return new Client({
    contractId: CORE_ID,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: signer.transactionSource ?? address,
    ...callbacks(signer),
  });
}

export type CoreReadClient = {
  instances(input: { player: string; level_id: number }): Promise<{ result: readonly string[] }>;
  is_completed(input: { player: string; level_id: number }): Promise<{ result: boolean }>;
  can_access(input: { player: string; level_id: number }): Promise<{ result: boolean }>;
};

let coreReaderPromise: Promise<CoreReadClient> | null = null;

export function coreReader(): Promise<CoreReadClient> {
  coreReaderPromise ??= contract.Client.from<CoreReadClient>({
    contractId: CORE_ID,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
  }).catch((error: unknown) => {
    coreReaderPromise = null;
    throw error;
  });
  return coreReaderPromise;
}

export async function instanceClient(
  instance: string,
  address: string,
  signer: Signer,
): Promise<InstanceClient> {
  const client = await contract.Client.from({
    contractId: instance,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: signer.transactionSource ?? address,
    ...callbacks(signer),
  });

  return client as unknown as InstanceClient;
}
