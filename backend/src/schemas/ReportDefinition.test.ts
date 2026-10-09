import { describe, expect, it } from 'vitest';
import { CreateReportDefinitionSchema as create, UpdateReportDefinitionSchema as update } from './ReportDefinition.js';

describe('Reports stage 1c parameters', () => {
  it('requires a custom field for grouping and defaults both stage 2a titles', () => {
    const range = { dateFrom: '2026-10-08', dateTo: '2026-10-09' };
    expect(create.parse({ type: 'sales_invoice_totals_by_item', ...range, title: ' ' }).title).toBe('Sales Invoice Totals by Item');
    const type = 'sales_invoice_totals_by_custom_field';
    for (const customFieldId of [undefined, null, '', 'foreign']) expect(create.safeParse({ type, ...range, customFieldId }).success).toBe(false);
    const stored = create.parse({ type, ...range, customFieldId: 'd9d9760c-38a1-4849-a646-4206022f03c1' });
    expect(stored.title).toBe('Sales Invoice Totals by Custom Field');
    expect(create.safeParse({ ...stored, dateFrom: '2026-10-10' }).success).toBe(false);
    expect(create.safeParse({ ...stored, ...update.parse({ customFieldId: null }) }).success).toBe(false);
    expect(create.parse({ ...stored, ...update.parse({ title: 'ZZ-Name' }) }).title).toBe('ZZ-Name');
  });
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
  it('validates partial edits after merging with the stored report type', () => {
    const stored = create.parse({ type: 'customer_summary', dateFrom: '2026-10-01', dateTo: '2026-10-07' });
    expect(create.parse({ ...stored, ...update.parse({ sortBy: 'ignored', asOfDate: 'ignored', accountingMethod: null }) }))
      .toMatchObject({ sortBy: null, asOfDate: null, accountingMethod: 'accrual' });
    expect(create.safeParse({ ...stored, ...update.parse({ dateFrom: '2026-10-08' }) }).success).toBe(false);
    expect(create.safeParse({ type: 'aged_payables', asOfDate: '2026-10-07', ...update.parse({ sortBy: 'foreign' }) }).success).toBe(false);
  });
});
