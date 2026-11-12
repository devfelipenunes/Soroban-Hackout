import { Address, BASE_FEE, Keypair, Operation, Transaction, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { IndexedDBStorage, SmartAccountKit } from "smart-account-kit";

import { PASSPHRASE, RPC_URL } from "../chain/network.ts";
import type { Connected, Signer } from "./engine.ts";

export const PASSKEY_DEPLOYMENT = {
  accountWasmHash: "c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1",
  acceptedWasmHashes: [
    "c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1",
    "203e2970d9fed24fb5fca2e0aeebb3c1e4648b76dd6601567178e6474c9fec6f",
    "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
  ],
  acceptedBirthWasmHashes: [
    "c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1",
    "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
  ],
  webauthnVerifier: "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F",
  contextRuleIds: [0],
};
const POLL_INTERVAL_MS = 1_000;
const POLL_ATTEMPTS = 20;
const FUNDING_ATTEMPTS = 3;
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const server = new rpc.Server(RPC_URL);
const credentialStorage = new IndexedDBStorage();
export type PasskeyStep =
  | "credential"
  | "funding"
  | "deploying"
  | "connecting";

function reportPasskeyStep(step: PasskeyStep): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("breaker:passkey-step", { detail: { step } }),
  );
}

let kit: SmartAccountKit | null = null;
let feePayer: Keypair | null = null;
let feePayerPromise: Promise<Keypair> | null = null;

function getKit(): SmartAccountKit {
  kit ??= new SmartAccountKit({
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    accountWasmHash: PASSKEY_DEPLOYMENT.accountWasmHash,
    acceptedWasmHashes: PASSKEY_DEPLOYMENT.acceptedWasmHashes,
    acceptedBirthWasmHashes: PASSKEY_DEPLOYMENT.acceptedBirthWasmHashes,
    webauthnVerifierAddress: PASSKEY_DEPLOYMENT.webauthnVerifier,
    rpName: "BREAKER",
    storage: credentialStorage,
  });
  return kit;
}

export async function assertPasskeyEnvironment(requirePlatformAuthenticator = true): Promise<void> {
  if (PASSPHRASE !== TESTNET_PASSPHRASE) {
    throw new Error("Passkey wallets in this prototype are restricted to Stellar Testnet.");
  }
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("Passkeys require a secure HTTPS connection (localhost is supported for development).");
  }
  if (window.location.hostname === "127.0.0.1") {
    throw new Error("Use http://localhost for local passkey testing, or open BREAKER on an HTTPS domain on mobile.");
  }
  if (!navigator.credentials || typeof PublicKeyCredential === "undefined") {
    throw new Error("This browser does not support passkeys. Connect a Stellar wallet to continue.");
  }
  const platformAuthenticatorAvailable =
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function" &&
    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
      () => false,
    );
  if (requirePlatformAuthenticator && !platformAuthenticatorAvailable) {
    throw new Error(
      "This browser did not find an on-device passkey for this site. Try a supported browser over HTTPS with a device screen lock, or connect a Stellar wallet.",
    );
  }
}

async function getFeePayer(): Promise<Keypair> {
  if (feePayer) return feePayer;
  feePayerPromise ??= createFeePayer();
  try {
    feePayer = await feePayerPromise;
    return feePayer;
  } catch (error) {
    feePayerPromise = null;
    throw error;
  }
}

async function createFeePayer(): Promise<Keypair> {
  // Prototype-only payer: test XLM key stays in memory and is never persisted.
  const candidate = Keypair.random();
  try {
    await fundFeePayer(candidate.publicKey());
  } catch (error) {
    throw new Error(
      "Could not fund the Testnet fee payer. Try again in a moment.",
      { cause: error },
    );
  }
  return candidate;
}

export function isTransientFundingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|not[_ ]?found|timeout|timed out|econn|5\d\d/i.test(message);
}

async function fundFeePayer(address: string): Promise<void> {
  for (let attempt = 0; attempt < FUNDING_ATTEMPTS; attempt += 1) {
    try {
      await server.fundAddress(address);
      return;
    } catch (error) {
      if (await accountExists(address)) return;
      if (!isTransientFundingError(error) || attempt === FUNDING_ATTEMPTS - 1) {
        throw error;
      }
      await wait(1_000 * 2 ** attempt);
    }
  }
}

async function accountExists(address: string): Promise<boolean> {
  try {
    await server.getAccount(address);
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addPasskeyAuthorization(
  xdrBase64: string,
  activeKit: SmartAccountKit,
  walletAddress: string,
): Promise<string> {
  const envelope = xdr.TransactionEnvelope.fromXDR(xdrBase64, "base64");
  if (envelope.type !== "envelopeTypeTx") {
    throw new Error("The passkey transaction must use a standard Stellar envelope.");
  }

  let signedCount = 0;
  const transaction = envelope.v1.tx;
  const operations = await Promise.all(transaction.operations.map(async (operation) => {
    if (operation.body.type !== "invokeHostFunction") return operation;
    const hostFunction = operation.body.invokeHostFunctionOp;
    const signedEntries: xdr.SorobanAuthorizationEntry[] = [];
    for (const entry of hostFunction.auth) {
      const credentials = entry.credentials;
      const addressCredentials = credentials.type === "sorobanCredentialsAddress"
        ? credentials.address
        : credentials.type === "sorobanCredentialsAddressV2"
          ? credentials.addressV2
          : undefined;
      if (!addressCredentials) {
        signedEntries.push(entry);
        continue;
      }

      const address = Address.fromScAddress(addressCredentials.address).toString();
      if (address !== walletAddress) {
        signedEntries.push(entry);
        continue;
      }

      const signedXdr = await activeKit.signAuthEntry(entry.toXDR("base64"), {
        contextRuleIds: PASSKEY_DEPLOYMENT.contextRuleIds,
      });
      if (typeof signedXdr !== "string") {
        throw new Error("The passkey signer returned an unsupported authorization format.");
      }
      signedEntries.push(xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, "base64"));
      signedCount += 1;
    }
    return new xdr.Operation({
      sourceAccount: operation.sourceAccount,
      body: xdr.OperationBody.invokeHostFunction(
        new xdr.InvokeHostFunctionOp({
          hostFunction: hostFunction.hostFunction,
          auth: signedEntries,
        }),
      ),
    });
  }));

  // Public contract calls can legitimately have no address authorization.
  // The fee payer still signs the assembled transaction below; only require
  // a passkey signature when the contract actually requests wallet auth.
  if (signedCount === 0) return xdrBase64;
  const updatedTransaction = new xdr.Transaction({
    sourceAccount: transaction.sourceAccount,
    fee: transaction.fee,
    seqNum: transaction.seqNum,
    cond: transaction.cond,
    memo: transaction.memo,
    operations,
    ext: transaction.ext,
  });
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({
      tx: updatedTransaction,
      signatures: envelope.v1.signatures,
    }),
  ).toXDR("base64");
}

async function prepareSignedTransaction(
  xdrBase64: string,
  payer: Keypair,
  passkey?: { kit: SmartAccountKit; address: string },
): Promise<Transaction> {
  const authorizedXdr = passkey
    ? await addPasskeyAuthorization(xdrBase64, passkey.kit, passkey.address)
    : xdrBase64;
  const transaction = TransactionBuilder.fromXdr(authorizedXdr, PASSPHRASE);
  if (!(transaction instanceof Transaction)) {
    throw new Error("The passkey transaction was not a standard Stellar transaction.");
  }

  const simulation = await server.simulateTransaction(transaction);
  if ("error" in simulation) throw new Error(simulation.error);

  const assembled = rpc.assembleTransaction(transaction, simulation).build();
  assembled.sign(payer);
  return assembled;
}

async function submitResimulated(
  xdrBase64: string,
  payer: Keypair,
): Promise<{ hash: string; ledger: number }> {
  const assembled = await prepareSignedTransaction(xdrBase64, payer);
  const response = await server.sendTransaction(assembled);
  if (response.status === "ERROR") throw new Error("The Testnet rejected the passkey transaction.");
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS);
    const result = await server.getTransaction(response.hash);
    if (result.status === "SUCCESS") return { hash: response.hash, ledger: result.ledger };
    if (result.status === "FAILED") throw new Error("The passkey transaction failed on Testnet.");
  }

  throw new Error(`The transaction is still pending on Testnet: ${response.hash}`);
}

async function submitWalletDeployment(
  funcXdr: string,
  authXdr: readonly string[],
  payer: Keypair,
): Promise<{ hash: string; ledger: number }> {
  const account = await server.getAccount(payer.publicKey());
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.fromXdr(funcXdr, "base64"),
        auth: authXdr.map((entry) => xdr.SorobanAuthorizationEntry.fromXdr(entry, "base64")),
      }),
    )
    .setTimeout(180)
    .build();

  return submitResimulated(transaction.toXdr(), payer);
}

function signerFor(activeKit: SmartAccountKit, payer: Keypair, walletAddress: string): Signer {
  return {
    transactionSource: payer.publicKey(),
    signAuthEntry: async (entryXdr) => {
      const signed = await activeKit.signAuthEntry(entryXdr, {
        contextRuleIds: PASSKEY_DEPLOYMENT.contextRuleIds,
      });
      if (typeof signed !== "string") {
        throw new Error("The passkey signer returned an unsupported authorization format.");
      }
      return signed;
    },
    signTransaction: async (transactionXdr) => {
      const transaction = TransactionBuilder.fromXdr(transactionXdr, PASSPHRASE);
      if (!(transaction instanceof Transaction)) {
        throw new Error("The passkey transaction was not a standard Stellar transaction.");
      }
      if (transaction.source !== payer.publicKey()) {
        throw new Error("The transaction fee payer changed before passkey signing.");
      }
      const signed = await prepareSignedTransaction(transactionXdr, payer, {
        kit: activeKit,
        address: walletAddress,
      });
      return signed.toXdr();
    },
  };
}

function connected(activeKit: SmartAccountKit, address: string, payer: Keypair): Connected {
  return {
    address,
    rightNetwork: true,
    walletKind: "passkey",
    signer: signerFor(activeKit, payer, address),
  };
}

export async function createPasskeyWallet(): Promise<Connected> {
  await assertPasskeyEnvironment();
  const activeKit = getKit();
  const payerPromise = getFeePayer();
  payerPromise.catch(() => {});
  reportPasskeyStep("credential");
  const pending = (await activeKit.credentials.getPending()).find(
    (credential) =>
      credential.nickname === "BREAKER Mobile" &&
      (credential.deploymentStatus === "pending" || credential.deploymentStatus === "failed"),
  );
  const created = pending
    ? {
        ...(await activeKit.credentials.deploy(pending.credentialId, { autoSubmit: false })),
        credentialId: pending.credentialId,
      }
    : await activeKit.createWallet("BREAKER", "Breaker Operator", {
        nickname: "BREAKER Mobile",
        autoSubmit: false,
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required" },
      });

  if (!created.relayerPayload) {
    throw new Error("The passkey wallet could not prepare its Testnet deployment.");
  }

  reportPasskeyStep("funding");
  const payer = await payerPromise;
  reportPasskeyStep("deploying");
  const deployment = await submitWalletDeployment(
    created.relayerPayload.func,
    created.relayerPayload.auth,
    payer,
  );
  if (!deployment.hash || !Number.isSafeInteger(deployment.ledger) || deployment.ledger < 1) {
    throw new Error("The passkey wallet deployment was not confirmed.");
  }

  // Seed the SDK's local birth candidate with the confirmed transaction facts.
  // connectWallet still verifies the immutable CreateContractV2 on-chain before
  // it accepts this wallet; this avoids depending on an indexer catching up.
  await credentialStorage.update(created.credentialId, {
    deploymentStatus: "deployed",
    deploymentTransactionHash: deployment.hash,
    creationTransactionHash: deployment.hash,
    creationLedger: deployment.ledger,
  });

  reportPasskeyStep("connecting");
  const session = await activeKit.connectWallet({
    contractId: created.contractId,
    credentialId: created.credentialId,
  });
  if (!session) throw new Error("The passkey wallet was deployed but could not be reconnected.");

  return connected(activeKit, session.contractId, payer);
}

export async function connectPasskeyWallet(): Promise<Connected> {
  await assertPasskeyEnvironment(false);
  const activeKit = getKit();
  const payerPromise = getFeePayer();
  payerPromise.catch(() => {});
  reportPasskeyStep("credential");
  const session = await activeKit.connectWallet({ prompt: true });
  if (!session) throw new Error("No passkey wallet was found for this device.");

  reportPasskeyStep("funding");
  const payer = await payerPromise;
  reportPasskeyStep("connecting");
  return connected(activeKit, session.contractId, payer);
}

export async function disconnectPasskeyWallet(): Promise<void> {
  if (kit) await kit.disconnect();
  kit = null;
}
