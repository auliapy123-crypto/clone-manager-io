/**
 * UserRepository (Guide §3.2, §5.4).
 *
 * Pure function, diekspor satu per satu, mengimpor `db` langsung.
 * Tidak tahu HTTP: tidak menerima FastifyReply, tidak menentukan status code.
 *
 * Soft-delete (Guide §5.2): setiap query membaca hanya baris dengan
 * `deleted_at IS NULL`.
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import db from "../db/index.js";
import { userBusinessRoles, users, type BusinessRole } from "../db/schema.js";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface BusinessMember extends PublicUser {
  role: BusinessRole;
}

export interface UserCredentials {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface ListOptions {
  page: number;
  pageSize: number;
}

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
};

function toPublicUser<T extends { createdAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<PublicUser> {
  const [row] = await db.insert(users).values(input).returning(publicColumns);
  return toPublicUser(row);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const [row] = await db
    .select(publicColumns)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  return row ? toPublicUser(row) : null;
}

/**
 * Dipakai login — sengaja MEMBAWA password_hash.
 * Jangan pernah kembalikan hasilnya mentah-mentah ke response.
 */
export async function getUserByEmail(
  email: string,
): Promise<UserCredentials | null> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  return row ?? null;
}

/** Dipakai change-password — hanya hash-nya yang dibutuhkan. */
export async function getUserPasswordHash(
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  return row?.passwordHash ?? null;
}

export async function updateUserPassword(
  id: string,
  passwordHash: string,
): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning({ id: users.id });

  return rows.length > 0;
}

export async function softDeleteUser(id: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning({ id: users.id });

  return rows.length > 0;
}

/**
 * Daftar user yang terhubung ke satu bisnis, beserta role-nya.
 * Selalu dibatasi business_id — inilah batas tenant-nya.
 */
export async function listUsersByBusiness(
  businessId: string,
  opts: ListOptions,
): Promise<{ data: BusinessMember[]; total: number }> {
  const where = and(
    eq(userBusinessRoles.businessId, businessId),
    isNull(users.deletedAt),
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ ...publicColumns, role: userBusinessRoles.role })
      .from(userBusinessRoles)
      .innerJoin(users, eq(users.id, userBusinessRoles.userId))
      .where(where)
      .orderBy(asc(users.name))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db
      .select({ total: count() })
      .from(userBusinessRoles)
      .innerJoin(users, eq(users.id, userBusinessRoles.userId))
      .where(where),
  ]);

  return {
    data: rows.map(toPublicUser),
    total: totalRow?.total ?? 0,
  };
}

/** Profil satu anggota di dalam konteks bisnis tertentu. */
export async function getUserInBusiness(
  userId: string,
  businessId: string,
): Promise<BusinessMember | null> {
  const [row] = await db
    .select({ ...publicColumns, role: userBusinessRoles.role })
    .from(userBusinessRoles)
    .innerJoin(users, eq(users.id, userBusinessRoles.userId))
    .where(
      and(
        eq(userBusinessRoles.userId, userId),
        eq(userBusinessRoles.businessId, businessId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  return row ? toPublicUser(row) : null;
}
