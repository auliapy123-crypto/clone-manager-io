import { describe, expect, it } from "vitest";
import { CreateExpenseClaimSchema, UpdateExpenseClaimSchema } from "./ExpenseClaim.js";
import { PaymentLineInputSchema } from "./Payment.js";
import { Permission, permissionsForRole } from "../constants/permissions.js";

const id = "11111111-1111-4111-8111-111111111111";
const claim = { date: "2026-09-20", payerContactId: id, lines: [{ accountId: id, amount: 350000 }] };

describe("Expense Claims input and reimbursement boundaries", () => {
  it("preserves omitted dates when updating only the payer", () => {
    expect(UpdateExpenseClaimSchema.parse({ payerContactId: id })).toEqual({ payerContactId: id });
  });
  it("requires a payer and at least one positive-cent line", () => {
    expect(CreateExpenseClaimSchema.safeParse(claim).success).toBe(true);
    expect(CreateExpenseClaimSchema.safeParse({ ...claim, payerContactId: undefined }).success).toBe(false);
    expect(CreateExpenseClaimSchema.safeParse({ ...claim, lines: [] }).success).toBe(false);
    for (const amount of [0, -1, 0.001, 1.001, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(CreateExpenseClaimSchema.safeParse({ ...claim, lines: [{ accountId: id, amount }] }).success).toBe(false);
    }
    expect(CreateExpenseClaimSchema.safeParse({ ...claim, date: "2026-02-30" }).success).toBe(false);
  });
  it("allows either reimbursement or AP allocations, never both", () => {
    const line = { accountId: id, amount: 0.29 };
    expect(PaymentLineInputSchema.safeParse({ ...line, expenseClaimId: id }).success).toBe(true);
    expect(PaymentLineInputSchema.safeParse({ ...line, purchaseInvoiceId: id }).success).toBe(true);
    expect(PaymentLineInputSchema.safeParse({ ...line, expenseClaimId: id, purchaseInvoiceId: id }).success).toBe(false);
    expect(PaymentLineInputSchema.safeParse({ ...line, expenseClaimId: null, purchaseInvoiceId: null }).success).toBe(true);
  });
  it("grants viewers read-only access and accountants/admins write/delete", () => {
    expect(permissionsForRole("viewer")).toContain(Permission.EXPENSE_CLAIM_READ);
    for (const permission of [Permission.EXPENSE_CLAIM_WRITE, Permission.EXPENSE_CLAIM_DELETE]) {
      expect(permissionsForRole("viewer")).not.toContain(permission);
      expect(permissionsForRole("accountant")).toContain(permission);
      expect(permissionsForRole("admin")).toContain(permission);
    }
  });
});
