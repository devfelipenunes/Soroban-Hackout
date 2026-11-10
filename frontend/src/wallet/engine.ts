export type Signer = {
  signTransaction: (xdr: string) => Promise<string>;
  signAuthEntry: (xdr: string) => Promise<string>;
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

  testOnly?: boolean;
};
