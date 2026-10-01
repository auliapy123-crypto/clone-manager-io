/**
 * Debit Notes — nota debet (retur pembelian), posting jurnal langsung saat
 * create. Kebalikan Credit Notes: DEBIT akun kontrol AP, KREDIT akun Expense.
 */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getSupplierById } from "../repositories/ContactRepository.js";
import {
  copyDebitNote,
  createDebitNote,
  DebitNoteValidationError,
  findApControlAccount,
  getDebitNoteById,
  listDebitNotes,
  softDeleteDebitNote,
  updateDebitNote,
} from "../repositories/DebitNoteRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  CreateDebitNoteSchema,
  DebitNoteDetailResponseSchema,
  DebitNoteIdParamsSchema,
  DebitNoteListQuerySchema,
  DebitNoteResponseSchema,
  UpdateDebitNoteSchema,
} from "../schemas/DebitNote.js";
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

const TAG = "DebitNotes";

/**
 * Baris nota debet mengurangi beban (akun Expense) — Asset/Revenue/Liability
 * ditolak, karena nota debet mengoreksi akun beban yang tadinya didebit
 * faktur pembelian.
 */
async function checkExpenseAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of accountIds) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return `Akun ${accountId} tidak ditemukan.`;
    if (account.category !== "Expense") {
      return `Akun ${account.code} - ${account.name} bukan kategori Expense.`;
    }
  }
  return null;
}

export async function debitNoteRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/debit-notes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "listDebitNotes",
        summary: "Daftar nota debet",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: DebitNoteListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(DebitNoteResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listDebitNotes(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/debit-notes/:debitNoteId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_READ),
      ],
      schema: {
        tags: [TAG],
        operationId: "getDebitNote",
        summary: "Detail nota debet + baris item + totalAmount",
        security: [{ bearerAuth: [] }],
        params: DebitNoteIdParamsSchema,
        response: {
          200: createDataResponseSchema(DebitNoteDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const note = await getDebitNoteById(
        request.params.businessId,
        request.params.debitNoteId,
      );
      return note
        ? sendData(reply, note)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota debet tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/debit-notes",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "createDebitNote",
        summary: "Buat nota debet + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateDebitNoteSchema,
        response: {
          201: createDataResponseSchema(DebitNoteDetailResponseSchema),
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

      const supplier = await getSupplierById(businessId, body.supplierId);
      if (!supplier) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Supplier tidak ditemukan.");
      }

      const accountCheck = await checkExpenseAccounts(
        businessId,
        body.lines.map((l) => l.accountId),
      );
      if (accountCheck) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
      }

      if (!(await findApControlAccount(businessId))) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun kontrol Utang Usaha belum disiapkan di bisnis ini.",
        );
      }

      try {
        const note = await createDebitNote(businessId, {
          ...body,
          supplierName: supplier.name,
        });

        request.audit = {
          action: "CREATE",
          entityType: "debit_notes",
          entityId: note.id,
          newValues: {
            debitNoteNumber: note.debitNoteNumber,
            supplierId: note.supplierId,
            purchaseInvoiceId: note.purchaseInvoiceId,
            totalAmount: note.totalAmount,
          },
        };

        return sendData(reply, note, 201);
      } catch (err) {
        if (err instanceof DebitNoteValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
    },
  );

  app.put(
    "/businesses/:businessId/debit-notes/:debitNoteId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "updateDebitNote",
        summary: "Ubah nota debet, susun ulang jurnal bila supplier/baris berubah",
        security: [{ bearerAuth: [] }],
        params: DebitNoteIdParamsSchema,
        body: UpdateDebitNoteSchema,
        response: {
          200: createDataResponseSchema(DebitNoteDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, debitNoteId } = request.params;
      const body = request.body;

      const existing = await getDebitNoteById(businessId, debitNoteId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota debet tidak ditemukan.");
      }

      const supplier = await getSupplierById(
        businessId,
        body.supplierId ?? existing.supplierId,
      );
      if (!supplier) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Supplier tidak ditemukan.");
      }

      if (body.lines) {
        const accountCheck = await checkExpenseAccounts(
          businessId,
          body.lines.map((l) => l.accountId),
        );
        if (accountCheck) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
        }
        if (!(await findApControlAccount(businessId))) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Akun kontrol Utang Usaha belum disiapkan di bisnis ini.",
          );
        }
      }

      try {
        const updated = await updateDebitNote(businessId, debitNoteId, {
          ...body,
          supplierName: supplier.name,
        });

        if (!updated) {
          return sendError(
            reply,
            404,
            ErrorCode.NOT_FOUND,
            "Nota debet tidak ditemukan.",
          );
        }

        request.audit = {
          action: "UPDATE",
          entityType: "debit_notes",
          entityId: debitNoteId,
          oldValues: {
            debitNoteNumber: existing.debitNoteNumber,
            supplierId: existing.supplierId,
            purchaseInvoiceId: existing.purchaseInvoiceId,
            totalAmount: existing.totalAmount,
          },
          newValues: {
            debitNoteNumber: updated.debitNoteNumber,
            supplierId: updated.supplierId,
            purchaseInvoiceId: updated.purchaseInvoiceId,
            totalAmount: updated.totalAmount,
          },
        };

        return sendData(reply, updated);
      } catch (err) {
        if (err instanceof DebitNoteValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }
    },
  );

  app.post(
    "/businesses/:businessId/debit-notes/:debitNoteId/copy",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_WRITE),
      ],
      schema: {
        tags: [TAG],
        operationId: "copyDebitNote",
        summary: "Duplikat nota debet jadi record baru (Date default hari ini)",
        security: [{ bearerAuth: [] }],
        params: DebitNoteIdParamsSchema,
        response: {
          201: createDataResponseSchema(DebitNoteDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, debitNoteId } = request.params;

      let copied;
      try {
        copied = await copyDebitNote(businessId, debitNoteId);
      } catch (err) {
        if (err instanceof DebitNoteValidationError) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, err.message);
        }
        throw err;
      }

      if (!copied) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota debet tidak ditemukan.");
      }

      request.audit = {
        action: "CREATE",
        entityType: "debit_notes",
        entityId: copied.id,
        newValues: {
          copiedFromId: debitNoteId,
          debitNoteNumber: copied.debitNoteNumber,
          totalAmount: copied.totalAmount,
        },
      };

      return sendData(reply, copied, 201);
    },
  );

  app.delete(
    "/businesses/:businessId/debit-notes/:debitNoteId",
    {
      preHandler: [
        ...businessScoped,
        fastify.requirePermissions(Permission.DEBIT_NOTE_DELETE),
      ],
      schema: {
        tags: [TAG],
        operationId: "deleteDebitNote",
        summary: "Soft-delete nota debet + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: DebitNoteIdParamsSchema,
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
      const { businessId, debitNoteId } = request.params;

      const existing = await getDebitNoteById(businessId, debitNoteId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota debet tidak ditemukan.");
      }

      await softDeleteDebitNote(businessId, debitNoteId);

      request.audit = {
        action: "DELETE",
        entityType: "debit_notes",
        entityId: debitNoteId,
        oldValues: {
          debitNoteNumber: existing.debitNoteNumber,
          supplierId: existing.supplierId,
          totalAmount: existing.totalAmount,
        },
      };

      return sendData(reply, { message: "Nota debet berhasil dihapus." });
    },
  );
}

export default debitNoteRoutesPlugin;
