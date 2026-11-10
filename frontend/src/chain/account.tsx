import { Asset, Horizon, Keypair, Memo, NotFoundError, Operation, StrKey, Transaction, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useWallet } from "../wallet/context.tsx";
import { reasonOf } from "./errors.ts";
import { HORIZON_URL, PASSPHRASE, RPC_URL } from "./network.ts";
import type { Signer } from "../wallet/engine.ts";

export type FundingStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "funding" }
  | { phase: "ready" }
  | { phase: "failed"; reason: string };

type Value = {
  status: FundingStatus;
  ready: boolean;
  busy: boolean;
  fund: () => Promise<void>;
};

const Context = createContext<Value | null>(null);

const server = new rpc.Server(RPC_URL);

async function exists(address: string): Promise<boolean> {
  const accountId = Keypair.fromPublicKey(address).xdrPublicKey();
  const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId }));
  const { entries } = await server.getLedgerEntries(key);
  return entries.length === 1;
}

async function requestFromFriendbot(address: string): Promise<void> {
  await server.fundAddress(address);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { address, testOnly } = useWallet();
  const [status, setStatus] = useState<FundingStatus>({ phase: "idle" });

  useEffect(() => {
    if (testOnly) {
      setStatus({ phase: "ready" });
      return;
    }

    if (!address) {
      setStatus({ phase: "idle" });
      return;
    }

    let alive = true;

    void (async () => {
      setStatus({ phase: "checking" });

      try {
        if (await exists(address)) {
          if (alive) setStatus({ phase: "ready" });
          return;
        }

        if (alive) setStatus({ phase: "funding" });
        await requestFromFriendbot(address);
        if (alive) setStatus({ phase: "ready" });
      } catch (error) {
        if (alive) setStatus({ phase: "failed", reason: reasonOf(error) });
      }
    })();

    return () => {
      alive = false;
    };
  }, [address, testOnly]);

  const fund = useCallback(async () => {
    if (testOnly) return;
    if (!address) return;

    setStatus({ phase: "funding" });

    try {
      await requestFromFriendbot(address);
      setStatus({ phase: "ready" });
    } catch (error) {
      setStatus({ phase: "failed", reason: reasonOf(error) });
    }
  }, [address, testOnly]);

  const value = useMemo<Value>(
    () => ({
      status,
      ready: status.phase === "ready",
      busy: status.phase === "checking" || status.phase === "funding",
      fund,
    }),
    [status, fund],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAccount(): Value {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useAccount() was called outside <AccountProvider>");
  }
  return value;
}




export type WalletAccount = Pick<Horizon.AccountResponse,
  "accountId" | "sequenceNumber" | "incrementSequenceNumber" | "balances" |
  "subentry_count" | "num_sponsoring" | "num_sponsored">;
export type TransferGateway = {
  account: (address: string) => Promise<WalletAccount>;
  reserve: () => Promise<bigint>;
  fee: () => Promise<string>;
  checkMemo: (transaction: Transaction) => Promise<void>;
  submit: (transaction: Transaction) => Promise<{ hash: string }>;
};
const paymentServer = new Horizon.Server(HORIZON_URL);
export const transferGateway: TransferGateway = {
  account: (address) => paymentServer.loadAccount(address),
  reserve: async () => {
    const page = await paymentServer.ledgers().order("desc").limit(1).call();
    const reserve = page.records[0]?.base_reserve_in_stroops;
    if (reserve === undefined) throw new TokenTransferError("unavailable");
    return BigInt(reserve);
  },
  fee: async () => String(await paymentServer.fetchBaseFee()),
  checkMemo: (transaction) => paymentServer.checkMemoRequired(transaction),
  submit: (transaction) => paymentServer.submitTransaction(transaction),
};
export class TokenTransferError extends Error {
  constructor(readonly code: string) { super(code); this.name = "TokenTransferError"; }
}
export class TransferSubmissionError extends Error {
  constructor(readonly hash: string, readonly original: unknown) {
    super("submissionUnconfirmed"); this.name = "TransferSubmissionError";
  }
}
export function amountToStroops(value: string): bigint {
  const normalized = value.trim().replace(",", ".");
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(normalized)) throw new TokenTransferError("amount");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const result = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  if (result > 9_223_372_036_854_775_807n) throw new TokenTransferError("amount");
  return result;
}
export function stroopsToAmount(value: bigint): string {
  const fraction = String(value % 10_000_000n).padStart(7, "0").replace(/0+$/, "");
  return `${value / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}
export type TokenBalance = {
  id: string; code: string; issuer?: string; balance: string; available: string; authorized: boolean;
};
export type WalletPortfolio = { address: string; assets: TokenBalance[]; reserve: string };
export type WalletActivity = {
  id: string;
  hash?: string;
  type: string;
  createdAt: string;
  amount?: string;
  asset?: string;
  source: string;
  destination?: string;
};

export async function loadWalletHistory(address: string, limit = 8): Promise<WalletActivity[]> {
  const page = await paymentServer.operations().forAccount(address).limit(limit).order("desc").call();
  return page.records.map((record) => {
    const item = record as unknown as Record<string, unknown>;
    return {
      id: String(item.id ?? item.transaction_hash ?? crypto.randomUUID()),
      hash: typeof item.transaction_hash === "string" ? item.transaction_hash : undefined,
      type: String(item.type ?? "operation"),
      createdAt: String(item.created_at ?? ""),
      ...(typeof item.amount === "string" ? { amount: item.amount } : {}),
      ...(typeof item.asset_code === "string" ? { asset: item.asset_code } : { asset: "XLM" }),
      source: String(item.source_account ?? address),
      ...(typeof item.to === "string" ? { destination: item.to } : {}),
    };
  });
}
export function portfolioFromAccount(account: WalletAccount, baseReserve: bigint): WalletPortfolio {
  if (baseReserve < 0n) throw new TokenTransferError("unavailable");
  const reserveUnits = Math.max(0, 2 + account.subentry_count + account.num_sponsoring - account.num_sponsored);
  const reserve = BigInt(reserveUnits) * baseReserve;
  const assets: TokenBalance[] = [];
  for (const balance of account.balances) {
    if (balance.asset_type === "liquidity_pool_shares") continue;
    const native = balance.asset_type === "native";
    const total = amountToStroops(balance.balance);
    const locked = amountToStroops(balance.selling_liabilities) + (native ? reserve : 0n);
    assets.push({ id: native ? "native" : `${balance.asset_code}:${balance.asset_issuer}`,
      code: native ? "XLM" : balance.asset_code, ...(native ? {} : { issuer: balance.asset_issuer }),
      balance: balance.balance, available: stroopsToAmount(total > locked ? total - locked : 0n),
      authorized: native || balance.is_authorized,
    });
  }
  return { address: account.accountId(), assets, reserve: stroopsToAmount(reserve) };
}
export async function loadWalletPortfolio(address: string, gateway = transferGateway): Promise<WalletPortfolio> {
  const [account, reserve] = await Promise.all([gateway.account(address), gateway.reserve()]);
  return portfolioFromAccount(account, reserve);
}
export type TransferInput = {
  source: string; destination: string; assetId: string; amount: string;
  memo?: { type: "text" | "id"; value: string };
};
export type PreparedTransfer = {
  source: string; destination: string; asset: TokenBalance; amount: string;
  fee: string; memo: TransferInput["memo"]; xdr: string; hash: string;
};
function transactionHash(transaction: Transaction): string {
  return Array.from(transaction.hash(), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function prepareTokenTransfer(input: TransferInput, gateway = transferGateway): Promise<PreparedTransfer> {
  if (!StrKey.isValidEd25519PublicKey(input.source) || !StrKey.isValidEd25519PublicKey(input.destination)) throw new TokenTransferError("address");
  if (input.source === input.destination) throw new TokenTransferError("sameAddress");
  const units = amountToStroops(input.amount);
  if (units <= 0n) throw new TokenTransferError("amount");
  const memo = input.memo?.value ? input.memo : undefined;
  if (memo?.type === "text" && new TextEncoder().encode(memo.value).length > 28) throw new TokenTransferError("memo");
  if (memo?.type === "id" && (!/^\d+$/.test(memo.value) || BigInt(memo.value) > 18_446_744_073_709_551_615n)) throw new TokenTransferError("memo");
  const [source, destination, reserve, fee] = await Promise.all([
    gateway.account(input.source),
    gateway.account(input.destination).catch((error: unknown) => { if (error instanceof NotFoundError) throw new TokenTransferError("destinationMissing"); throw error; }),
    gateway.reserve(), gateway.fee(),
  ]);
  if (!/^\d+$/.test(fee) || BigInt(fee) <= 0n) throw new TokenTransferError("unavailable");
  const portfolio = portfolioFromAccount(source, reserve);
  const asset = portfolio.assets.find((entry) => entry.id === input.assetId);
  if (!asset || !asset.authorized) throw new TokenTransferError("asset");
  const native = portfolio.assets.find((entry) => entry.id === "native");
  if (!native || amountToStroops(native.available) < BigInt(fee) + (asset.id === "native" ? units : 0n)) throw new TokenTransferError("reserve");
  if (amountToStroops(asset.available) < units) throw new TokenTransferError("balance");
  if (asset.issuer && input.destination !== asset.issuer) {
    const trustline = destination.balances.find((line) => line.asset_type !== "native" && line.asset_type !== "liquidity_pool_shares" && line.asset_code === asset.code && line.asset_issuer === asset.issuer);
    if (!trustline || trustline.asset_type === "native" || trustline.asset_type === "liquidity_pool_shares" || !trustline.is_authorized) throw new TokenTransferError("trustline");
    if (amountToStroops(trustline.balance) + amountToStroops(trustline.buying_liabilities) + units > amountToStroops(trustline.limit)) throw new TokenTransferError("trustlineLimit");
  }
  const builder = new TransactionBuilder(source, { fee, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.payment({ destination: input.destination, asset: asset.issuer ? new Asset(asset.code, asset.issuer) : Asset.native(), amount: stroopsToAmount(units) }));
  if (memo) builder.addMemo(memo.type === "id" ? Memo.id(memo.value) : Memo.text(memo.value));
  const transaction = builder.setTimeout(180).build();
  await gateway.checkMemo(transaction);
  return { source: input.source, destination: input.destination, asset, amount: stroopsToAmount(units),
    fee: stroopsToAmount(BigInt(fee)), memo, xdr: transaction.toXDR(), hash: transactionHash(transaction) };
}
export async function signAndSubmitTokenTransfer(
  prepared: PreparedTransfer, signer: Signer, isCurrent: () => boolean, gateway = transferGateway,
): Promise<string> {
  if (!isCurrent()) throw new TokenTransferError("accountChanged");
  const original = TransactionBuilder.fromXDR(prepared.xdr, PASSPHRASE);
  if (!(original instanceof Transaction) || original.source !== prepared.source || transactionHash(original) !== prepared.hash) throw new TokenTransferError("changedTransaction");
  if (original.timeBounds && Number(original.timeBounds.maxTime) <= Math.floor(Date.now() / 1000)) throw new TokenTransferError("expired");
  const signedXdr = await signer.signTransaction(prepared.xdr);
  if (!isCurrent()) throw new TokenTransferError("accountChanged");
  const signed = TransactionBuilder.fromXDR(signedXdr, PASSPHRASE);
  if (!(signed instanceof Transaction) || transactionHash(signed) !== prepared.hash) throw new TokenTransferError("changedTransaction");
  try {
    const result = await gateway.submit(signed);
    if (result.hash !== prepared.hash) throw new TokenTransferError("changedTransaction");
    return result.hash;
  } catch (error) { throw new TransferSubmissionError(prepared.hash, error); }
}
