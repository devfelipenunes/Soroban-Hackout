
import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec } from "@stellar/stellar-sdk/contract";
import type {
  AssembledTransaction,
  ClientOptions as ContractClientOptions,
  MethodOptions,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {

  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CABJCBXGO4BWD4EJALQNZ4ZO3X7OOLC6F42G4QGWEG34UJ3IWCB3W2HA",
  }
} as const

export const Errors = {
  1: {message:"LevelNotFound"},
  2: {message:"UnknownInstance"},
  3: {message:"AlreadyCompleted"},
  4: {message:"ObjectiveNotMet"},
  5: {message:"NotInitialised"}
}


export interface LevelInfo {
  validator: string;
  wasm_hash: Buffer;
}




export interface Client {



  levels: (options?: MethodOptions) => Promise<AssembledTransaction<Array<u32>>>




  instances: ({player, level_id}: {player: string, level_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>




  level_info: ({level_id}: {level_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<LevelInfo>>




  is_completed: ({player, level_id}: {player: string, level_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>




  set_validator: ({level_id, validator}: {level_id: u32, validator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>




  set_wasm_hash: ({level_id, wasm_hash}: {level_id: u32, wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>




  register_level: ({level_id, wasm_hash, validator}: {level_id: u32, wasm_hash: Buffer, validator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>




  create_instance: ({player, level_id}: {player: string, level_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>




  submit_instance: ({instance}: {instance: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(

        {admin}: {admin: string},

    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {

        wasmHash: Buffer | string;

        salt?: Buffer | Uint8Array;

        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAAAAAAAANTGV2ZWxOb3RGb3VuZAAAAAAAAAEAAAAAAAAAD1Vua25vd25JbnN0YW5jZQAAAAACAAAAAAAAABBBbHJlYWR5Q29tcGxldGVkAAAAAwAAAAAAAAAPT2JqZWN0aXZlTm90TWV0AAAAAAQAAAAAAAAADk5vdEluaXRpYWxpc2VkAAAAAAAF",
        "AAAAAQAAAAAAAAAAAAAACUxldmVsSW5mbwAAAAAAAAIAAAAAAAAACXZhbGlkYXRvcgAAAAAAABMAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAg",
        "AAAABQAAAAAAAAAAAAAAC1dhc21IYXNoU2V0AAAAAAEAAAANd2FzbV9oYXNoX3NldAAAAAAAAAIAAAAAAAAACGxldmVsX2lkAAAABAAAAAEAAAAAAAAACXdhc21faGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFZhbGlkYXRvclNldAAAAAEAAAANdmFsaWRhdG9yX3NldAAAAAAAAAIAAAAAAAAACGxldmVsX2lkAAAABAAAAAEAAAAAAAAACXZhbGlkYXRvcgAAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0xldmVsUmVnaXN0ZXJlZAAAAAABAAAAEGxldmVsX3JlZ2lzdGVyZWQAAAACAAAAAAAAAAhsZXZlbF9pZAAAAAQAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAAAAAAAAAAAAAGbGV2ZWxzAAAAAAAAAAAAAQAAA+oAAAAE",
        "AAAAAAAAAAAAAAAJaW5zdGFuY2VzAAAAAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAhsZXZlbF9pZAAAAAQAAAABAAAD6gAAABM=",
        "AAAAAAAAAAAAAAAKbGV2ZWxfaW5mbwAAAAAAAQAAAAAAAAAIbGV2ZWxfaWQAAAAEAAAAAQAAB9AAAAAJTGV2ZWxJbmZvAAAA",
        "AAAAAAAAAAAAAAAMaXNfY29tcGxldGVkAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAhsZXZlbF9pZAAAAAQAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANc2V0X3ZhbGlkYXRvcgAAAAAAAAIAAAAAAAAACGxldmVsX2lkAAAABAAAAAAAAAAJdmFsaWRhdG9yAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANc2V0X3dhc21faGFzaAAAAAAAAAIAAAAAAAAACGxldmVsX2lkAAAABAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAOcmVnaXN0ZXJfbGV2ZWwAAAAAAAMAAAAAAAAACGxldmVsX2lkAAAABAAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAACXZhbGlkYXRvcgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAPY3JlYXRlX2luc3RhbmNlAAAAAAIAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAIbGV2ZWxfaWQAAAAEAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAPc3VibWl0X2luc3RhbmNlAAAAAAEAAAAAAAAACGluc3RhbmNlAAAAEwAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    levels: this.txFromJSON<Array<u32>>,
        instances: this.txFromJSON<Array<string>>,
        level_info: this.txFromJSON<LevelInfo>,
        is_completed: this.txFromJSON<boolean>,
        set_validator: this.txFromJSON<null>,
        set_wasm_hash: this.txFromJSON<null>,
        register_level: this.txFromJSON<null>,
        create_instance: this.txFromJSON<string>,
        submit_instance: this.txFromJSON<null>
  }
}
