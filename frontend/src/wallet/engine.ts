export type Signer = {
  signTransaction: (xdr: string) => Promise<string>;
  signAuthEntry: (xdr: string) => Promise<string>;
  /** Account that pays transaction fees; may differ from the player's address. */
  transactionSource?: string;
};

export type Detection =
  | { kind: "no-extension" }
  | { kind: "available"; wallet: string }
  | { kind: "unchecked" }
  | { kind: "incompatible"; wallet: string };

export type Connected = {
  address: string;
  rightNetwork: boolean | null;
  signer: Signer;
  walletKind?: "stellar" | "passkey";
};

export class WalletSelectionCancelled extends Error {
  constructor() {
    super("The wallet selection was cancelled.");
    this.name = "WalletSelectionCancelled";
  }
}

export type WalletEngine = {
  detect: () => Promise<Detection>;
  connect: () => Promise<Connected>;
  disconnect: () => Promise<void>;
  createPasskey?: () => Promise<Connected>;
  connectPasskey?: () => Promise<Connected>;

  testOnly?: boolean;
};
