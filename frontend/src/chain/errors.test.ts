import { describe, expect, it } from "vitest";

import {
  ERR_ACCESS_LOCKED,
  ERR_OBJECTIVE_NOT_MET,
  contractErrorCode,
  errorKey,
  reasonOf,
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
});
