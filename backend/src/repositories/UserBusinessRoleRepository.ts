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
import { isPgUniqueViolation } from "../libs/safe-error.js";
import { getUserById } from "./UserRepository.js";

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

// =======================================================================
// Orkestrasi keanggotaan — dipakai UserRoutes.ts (/users/*) DAN
// BusinessRoutes.ts (/businesses/:businessId/members/*) supaya aturan
// bisnisnya (admin terakhir, self-removal, dsb.) hanya ditulis sekali.
// Tetap "tidak tahu HTTP": mengembalikan discriminated union, bukan
// melempar/menentukan status code — pemanggil yang menerjemahkannya.
// =======================================================================

export type AddMemberResult =
  | { status: "added"; membership: Membership }
  | { status: "user_not_found" }
  | { status: "already_member" };

/** Menghubungkan user yang sudah ada ke sebuah bisnis. */
export async function addMemberToBusiness(
  businessId: string,
  userId: string,
  role: BusinessRole,
): Promise<AddMemberResult> {
  const user = await getUserById(userId);
  if (!user) return { status: "user_not_found" };

  try {
    const membership = await assignUserToBusiness(userId, businessId, role);
    return { status: "added", membership };
  } catch (error) {
    if (isPgUniqueViolation(error)) return { status: "already_member" };
    throw error;
  }
}

export type ChangeMemberRoleResult =
  | { status: "updated"; membership: Membership; previousRole: BusinessRole }
  | { status: "unchanged"; membership: Membership }
  | { status: "not_member" }
  | { status: "last_admin" };

/** Jangan sampai bisnis kehilangan admin terakhirnya lewat penurunan role. */
export async function changeMemberRole(
  businessId: string,
  userId: string,
  role: BusinessRole,
): Promise<ChangeMemberRoleResult> {
  const membership = await getMembership(userId, businessId);
  if (!membership) return { status: "not_member" };

  if (membership.role === role) {
    return { status: "unchanged", membership };
  }

  if (membership.role === "admin") {
    const adminCount = await countMembersByRole(businessId, "admin");
    if (adminCount <= 1) return { status: "last_admin" };
  }

  const updated = await updateMembershipRole(userId, businessId, role);
  if (!updated) return { status: "not_member" };

  return { status: "updated", membership: updated, previousRole: membership.role };
}

export type RemoveMemberResult =
  | { status: "removed"; membership: Membership }
  | { status: "not_member" }
  | { status: "last_admin" }
  | { status: "self_removal" };

/** Melepas keanggotaan; tidak boleh mengeluarkan diri sendiri atau admin terakhir. */
export async function removeMemberFromBusiness(
  businessId: string,
  userId: string,
  actingUserId: string,
): Promise<RemoveMemberResult> {
  if (userId === actingUserId) return { status: "self_removal" };

  const membership = await getMembership(userId, businessId);
  if (!membership) return { status: "not_member" };

  if (membership.role === "admin") {
    const adminCount = await countMembersByRole(businessId, "admin");
    if (adminCount <= 1) return { status: "last_admin" };
  }

  await removeMembership(userId, businessId);
  return { status: "removed", membership };
}
