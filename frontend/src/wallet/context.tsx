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
import { WalletSelectionCancelled, type Signer, type WalletEngine } from "./engine.ts";

export type WalletState =
  | { phase: "checking" }
  | { phase: "no-extension" }
  | { phase: "disconnected" }
  | { phase: "incompatible"; wallet: string }
  | { phase: "wrong-network"; address: string }
  | { phase: "network-unverified"; address: string }
  | { phase: "connected"; address: string }
  | { phase: "failed"; reason: string };

export type Wallet = {
  state: WalletState;
  address: string | null;
  signer: Signer | null;
  testOnly: boolean;
  connect: () => Promise<void>;
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
      setState({ phase: "connected", address: c.address });
    } catch (error) {
      if (error instanceof WalletSelectionCancelled) {
        setState({ phase: "disconnected" });
        return;
      }
      setState({ phase: "failed", reason: reasonOf(error) });
    }
  }, [engine]);

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
      testOnly: engine.testOnly === true,
      connect,
      disconnect,
      reverify,
    }),
    [state, signer, engine.testOnly, connect, disconnect, reverify],
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
