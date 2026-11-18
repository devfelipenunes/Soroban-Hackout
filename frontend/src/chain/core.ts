import type { Signer } from "../wallet/engine.ts";
import { Client, contract } from "../contracts/breaker_core/src/index.ts";
import { rpc } from "@stellar/stellar-sdk";
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

export async function deployAuxiliary(
  wasmHash: string,
  address: string,
  signer: Signer,
): Promise<string> {
  const transaction = await contract.Client.deploy(null, {
    wasmHash,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: signer.transactionSource ?? address,
    ...callbacks(signer),
  });
  const deployed = await transaction.signAndSend();
  const client = deployed.result as { options?: { contractId?: unknown } } | undefined;
  const contractId = client?.options?.contractId;
  if (typeof contractId !== "string") {
    throw new Error("The decoder deployment did not return a contract address.");
  }
  return contractId;
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
  const server = new rpc.Server(RPC_URL);
  const simulate = server.simulateTransaction.bind(server);
  server.simulateTransaction = async (...args) => {
    const result = await simulate(...args);
    if (!rpc.Api.isSimulationError(result)) return result;

    const messages = result.events
      .flatMap((event) => stringsIn(event.toJson()))
      .filter((value) => /panic/i.test(value));
    if (messages.length === 0) return result;
    return { ...result, error: `${result.error}\n${messages.join("\n")}` };
  };

  const client = await contract.Client.from({
    contractId: instance,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    server,
    publicKey: signer.transactionSource ?? address,
    ...callbacks(signer),
  });

  return client as unknown as InstanceClient;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}
