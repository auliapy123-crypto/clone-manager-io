import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getBankAccountById } from "../repositories/BankAccountRepository.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getContactById } from "../repositories/ContactRepository.js";
import {
  createReceipt,
  getReceiptById,
  listReceipts,
  softDeleteReceipt,
  updateReceipt,
} from "../repositories/ReceiptRepository.js";
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
  CreateReceiptSchema,
  ReceiptDetailResponseSchema,
  ReceiptIdParamsSchema,
  ReceiptListQuerySchema,
  ReceiptResponseSchema,
  UpdateReceiptSchema,
} from "../schemas/Receipt.js";

const ALLOWED_LINE_CATEGORIES = new Set(["Revenue", "Equity", "Liability"]);

export async function receiptRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/receipts",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.RECEIPT_READ)],
      schema: {
        tags: ["Receipts"],
        operationId: "listReceipts",
        summary: "Daftar penerimaan kas/bank",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: ReceiptListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(ReceiptResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listReceipts(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/receipts/:receiptId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.RECEIPT_READ)],
      schema: {
        tags: ["Receipts"],
        operationId: "getReceipt",
        summary: "Detail penerimaan + baris item",
        security: [{ bearerAuth: [] }],
        params: ReceiptIdParamsSchema,
        response: {
          200: createDataResponseSchema(ReceiptDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const receipt = await getReceiptById(
        request.params.businessId,
        request.params.receiptId,
      );
      return receipt
        ? sendData(reply, receipt)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Penerimaan tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/receipts",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.RECEIPT_WRITE)],
      schema: {
        tags: ["Receipts"],
        operationId: "createReceipt",
        summary: "Buat penerimaan + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateReceiptSchema,
        response: {
          201: createDataResponseSchema(ReceiptDetailResponseSchema),
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

      const bankCheck = await checkBankAccount(businessId, body.bankAccountId);
      if (bankCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, bankCheck);

      if (body.contactId) {
        const contact = await getContactById(businessId, body.contactId);
        if (!contact) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak tidak ditemukan.");
        }
      }

      const accountCheck = await checkReceiptLineAccounts(
        businessId,
        body.lines.map((l) => l.accountId),
      );
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      const receipt = await createReceipt(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "receipts",
        entityId: receipt.id,
        newValues: { reference: receipt.reference, totalAmount: receipt.totalAmount },
      };

      return sendData(reply, receipt, 201);
    },
  );

  app.put(
    "/businesses/:businessId/receipts/:receiptId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.RECEIPT_WRITE)],
      schema: {
        tags: ["Receipts"],
        operationId: "updateReceipt",
        summary: "Ubah penerimaan, susun ulang jurnal bila bank/baris berubah",
        security: [{ bearerAuth: [] }],
        params: ReceiptIdParamsSchema,
        body: UpdateReceiptSchema,
        response: {
          200: createDataResponseSchema(ReceiptDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, receiptId } = request.params;
      const body = request.body;

      const existing = await getReceiptById(businessId, receiptId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penerimaan tidak ditemukan.");
      }

      if (body.bankAccountId) {
        const bankCheck = await checkBankAccount(businessId, body.bankAccountId);
        if (bankCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, bankCheck);
      }

      if (body.contactId) {
        const contact = await getContactById(businessId, body.contactId);
        if (!contact) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak tidak ditemukan.");
        }
      }

      if (body.lines) {
        const accountCheck = await checkReceiptLineAccounts(
          businessId,
          body.lines.map((l) => l.accountId),
        );
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
      }

      const updated = await updateReceipt(businessId, receiptId, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penerimaan tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "receipts",
        entityId: receiptId,
        oldValues: { reference: existing.reference, bankAccountId: existing.bankAccountId },
        newValues: {
          reference: updated.reference,
          bankAccountId: updated.bankAccountId,
          totalAmount: updated.totalAmount,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/receipts/:receiptId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.RECEIPT_DELETE)],
      schema: {
        tags: ["Receipts"],
        operationId: "deleteReceipt",
        summary: "Soft-delete penerimaan + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: ReceiptIdParamsSchema,
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
      const { businessId, receiptId } = request.params;
      const existing = await getReceiptById(businessId, receiptId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penerimaan tidak ditemukan.");
      }

      const deleted = await softDeleteReceipt(businessId, receiptId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Penerimaan tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "receipts",
        entityId: receiptId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Penerimaan berhasil dihapus." });
    },
  );
}

async function checkBankAccount(
  businessId: string,
  bankAccountId: string,
): Promise<string | null> {
  const bank = await getBankAccountById(businessId, bankAccountId);
  if (!bank) return "Rekening bank/kas tidak ditemukan.";
  if (bank.status !== "active") return "Rekening bank/kas tidak aktif.";
  return null;
}

async function checkReceiptLineAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of [...new Set(accountIds)]) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun baris item tidak ditemukan.";
    if (!ALLOWED_LINE_CATEGORIES.has(account.category)) {
      return `Akun ${account.code} harus kategori Revenue, Equity, atau Liability (bukan ${account.category}).`;
    }
  }
  return null;
}

export default receiptRoutesPlugin;
