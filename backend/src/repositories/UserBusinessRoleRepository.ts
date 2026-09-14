/**
 * UserBusinessRoleRepository (Guide §3.2, §5.4).
 *
 * Tabel pivot `user_business_roles` adalah inti multi-tenant: dia yang
 * menentukan user mana boleh membuka bisnis mana, dan dengan role apa.
 * `requireBusinessScope` di AuthMiddleware memanggil `getMembership`
 * pada setiap request yang ber-scope bisnis.
 *
 * Tabel ini sengaja TIDAK memakai soft-delete — mencabut akses harus
 * benar-benar menghapus baris (lihat catatan di db/schema.ts).
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import db from "../db/index.js";
import {
  businesses,
  userBusinessRoles,
  type BusinessRole,
} from "../db/schema.js";

export interface Membership {
  id: string;
  userId: string;
  businessId: string;
  role: BusinessRole;
}

export interface BusinessSummary {
  id: string;
  name: string;
  baseCurrencyCode: string;
  role: BusinessRole;
}

const membershipColumns = {
  id: userBusinessRoles.id,
  userId: userBusinessRoles.userId,
  businessId: userBusinessRoles.businessId,
  role: userBusinessRoles.role,
};

/** `null` artinya user tidak punya akses ke bisnis tersebut. */
export async function getMembership(
  userId: string,
  businessId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select(membershipColumns)
    .from(userBusinessRoles)
    .innerJoin(businesses, eq(businesses.id, userBusinessRoles.businessId))
    .where(
      and(
        eq(userBusinessRoles.userId, userId),
        eq(userBusinessRoles.businessId, businessId),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Semua bisnis yang bisa dibuka user. Dipakai frontend untuk memilih
 * bisnis aktif sebelum mengirim header x-business-id.
 */
export async function listBusinessesForUser(
  userId: string,
): Promise<BusinessSummary[]> {
  return db
    .select({
      id: businesses.id,
      name: businesses.name,
      baseCurrencyCode: businesses.baseCurrencyCode,
      role: userBusinessRoles.role,
    })
    .from(userBusinessRoles)
    .innerJoin(businesses, eq(businesses.id, userBusinessRoles.businessId))
    .where(
      and(eq(userBusinessRoles.userId, userId), isNull(businesses.deletedAt)),
    )
    .orderBy(asc(businesses.name));
}

/**
 * Melempar error Postgres 23505 bila user sudah terdaftar di bisnis ini.
 * Route menerjemahkannya ke 409 lewat `isPgUniqueViolation` — bukan dengan
 * pre-check SELECT, yang punya celah race.
 */
export async function assignUserToBusiness(
  userId: string,
  businessId: string,
  role: BusinessRole,
): Promise<Membership> {
  const [row] = await db
    .insert(userBusinessRoles)
    .values({ userId, businessId, role })
    .returning(membershipColumns);

  return row;
}

export async function updateMembershipRole(
  userId: string,
  businessId: string,
  role: BusinessRole,
): Promise<Membership | null> {
  const [row] = await db
    .update(userBusinessRoles)
    .set({ role })
    .where(
      and(
        eq(userBusinessRoles.userId, userId),
        eq(userBusinessRoles.businessId, businessId),
      ),
    )
    .returning(membershipColumns);

  return row ?? null;
}

export async function removeMembership(
  userId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await db
    .delete(userBusinessRoles)
    .where(
      and(
        eq(userBusinessRoles.userId, userId),
        eq(userBusinessRoles.businessId, businessId),
      ),
    )
    .returning({ id: userBusinessRoles.id });

  return rows.length > 0;
}

/**
 * Jumlah pemegang satu role di sebuah bisnis.
 * Dipakai untuk mencegah admin terakhir dihapus / diturunkan role-nya.
 */
export async function countMembersByRole(
  businessId: string,
  role: BusinessRole,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(userBusinessRoles)
    .where(
      and(
        eq(userBusinessRoles.businessId, businessId),
        eq(userBusinessRoles.role, role),
      ),
    );

  return row?.total ?? 0;
}
