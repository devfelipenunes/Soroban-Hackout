import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { reasonOf } from "../chain/errors.ts";
import { WalletSelectionCancelled, type Connected, type Signer, type WalletEngine } from "./engine.ts";

export type WalletState =
  | { phase: "checking" }
  | { phase: "no-extension" }
  | { phase: "disconnected" }
  | { phase: "incompatible"; wallet: string }
  | { phase: "wrong-network"; address: string }
  | { phase: "network-unverified"; address: string }
  | { phase: "connected"; address: string; transactionSource: string; walletKind: "stellar" | "passkey" }
  | { phase: "failed"; reason: string };

export type Wallet = {
  state: WalletState;
  address: string | null;
  signer: Signer | null;
  walletKind: "stellar" | "passkey" | null;
  testOnly: boolean;
  connect: () => Promise<void>;
  createPasskey: (() => Promise<void>) | null;
  connectPasskey: (() => Promise<void>) | null;
  disconnect: () => Promise<void>;
  reverify: () => Promise<void>;
};

const Context = createContext<Wallet | null>(null);

export function WalletProvider({
  engine,
  children,
}: {
  engine: WalletEngine;
  children: ReactNode;
}) {
  const [state, setState] = useState<WalletState>({ phase: "checking" });
  const [signer, setSigner] = useState<Signer | null>(null);

  const reverify = useCallback(async () => {
    setState({ phase: "checking" });
    setSigner(null);

    try {
      const d = await engine.detect();

      if (d.kind === "no-extension") {
        setState({ phase: "no-extension" });
      } else if (d.kind === "incompatible") {
        setState({ phase: "incompatible", wallet: d.wallet });
      } else {
        setState({ phase: "disconnected" });
      }
    } catch (error) {
      setState({ phase: "failed", reason: reasonOf(error) });
    }
  }, [engine]);

  useEffect(() => {
    void reverify();
  }, [reverify]);

  const connect = useCallback(async () => {
    setState({ phase: "checking" });

    try {
      const c = await engine.connect();

      if (c.rightNetwork !== true) {
        setSigner(null);
        setState(c.rightNetwork === false
          ? { phase: "wrong-network", address: c.address }
          : { phase: "network-unverified", address: c.address });
        return;
      }

      setSigner(c.signer);
      setState({
        phase: "connected",
        address: c.address,
        transactionSource: c.signer.transactionSource ?? c.address,
        walletKind: c.walletKind ?? "stellar",
      });
    } catch (error) {
      if (error instanceof WalletSelectionCancelled) {
        setState({ phase: "disconnected" });
        return;
      }
      setState({ phase: "failed", reason: reasonOf(error) });
    }
  }, [engine]);

  const connectWith = useCallback(async (action: (() => Promise<Connected>) | undefined) => {
    if (!action) return;
    setState({ phase: "checking" });
    try {
      const c = await action();
      if (c.rightNetwork !== true) {
        setSigner(null);
        setState(c.rightNetwork === false
          ? { phase: "wrong-network", address: c.address }
          : { phase: "network-unverified", address: c.address });
        return;
      }
      setSigner(c.signer);
      setState({
        phase: "connected",
        address: c.address,
        transactionSource: c.signer.transactionSource ?? c.address,
        walletKind: c.walletKind ?? "stellar",
      });
    } catch (error) {
      setSigner(null);
      if (error instanceof WalletSelectionCancelled) {
        setState({ phase: "disconnected" });
        return;
      }
      setState({ phase: "failed", reason: reasonOf(error) });
    }
  }, []);

  const createPasskey = useCallback(
    () => connectWith(engine.createPasskey),
    [connectWith, engine],
  );
  const connectPasskey = useCallback(
    () => connectWith(engine.connectPasskey),
    [connectWith, engine],
  );

  const disconnect = useCallback(async () => {
    try {
      await engine.disconnect();
    } catch {
      void 0;
    }
    setSigner(null);
    setState({ phase: "disconnected" });
  }, [engine]);

  const value = useMemo<Wallet>(
    () => ({
      state,
      address: state.phase === "connected" ? state.address : null,
      signer,
      walletKind: state.phase === "connected" ? state.walletKind : null,
      testOnly: engine.testOnly === true,
      connect,
      createPasskey: engine.createPasskey ? createPasskey : null,
      connectPasskey: engine.connectPasskey ? connectPasskey : null,
      disconnect,
      reverify,
    }),
    [state, signer, engine, connect, createPasskey, connectPasskey, disconnect, reverify],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWallet(): Wallet {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useWallet() was called outside <WalletProvider>");
  }
  return value;
}
