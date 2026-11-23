import { describe, expect, it } from "vitest";

import {
  ERR_ACCESS_LOCKED,
  ERR_OBJECTIVE_NOT_MET,
  contractErrorCode,
  contractReason,
  errorKey,
  reasonOf,
  vmTrapReason,
} from "./errors.ts";

describe("contract errors", () => {
  it("reads the code from the SDK error text", () => {
    expect(contractErrorCode(new Error("Error(Contract, #6)"))).toBe(6);
    expect(contractErrorCode("Error(Contract, #4)")).toBe(4);
    expect(contractErrorCode(new Error("network"))).toBeNull();
  });

  it("maps every core code to a message key", () => {
    expect(errorKey(ERR_ACCESS_LOCKED)).toBe("error.accessLocked");
    expect(errorKey(ERR_OBJECTIVE_NOT_MET)).toBe("error.objectiveNotMet");
    expect(errorKey(99)).toBeNull();
    expect(errorKey(null)).toBeNull();
  });

  it("keeps the reason of an object error", () => {
    expect(reasonOf({ message: "boom" })).toBe("boom");
  });

  it("names a contract error from the spec instead of hiding it", () => {
    const spec = {
      errorCases: () => [
        { name: "ChoiceOutOfRange", doc: "each choice must be below 4", value: 2 },
      ],
    };
    const failure = new Error('HostError: Error(Contract, #2)\n\nEvent log (newest first):');

    expect(contractReason(spec, failure)).toBe("ChoiceOutOfRange — each choice must be below 4");
    expect(contractReason(spec, new Error("Error(Contract, #9)"))).toBeNull();
    expect(contractReason(spec, new Error("network"))).toBeNull();
    expect(contractReason(undefined, failure)).toBeNull();
  });

  it("explains a VM trap, which carries no contract error", () => {
    const trap = new Error("HostError: Error(WasmVm, InvalidAction)\n\nEvent log (newest first):");

    expect(vmTrapReason(trap)).toContain("the VM aborted the call");
    expect(vmTrapReason(new Error("Error(Contract, #2)"))).toBeNull();
  });
});
