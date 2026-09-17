/**
 * BusinessRepository (Guide §3.2, §5.4).
 *
 * Pure function, diekspor satu per satu, mengimpor `db` langsung.
 * Tidak tahu HTTP: tidak menerima FastifyReply, tidak menentukan status code.
 *
 * Soft-delete (Guide §5.2): setiap query membaca hanya baris dengan
 * `deleted_at IS NULL`.
 */
import { and, eq, isNull } from "drizzle-orm";
import db from "../db/index.js";
import { businesses, userBusinessRoles } from "../db/schema.js";

export interface BusinessRecord {
  id: string;
  name: string;
  baseCurrencyCode: string;
  createdAt: string;
}

const businessColumns = {
  id: businesses.id,
  name: businesses.name,
  baseCurrencyCode: businesses.baseCurrencyCode,
  createdAt: businesses.createdAt,
};

function toBusinessRecord<T extends { createdAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function getBusinessById(
  id: string,
): Promise<BusinessRecord | null> {
  const [row] = await db
    .select(businessColumns)
    .from(businesses)
    .where(and(eq(businesses.id, id), isNull(businesses.deletedAt)))
    .limit(1);

  return row ? toBusinessRecord(row) : null;
}

/**
 * Membuat bisnis baru sekaligus menjadikan pembuatnya admin, dalam satu
 * transaksi — supaya tidak pernah ada bisnis yang berdiri tanpa admin bila
 * insert keanggotaan gagal.
 */
export async function createBusinessWithAdmin(
  input: { name: string; baseCurrencyCode: string },
  creatorUserId: string,
): Promise<BusinessRecord> {
  return db.transaction(async (tx) => {
    const [business] = await tx
      .insert(businesses)
      .values(input)
      .returning(businessColumns);

    await tx.insert(userBusinessRoles).values({
      userId: creatorUserId,
      businessId: business.id,
      role: "admin",
    });

    return toBusinessRecord(business);
  });
}

export async function updateBusiness(
  id: string,
  input: { name?: string; baseCurrencyCode?: string },
): Promise<BusinessRecord | null> {
  const [row] = await db
    .update(businesses)
    .set(input)
    .where(and(eq(businesses.id, id), isNull(businesses.deletedAt)))
    .returning(businessColumns);

  return row ? toBusinessRecord(row) : null;
}
