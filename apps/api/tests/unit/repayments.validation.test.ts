import { describe, expect, it } from "vitest";

import {
  createRepaymentSchema,
} from "../../src/modules/payroll/repayments.validation.js";

describe("createRepaymentSchema", () => {
  const validIOU = {
    employeeId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    type: "IOU",
    iouId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    amount: 5000,
    method: "CASH",
  };

  const validLoan = {
    employeeId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    type: "LOAN",
    loanId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    amount: 10000,
    method: "CASH",
  };

  it("accepts a valid IOU repayment", () => {
    expect(() => createRepaymentSchema.parse(validIOU)).not.toThrow();
  });

  it("accepts a valid loan repayment", () => {
    expect(() => createRepaymentSchema.parse(validLoan)).not.toThrow();
  });

  it("rejects an IOU repayment without iouId", () => {
    const { iouId: _iouId, ...payload } = validIOU;

    expect(() => createRepaymentSchema.parse(payload)).toThrow(
      "IOU repayment requires an iouId",
    );
  });

  it("rejects an IOU repayment that includes a loanId", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validIOU,
        loanId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      }),
    ).toThrow("IOU repayment cannot include a loanId");
  });

  it("rejects a loan repayment without loanId", () => {
    const { loanId: _loanId, ...payload } = validLoan;

    expect(() => createRepaymentSchema.parse(payload)).toThrow(
      "Loan repayment requires a loanId",
    );
  });

  it("rejects a loan repayment that includes an iouId", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validLoan,
        iouId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
    ).toThrow("Loan repayment cannot include an iouId");
  });

  it("rejects a zero repayment amount", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validIOU,
        amount: 0,
      }),
    ).toThrow();
  });

  it("rejects a fractional repayment amount", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validIOU,
        amount: 1000.5,
      }),
    ).toThrow();
  });

  it("rejects an invalid employeeId", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validIOU,
        employeeId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("rejects an invalid repayment method", () => {
    expect(() =>
      createRepaymentSchema.parse({
        ...validIOU,
        method: "INVALID",
      }),
    ).toThrow();
  });
});
