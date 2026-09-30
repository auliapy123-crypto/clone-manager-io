/**
 * BillableTimeEntryRepository — jam kerja yang ditagihkan (NON-POSTING).
 *
 * 1 tabel datar, TANPA baris item, TANPA logic jurnal sama sekali, dan
 * BERDIRI SENDIRI — TIDAK ADA relasi/imporm apa pun ke SalesInvoice*
 * (dokumen BillableTime.md §2.1, sengaja begitu di Manager.io asli).
 *
 * Field terhitung real-time (TIDAK disimpan sebagai kolom):
 * - amount = hourly_rate × (time_spent_minutes / 60) — dihitung dalam
 *   sen biar bebas drift floating point.
 * - status = SELALU "Uninvoiced" (statis, hardcoded di response —
 *   BUKAN hasil query relasi apa pun).
 *
 * employeeContactId = kontak mana pun di tabel contacts (TANPA flag
 * khusus) — reuse tabel yang sama, pola payerContactId Expense Claims.
 * Dua join ke contacts (customer + employee) → join employee WAJIB
 * pakai alias (pelajaran #1).
 */
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../db/index.js";
import { billableTimeEntries, contacts } from "../db/schema.js";

const employeeContacts = alias(contacts, "employee_contacts");

export interface BillableTimeEntryCreateInput {
  customerId: string;
  employeeContactId: string;
  date: string;
  description: string;
  hourlyRate: number;
  timeSpentMinutes: number;
}

export interface BillableTimeEntryUpdateInput {
  customerId?: string;
  employeeContactId?: string;
  date?: string;
  description?: string;
  hourlyRate?: number;
  timeSpentMinutes?: number;
}

export interface BillableTimeEntryListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export interface BillableTimeEntryRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  employeeContactId: string;
  employeeName: string;
  date: string;
  description: string;
  hourlyRate: number;
  timeSpentMinutes: number;
  amount: number;
  status: "Uninvoiced";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * amount dalam sen: rateCents × menit / 60 — pembulatan sekali di akhir
 * (6060 menit × 3.00 = 303.00 tepat, bebas drift floating point).
 */
function computeAmountCents(
  hourlyRate: string | number,
  timeSpentMinutes: number,
): number {
  const rateCents = Math.round(Number(hourlyRate) * 100);
  return Math.round((rateCents * timeSpentMinutes) / 60);
}

function toRecord(row: {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  employeeContactId: string;
  employeeName: string;
  date: string;
  description: string;
  hourlyRate: string;
  timeSpentMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}): BillableTimeEntryRecord {
  return {
    ...row,
    // Field numeric Postgres datang sebagai STRING dari driver — WAJIB
    // Number() eksplisit (pelajaran #2).
    hourlyRate: Number(row.hourlyRate),
    timeSpentMinutes: Number(row.timeSpentMinutes),
    amount: computeAmountCents(row.hourlyRate, row.timeSpentMinutes) / 100,
    status: "Uninvoiced",
  };
}

const selection = {
  id: billableTimeEntries.id,
  businessId: billableTimeEntries.businessId,
  customerId: billableTimeEntries.customerId,
  customerName: contacts.name,
  employeeContactId: billableTimeEntries.employeeContactId,
  employeeName: employeeContacts.name,
  date: billableTimeEntries.date,
  description: billableTimeEntries.description,
  hourlyRate: billableTimeEntries.hourlyRate,
  timeSpentMinutes: billableTimeEntries.timeSpentMinutes,
  createdAt: billableTimeEntries.createdAt,
  updatedAt: billableTimeEntries.updatedAt,
};

// ---------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------
export async function listBillableTimeEntries(
  businessId: string,
  opts: BillableTimeEntryListOptions,
): Promise<{ data: BillableTimeEntryRecord[]; total: number }> {
  const conditions = [
    eq(billableTimeEntries.businessId, businessId),
    isNull(billableTimeEntries.deletedAt),
  ];

  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(billableTimeEntries.description, pattern),
        ilike(contacts.name, pattern),
        ilike(employeeContacts.name, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const baseQuery = db
    .select(selection)
    .from(billableTimeEntries)
    .innerJoin(contacts, eq(billableTimeEntries.customerId, contacts.id))
    .innerJoin(
      employeeContacts,
      eq(billableTimeEntries.employeeContactId, employeeContacts.id),
    )
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery
      .orderBy(asc(billableTimeEntries.date), asc(billableTimeEntries.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(billableTimeEntries)
      .innerJoin(contacts, eq(billableTimeEntries.customerId, contacts.id))
      .innerJoin(
        employeeContacts,
        eq(billableTimeEntries.employeeContactId, employeeContacts.id),
      )
      .where(where),
  ]);

  return { data: rows.map(toRecord), total: totalRow?.total ?? 0 };
}

// ---------------------------------------------------------------------
// GET DETAIL
// ---------------------------------------------------------------------
export async function getBillableTimeEntryById(
  businessId: string,
  entryId: string,
): Promise<BillableTimeEntryRecord | null> {
  const [row] = await db
    .select(selection)
    .from(billableTimeEntries)
    .innerJoin(contacts, eq(billableTimeEntries.customerId, contacts.id))
    .innerJoin(
      employeeContacts,
      eq(billableTimeEntries.employeeContactId, employeeContacts.id),
    )
    .where(
      and(
        eq(billableTimeEntries.businessId, businessId),
        eq(billableTimeEntries.id, entryId),
        isNull(billableTimeEntries.deletedAt),
      ),
    )
    .limit(1);

  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------
export async function createBillableTimeEntry(
  businessId: string,
  input: BillableTimeEntryCreateInput,
): Promise<BillableTimeEntryRecord> {
  const [row] = await db
    .insert(billableTimeEntries)
    .values({
      businessId,
      customerId: input.customerId,
      employeeContactId: input.employeeContactId,
      date: input.date,
      description: input.description.trim(),
      hourlyRate: input.hourlyRate.toFixed(2),
      timeSpentMinutes: input.timeSpentMinutes,
    })
    .returning({ id: billableTimeEntries.id });

  const created = await getBillableTimeEntryById(businessId, row.id);
  if (!created) throw new Error("Gagal mengambil entry setelah create.");
  return created;
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------
export async function updateBillableTimeEntry(
  businessId: string,
  entryId: string,
  input: BillableTimeEntryUpdateInput,
): Promise<BillableTimeEntryRecord | null> {
  const patch: Partial<typeof billableTimeEntries.$inferInsert> & {
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.customerId !== undefined) patch.customerId = input.customerId;
  if (input.employeeContactId !== undefined) {
    patch.employeeContactId = input.employeeContactId;
  }
  if (input.date !== undefined) patch.date = input.date;
  if (input.description !== undefined) {
    patch.description = input.description.trim();
  }
  if (input.hourlyRate !== undefined) {
    patch.hourlyRate = input.hourlyRate.toFixed(2);
  }
  if (input.timeSpentMinutes !== undefined) {
    patch.timeSpentMinutes = input.timeSpentMinutes;
  }

  const [updated] = await db
    .update(billableTimeEntries)
    .set(patch)
    .where(
      and(
        eq(billableTimeEntries.businessId, businessId),
        eq(billableTimeEntries.id, entryId),
        isNull(billableTimeEntries.deletedAt),
      ),
    )
    .returning({ id: billableTimeEntries.id });

  if (!updated) return null;
  return getBillableTimeEntryById(businessId, entryId);
}

// ---------------------------------------------------------------------
// COPY — duplikat jadi entry baru: semua field sama persis KECUALI
// date yang di-set ke hari ini (dan id baru tentunya).
// ---------------------------------------------------------------------
export async function copyBillableTimeEntry(
  businessId: string,
  entryId: string,
): Promise<BillableTimeEntryRecord | null> {
  const source = await getBillableTimeEntryById(businessId, entryId);
  if (!source) return null;

  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .insert(billableTimeEntries)
    .values({
      businessId,
      customerId: source.customerId,
      employeeContactId: source.employeeContactId,
      date: today,
      description: source.description,
      hourlyRate: source.hourlyRate.toFixed(2),
      timeSpentMinutes: source.timeSpentMinutes,
    })
    .returning({ id: billableTimeEntries.id });

  return getBillableTimeEntryById(businessId, row.id);
}

// ---------------------------------------------------------------------
// DELETE — bebas, tanpa lock (tidak ada dokumen lain yang bergantung)
// ---------------------------------------------------------------------
export async function softDeleteBillableTimeEntry(
  businessId: string,
  entryId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(billableTimeEntries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(billableTimeEntries.businessId, businessId),
        eq(billableTimeEntries.id, entryId),
        isNull(billableTimeEntries.deletedAt),
      ),
    )
    .returning({ id: billableTimeEntries.id });
  return updated !== undefined;
}
