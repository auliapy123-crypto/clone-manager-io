import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getContactById } from "../repositories/ContactRepository.js";
import {
  createManualJournalEntry,
  getJournalEntryById,
  listJournalEntries,
  softDeleteManualJournalEntry,
  updateManualJournalEntry,
  type JournalEntryLineInput,
} from "../repositories/JournalEntryRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  BadRequest,
  createDataResponseSchema,
  createPaginatedResponseSchema,
  Forbidden,
  InternalServerError,
  MessageResponseSchema,
  NotFound,
  Unauthorized,
} from "../schemas/globals.js";
import {
  CreateJournalEntrySchema,
  JournalEntryDetailResponseSchema,
  JournalEntryIdParamsSchema,
  JournalEntryListQuerySchema,
  JournalEntryResponseSchema,
  UpdateJournalEntrySchema,
} from "../schemas/JournalEntry.js";

const NOT_MANUAL_MESSAGE =
  "Jurnal ini berasal dari modul lain, edit lewat dokumen sumbernya.";

export async function journalEntryRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/journal-entries",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.JOURNAL_ENTRY_READ)],
      schema: {
        tags: ["JournalEntries"],
        operationId: "listJournalEntries",
        summary: "Daftar semua jurnal (manual + otomatis modul lain)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: JournalEntryListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(JournalEntryResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q, sourceModule, dateFrom, dateTo } = request.query;
      const { data, total } = await listJournalEntries(request.params.businessId, {
        page,
        pageSize,
        q,
        sourceModule,
        dateFrom,
        dateTo,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/journal-entries/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.JOURNAL_ENTRY_READ)],
      schema: {
        tags: ["JournalEntries"],
        operationId: "getJournalEntry",
        summary: "Detail jurnal + semua baris",
        security: [{ bearerAuth: [] }],
        params: JournalEntryIdParamsSchema,
        response: {
          200: createDataResponseSchema(JournalEntryDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const entry = await getJournalEntryById(
        request.params.businessId,
        request.params.id,
      );
      return entry
        ? sendData(reply, entry)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Jurnal tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/journal-entries",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.JOURNAL_ENTRY_WRITE)],
      schema: {
        tags: ["JournalEntries"],
        operationId: "createManualJournalEntry",
        summary: "Buat jurnal manual baru (selalu balance)",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateJournalEntrySchema,
        response: {
          201: createDataResponseSchema(JournalEntryDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId } = request.params;
      const body = request.body;

      const linesCheck = await checkJournalLines(businessId, body.lines);
      if (linesCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, linesCheck);

      const entry = await createManualJournalEntry(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "journal_entries",
        entityId: entry.id,
        newValues: { reference: entry.reference, totalDebit: entry.totalDebit },
      };

      return sendData(reply, entry, 201);
    },
  );

  app.put(
    "/businesses/:businessId/journal-entries/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.JOURNAL_ENTRY_WRITE)],
      schema: {
        tags: ["JournalEntries"],
        operationId: "updateManualJournalEntry",
        summary: "Ubah jurnal manual (tolak kalau dari modul lain)",
        security: [{ bearerAuth: [] }],
        params: JournalEntryIdParamsSchema,
        body: UpdateJournalEntrySchema,
        response: {
          200: createDataResponseSchema(JournalEntryDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;
      const body = request.body;

      const existing = await getJournalEntryById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Jurnal tidak ditemukan.");
      }
      if (!existing.isManual) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, NOT_MANUAL_MESSAGE);
      }

      if (body.lines) {
        const linesCheck = await checkJournalLines(businessId, body.lines);
        if (linesCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, linesCheck);
      }

      const updated = await updateManualJournalEntry(businessId, id, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Jurnal tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "journal_entries",
        entityId: id,
        oldValues: { reference: existing.reference },
        newValues: { reference: updated.reference, totalDebit: updated.totalDebit },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/journal-entries/:id",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.JOURNAL_ENTRY_DELETE)],
      schema: {
        tags: ["JournalEntries"],
        operationId: "deleteManualJournalEntry",
        summary: "Soft-delete jurnal manual (tolak kalau dari modul lain)",
        security: [{ bearerAuth: [] }],
        params: JournalEntryIdParamsSchema,
        response: {
          200: MessageResponseSchema,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, id } = request.params;
      const existing = await getJournalEntryById(businessId, id);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Jurnal tidak ditemukan.");
      }
      if (!existing.isManual) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Jurnal ini berasal dari modul lain, hapus lewat dokumen sumbernya.",
        );
      }

      const deleted = await softDeleteManualJournalEntry(businessId, id);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Jurnal tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "journal_entries",
        entityId: id,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Jurnal berhasil dihapus." });
    },
  );
}

/** Validasi akun (semua kategori boleh) + kontak tiap baris. */
async function checkJournalLines(
  businessId: string,
  lines: JournalEntryLineInput[],
): Promise<string | null> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  for (const accountId of accountIds) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun baris jurnal tidak ditemukan.";
  }
  const contactIds = [...new Set(lines.map((l) => l.contactId).filter((c): c is string => !!c))];
  for (const contactId of contactIds) {
    const contact = await getContactById(businessId, contactId);
    if (!contact) return "Kontak baris jurnal tidak ditemukan.";
  }
  return null;
}

export default journalEntryRoutesPlugin;
