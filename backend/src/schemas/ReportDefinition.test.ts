import { describe, expect, it } from 'vitest';
import { CreateReportDefinitionSchema as create } from './ReportDefinition.js';

describe('Reports stage 1c parameters', () => {
  it('defaults aged title, accrual and sorting; requires a real as-of date', () => {
    const result = create.parse({ type: 'aged_payables', title: ' ', asOfDate: '2026-10-07', accountingMethod: 'cash' });
    expect(result).toMatchObject({ title: 'Aged Payables', accountingMethod: 'accrual', sortBy: 'total', showInvoices: false, dateFrom: null });
    expect(create.safeParse({ type: 'aged_payables', asOfDate: '2026-02-30' }).success).toBe(false);
    expect(create.safeParse({ type: 'aged_payables', asOfDate: '2026-10-07', sortBy: 'other' }).success).toBe(false);
  });
  it('requires ordered ranges for both summaries and ignores display fields', () => {
    for (const type of ['customer_summary', 'supplier_summary']) {
      expect(create.safeParse({ type, dateFrom: '2026-10-08', dateTo: '2026-10-07' }).success).toBe(false);
      expect(create.safeParse({ type, dateFrom: '2026-10-07' }).success).toBe(false);
      expect(create.parse({ type, dateFrom: '2026-10-01', dateTo: '2026-10-07', footer: 'ignored', showAccountCodes: true }))
        .toMatchObject({ footer: null, showAccountCodes: false, asOfDate: null });
    }
    expect(create.safeParse({ type: 'customer_balance', dateFrom: '2026-10-01', dateTo: '2026-10-07' }).success).toBe(false);
  });
});
