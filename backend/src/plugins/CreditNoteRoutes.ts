/** Credit Notes — nota kredit, posting jurnal langsung saat create. */
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getCustomerById } from "../repositories/ContactRepository.js";
import {
  createCreditNote,
  findArControlAccount,
  getCreditNoteById,
  listCreditNotes,
  softDeleteCreditNote,
  updateCreditNote,
} from "../repositories/CreditNoteRepository.js";
import { BusinessIdParamsSchema } from "../schemas/Business.js";
import {
  CreateCreditNoteSchema,
  CreditNoteDetailResponseSchema,
  CreditNoteIdParamsSchema,
  CreditNoteListQuerySchema,
  CreditNoteResponseSchema,
  UpdateCreditNoteSchema,
} from "../schemas/CreditNote.js";
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

async function checkRevenueAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of accountIds) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return `Akun ${accountId} tidak ditemukan.`;
    if (account.category !== "Revenue") {
      return `Akun ${account.code} - ${account.name} bukan kategori Revenue.`;
    }
  }
  return null;
}

export async function creditNoteRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/credit-notes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.CREDIT_NOTE_READ)],
      schema: {
        tags: ["CreditNotes"],
        operationId: "listCreditNotes",
        summary: "Daftar nota kredit",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: CreditNoteListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(CreditNoteResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listCreditNotes(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/credit-notes/:creditNoteId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.CREDIT_NOTE_READ)],
      schema: {
        tags: ["CreditNotes"],
        operationId: "getCreditNote",
        summary: "Detail nota kredit + baris item + totalAmount",
        security: [{ bearerAuth: [] }],
        params: CreditNoteIdParamsSchema,
        response: {
          200: createDataResponseSchema(CreditNoteDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const note = await getCreditNoteById(
        request.params.businessId,
        request.params.creditNoteId,
      );
      return note
        ? sendData(reply, note)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota kredit tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/credit-notes",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.CREDIT_NOTE_WRITE)],
      schema: {
        tags: ["CreditNotes"],
        operationId: "createCreditNote",
        summary: "Buat nota kredit + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateCreditNoteSchema,
        response: {
          201: createDataResponseSchema(CreditNoteDetailResponseSchema),
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

      const customer = await getCustomerById(businessId, body.customerId);
      if (!customer) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
      }

      const accountCheck = await checkRevenueAccounts(
        businessId,
        body.lines.map((l) => l.accountId),
      );
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      if (!(await findArControlAccount(businessId))) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun kontrol Piutang Usaha belum disiapkan di bisnis ini.",
        );
      }

      const note = await createCreditNote(businessId, {
        ...body,
        customerName: customer.name,
      });

      request.audit = {
        action: "CREATE",
        entityType: "credit_notes",
        entityId: note.id,
        newValues: { reference: note.reference, totalAmount: note.totalAmount },
      };

      return sendData(reply, note, 201);
    },
  );

  app.put(
    "/businesses/:businessId/credit-notes/:creditNoteId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.CREDIT_NOTE_WRITE)],
      schema: {
        tags: ["CreditNotes"],
        operationId: "updateCreditNote",
        summary: "Ubah nota kredit, susun ulang jurnal",
        security: [{ bearerAuth: [] }],
        params: CreditNoteIdParamsSchema,
        body: UpdateCreditNoteSchema,
        response: {
          200: createDataResponseSchema(CreditNoteDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, creditNoteId } = request.params;
      const body = request.body;

      const existing = await getCreditNoteById(businessId, creditNoteId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota kredit tidak ditemukan.");
      }

      const customer = await getCustomerById(
        businessId,
        body.customerId ?? existing.customerId,
      );
      if (!customer) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Pelanggan tidak ditemukan.");
      }

      if (body.lines) {
        const accountCheck = await checkRevenueAccounts(
          businessId,
          body.lines.map((l) => l.accountId),
        );
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
        if (!(await findArControlAccount(businessId))) {
          return sendError(
            reply,
            400,
            ErrorCode.BAD_REQUEST,
            "Akun kontrol Piutang Usaha belum disiapkan di bisnis ini.",
          );
        }
      }

      const updated = await updateCreditNote(businessId, creditNoteId, {
        ...body,
        customerName: customer.name,
      });

      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota kredit tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "credit_notes",
        entityId: creditNoteId,
        oldValues: { reference: existing.reference, totalAmount: existing.totalAmount },
        newValues: { reference: updated.reference, totalAmount: updated.totalAmount },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/credit-notes/:creditNoteId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.CREDIT_NOTE_DELETE)],
      schema: {
        tags: ["CreditNotes"],
        operationId: "deleteCreditNote",
        summary: "Soft-delete nota kredit + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: CreditNoteIdParamsSchema,
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
      const { businessId, creditNoteId } = request.params;

      const existing = await getCreditNoteById(businessId, creditNoteId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Nota kredit tidak ditemukan.");
      }

      await softDeleteCreditNote(businessId, creditNoteId);

      request.audit = {
        action: "DELETE",
        entityType: "credit_notes",
        entityId: creditNoteId,
        oldValues: { reference: existing.reference, totalAmount: existing.totalAmount },
      };

      return sendData(reply, { message: "Nota kredit berhasil dihapus." });
    },
  );
}

export default creditNoteRoutesPlugin;
