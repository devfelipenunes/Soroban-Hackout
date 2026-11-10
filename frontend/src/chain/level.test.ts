import { describe, expect, it, vi } from "vitest";
import { Account, Asset, type AssetType, Horizon, Keypair, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { amountToStroops, stroopsToAmount, portfolioFromAccount, prepareTokenTransfer, signAndSubmitTokenTransfer, TransferSubmissionError, type TransferGateway, type WalletAccount } from "./account.tsx";
import { PASSPHRASE } from "./network.ts";

import { readCompletion, readLevel, createInstanceGate, type CoreReads, type ReadCall } from "./level.ts";

type Call<T> = ReadCall<T> & { signAndSend(): Promise<never> };

function readCall<T>(result: T): Call<T> {
  return {
    result,
    signAndSend: () => {
      throw new Error(
        "a read call was signed and sent. Core read calls are simulations — " +
          "the prepared call already carries the answer in `.result`",
      );
    },
  };
}

function fakeCore(options: {
  instances?: readonly string[];
  completed?: boolean;
  accessible?: boolean;
  asked?: { player: string; level_id: number }[];
  failWith?: Error;
}): CoreReads {
  const asked = options.asked ?? [];

  return {
    instances: async (input) => {
      asked.push(input);
      if (options.failWith) throw options.failWith;
      return readCall(options.instances ?? []);
    },
    is_completed: async (input) => {
      asked.push(input);
      if (options.failWith) throw options.failWith;
      return readCall(options.completed ?? false);
    },
    can_access: async (input) => {
      asked.push(input);
      if (options.failWith) throw options.failWith;
      return readCall(options.accessible ?? true);
    },
  };
}

describe("readLevel", () => {
  it("answers without ever signing or sending the read call", async () => {
    const reads = await readLevel(fakeCore({ instances: ["CAAA"], completed: true }), "GAAA", 0);

    expect(reads).toEqual({ instance: "CAAA", completed: true, accessible: true });
  });

  it("answers with the instance the player created last", async () => {
    const core = fakeCore({ instances: ["CFIRST", "CSECOND", "CTHIRD"] });

    expect((await readLevel(core, "GAAA", 1)).instance).toBe("CTHIRD");
  });

  it("answers with no instance when the player has none of this level", async () => {
    expect((await readLevel(fakeCore({ instances: [] }), "GAAA", 2)).instance).toBeNull();
  });

  it("carries the core's verdict on whether the level is completed", async () => {
    const done = await readLevel(fakeCore({ completed: true }), "GAAA", 0);
    const notDone = await readLevel(fakeCore({ completed: false }), "GAAA", 0);

    expect(done.completed).toBe(true);
    expect(notDone.completed).toBe(false);
    expect((await readLevel(fakeCore({ accessible: false }), "GAAA", 0)).accessible).toBe(false);
  });

  it("asks about the player and the level it was handed", async () => {
    const asked: { player: string; level_id: number }[] = [];

    await readLevel(fakeCore({ asked }), "GPLAYER", 2);

    expect(asked).toEqual([
      { player: "GPLAYER", level_id: 2 },
      { player: "GPLAYER", level_id: 2 },
      { player: "GPLAYER", level_id: 2 },
    ]);
  });

  it("lets a failed read reach the caller instead of swallowing it", async () => {
    const core = fakeCore({ failWith: new Error("the rpc refused") });

    await expect(readLevel(core, "GAAA", 0)).rejects.toThrow("the rpc refused");
  });

  it("reads only the verdict when the caller only needs completion", async () => {
    const asked: { player: string; level_id: number }[] = [];

    await expect(readCompletion(fakeCore({ completed: true, asked }), "GAAA", 3)).resolves.toBe(true);
    expect(asked).toEqual([{ player: "GAAA", level_id: 3 }]);
  });

  it("retries a transient read and then answers", async () => {
    let calls = 0;
    const client: CoreReads = {
      instances: async () => {
        calls += 1;
        if (calls === 1) throw new Error("502");
        return readCall(["CAAA"]);
      },
      is_completed: async () => readCall(false),
      can_access: async () => readCall(true),
    };

    const reads = await readLevel(client, "GAAA", 0);

    expect(reads.instance).toBe("CAAA");
    expect(calls).toBe(2);
  });
});

describe("the instance gate", () => {
  it("discards a read that started before a new instance", () => {
    const gate = createInstanceGate();
    const readVersion = gate.version();

    gate.bump();

    expect(gate.isCurrent(readVersion)).toBe(false);
    expect(gate.isCurrent(gate.version())).toBe(true);
  });
});



describe("carteira testnet do dispositivo", () => {
  const source = Keypair.random();
  const destination = Keypair.random();
  const issuer = Keypair.random();
  const nativeBalance = (balance = "10.0000000", selling = "0.0000000"): Horizon.HorizonApi.BalanceLineNative => ({
    asset_type: "native" as AssetType.native, balance,
    buying_liabilities: "0.0000000", selling_liabilities: selling,
  });
  const creditBalance = (authorized = true): Horizon.HorizonApi.BalanceLineAsset => ({
    asset_type: "credit_alphanum4" as AssetType.credit4,
    asset_code: "USD", asset_issuer: issuer.publicKey(), balance: "20.0000000",
    buying_liabilities: "0.0000000", selling_liabilities: "2.0000000",
    limit: "1000.0000000", last_modified_ledger: 1, is_authorized: authorized,
    is_authorized_to_maintain_liabilities: false, is_clawback_enabled: false,
  });
  const walletAccount = (address: string, balances: Horizon.HorizonApi.BalanceLine[] = [nativeBalance()]): WalletAccount => Object.assign(new Account(address, "1"), {
    balances, subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
  });
  const hex = (transaction: Transaction): string => Array.from(transaction.hash(), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const gateway = (): TransferGateway => ({
    account: vi.fn(async (address: string) => walletAccount(address)),
    reserve: vi.fn(async () => 5_000_000n), fee: vi.fn(async () => "100"),
    checkMemo: vi.fn(async () => {}), submit: vi.fn(async (transaction: Transaction) => ({ hash: hex(transaction) })),
  });
  const input = () => ({ source: source.publicKey(), destination: destination.publicKey(), assetId: "native", amount: "1,25" });
  const signer = () => ({
    signTransaction: vi.fn(async (xdr: string) => { const transaction = TransactionBuilder.fromXDR(xdr, PASSPHRASE); if (!(transaction instanceof Transaction)) throw new Error("Unexpected fee bump"); transaction.sign(source); return transaction.toXDR(); }),
    signAuthEntry: vi.fn(async () => "unused"),
  });

  it("preserves stroops without rounding, including a decimal comma", () => {
    expect(amountToStroops("0.0000001")).toBe(1n);
    expect(amountToStroops("1,2500000")).toBe(12_500_000n);
    expect(stroopsToAmount(12_500_001n)).toBe("1.2500001");
    expect(stroopsToAmount(0n)).toBe("0");
    for (const value of ["1e3", "-1", "+1", "1.00000001", "NaN", "Infinity", "1,2,3", "922337203686"]) expect(() => amountToStroops(value)).toThrow();
  });
  it("deducts reserve, sponsorship and selling liabilities from the available balance", () => {
    const account = walletAccount(source.publicKey(), [nativeBalance("10.0000000", "1.0000000"), creditBalance()]);
    const sponsored = { ...account, accountId: () => source.publicKey(), sequenceNumber: () => "1", incrementSequenceNumber: () => {}, subentry_count: 2, num_sponsoring: 1, num_sponsored: 1 };
    const portfolio = portfolioFromAccount(sponsored, 5_000_000n);
    expect(portfolio.reserve).toBe("2");
    expect(portfolio.assets.map((asset) => asset.available)).toEqual(["7", "18"]);
  });
  it("prepares an exact testnet payment with a reviewable destination, memo and fee", async () => {
    const network = gateway();
    const prepared = await prepareTokenTransfer({ ...input(), memo: { type: "id", value: "42" } }, network);
    const transaction = TransactionBuilder.fromXDR(prepared.xdr, PASSPHRASE);
    expect(transaction).toBeInstanceOf(Transaction);
    if (!(transaction instanceof Transaction)) throw new Error("Expected transaction");
    expect(transaction.source).toBe(source.publicKey());
    expect(transaction.operations).toMatchObject([{ type: "payment", destination: destination.publicKey(), amount: "1.2500000" }]);
    expect(prepared.amount).toBe("1.25"); expect(prepared.fee).toBe("0.00001");
    expect(transaction.memo.type).toBe("id");
    expect(network.checkMemo).toHaveBeenCalledOnce();
    expect(network.submit).not.toHaveBeenCalled();
  });
  it("rejects zero, an invalid address, a self-transfer and an overlong multibyte memo before querying the network", async () => {
    const network = gateway();
    await expect(prepareTokenTransfer({ ...input(), amount: "0" }, network)).rejects.toMatchObject({ code: "amount" });
    await expect(prepareTokenTransfer({ ...input(), destination: "not-an-address" }, network)).rejects.toMatchObject({ code: "address" });
    await expect(prepareTokenTransfer({ ...input(), destination: source.publicKey() }, network)).rejects.toMatchObject({ code: "sameAddress" });
    await expect(prepareTokenTransfer({ ...input(), memo: { type: "text", value: "á".repeat(15) } }, network)).rejects.toMatchObject({ code: "memo" });
    expect(network.account).not.toHaveBeenCalled();
  });
  it("does not allow spending the minimum reserve or the fee", async () => {
    const network = gateway();
    await expect(prepareTokenTransfer({ ...input(), amount: "9" }, network)).rejects.toMatchObject({ code: "reserve" });
    await expect(prepareTokenTransfer({ ...input(), amount: "8.99999" }, network)).resolves.toMatchObject({ amount: "8.99999" });
    expect(network.submit).not.toHaveBeenCalled();
  });
  it("requires an authorized trustline at the destination and preserves the receiving limit", async () => {
    const network = gateway();
    network.account = vi.fn(async (address) => walletAccount(address, address === source.publicKey() ? [nativeBalance(), creditBalance()] : [nativeBalance()]));
    await expect(prepareTokenTransfer({ ...input(), assetId: `USD:${issuer.publicKey()}` }, network)).rejects.toMatchObject({ code: "trustline" });
    network.account = vi.fn(async (address) => walletAccount(address, [nativeBalance(), { ...creditBalance(), ...(address === destination.publicKey() ? { limit: "20.5" } : {}) }]));
    await expect(prepareTokenTransfer({ ...input(), assetId: `USD:${issuer.publicKey()}` }, network)).rejects.toMatchObject({ code: "trustlineLimit" });
    expect(network.submit).not.toHaveBeenCalled();
  });
  it("signs and submits only the envelope that was reviewed", async () => {
    const network = gateway(); const wallet = signer();
    const prepared = await prepareTokenTransfer(input(), network);
    await expect(signAndSubmitTokenTransfer(prepared, wallet, () => true, network)).resolves.toBe(prepared.hash);
    expect(wallet.signTransaction).toHaveBeenCalledOnce();
    expect(network.submit).toHaveBeenCalledOnce();
    const transaction = vi.mocked(network.submit).mock.calls[0]?.[0];
    expect(transaction?.signatures).toHaveLength(1);
  });
  it("does not send if the wallet changes during signing", async () => {
    const network = gateway(); const wallet = signer(); const prepared = await prepareTokenTransfer(input(), network);
    let current = true; const sign = wallet.signTransaction;
    wallet.signTransaction = vi.fn(async (xdr) => { const signed = await sign(xdr); current = false; return signed; });
    await expect(signAndSubmitTokenTransfer(prepared, wallet, () => current, network)).rejects.toMatchObject({ code: "accountChanged" });
    expect(network.submit).not.toHaveBeenCalled();
  });
  it("rejects an envelope changed by the signing integration", async () => {
    const network = gateway(); const prepared = await prepareTokenTransfer(input(), network);
    const changed = new TransactionBuilder(new Account(source.publicKey(), "1"), { fee: "100", networkPassphrase: PASSPHRASE }).addOperation(Operation.payment({ destination: destination.publicKey(), asset: Asset.native(), amount: "2" })).setTimeout(180).build();
    const wallet = { signTransaction: vi.fn(async () => changed.toXDR()), signAuthEntry: vi.fn(async () => "unused") };
    await expect(signAndSubmitTokenTransfer(prepared, wallet, () => true, network)).rejects.toMatchObject({ code: "changedTransaction" });
    expect(network.submit).not.toHaveBeenCalled();
  });
  it("preserves the hash when a submission is unconfirmed and does not retry on its own", async () => {
    const network = gateway(); const prepared = await prepareTokenTransfer(input(), network);
    network.submit = vi.fn(async () => { throw new Error("network timeout"); });
    const failure = await signAndSubmitTokenTransfer(prepared, signer(), () => true, network).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TransferSubmissionError);
    expect(failure).toMatchObject({ hash: prepared.hash });
    expect(network.submit).toHaveBeenCalledOnce();
  });
});
