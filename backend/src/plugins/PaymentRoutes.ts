import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getBankAccountById } from "../repositories/BankAccountRepository.js";
import { getAccountById } from "../repositories/ChartOfAccountRepository.js";
import { getContactById } from "../repositories/ContactRepository.js";
import {
  createPayment,
  getPaymentById,
  listPayments,
  softDeletePayment,
  updatePayment,
} from "../repositories/PaymentRepository.js";
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
  CreatePaymentSchema,
  PaymentDetailResponseSchema,
  PaymentIdParamsSchema,
  PaymentListQuerySchema,
  PaymentResponseSchema,
  UpdatePaymentSchema,
} from "../schemas/Payment.js";

const ALLOWED_LINE_CATEGORIES = new Set([
  "Asset",
  "Liability",
  "Equity",
  "Expense",
]);

export async function paymentRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/payments",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PAYMENT_READ)],
      schema: {
        tags: ["Payments"],
        operationId: "listPayments",
        summary: "Daftar pengeluaran kas/bank",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: PaymentListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(PaymentResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listPayments(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/payments/:paymentId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PAYMENT_READ)],
      schema: {
        tags: ["Payments"],
        operationId: "getPayment",
        summary: "Detail pembayaran + baris item",
        security: [{ bearerAuth: [] }],
        params: PaymentIdParamsSchema,
        response: {
          200: createDataResponseSchema(PaymentDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const payment = await getPaymentById(
        request.params.businessId,
        request.params.paymentId,
      );
      return payment
        ? sendData(reply, payment)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Pembayaran tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/payments",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PAYMENT_WRITE)],
      schema: {
        tags: ["Payments"],
        operationId: "createPayment",
        summary: "Buat pembayaran + alokasi Purchase Invoice atau Expense Claim + posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreatePaymentSchema,
        response: {
          201: createDataResponseSchema(PaymentDetailResponseSchema),
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

      const contact = await getContactById(businessId, body.contactId);
      if (!contact) {
        return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak (Payee) tidak ditemukan.");
      }

      const accountCheck = await checkPaymentLineAccounts(
        businessId,
        body.lines.map((l) => l.accountId),
      );
      if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);

      const payment = await createPayment(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "payments",
        entityId: payment.id,
        newValues: { reference: payment.reference, totalAmount: payment.totalAmount, allocations: payment.lines.map(l => ({ purchaseInvoiceId: l.purchaseInvoiceId, expenseClaimId: l.expenseClaimId, amount: l.amount })) },
      };

      return sendData(reply, payment, 201);
    },
  );

  app.put(
    "/businesses/:businessId/payments/:paymentId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PAYMENT_WRITE)],
      schema: {
        tags: ["Payments"],
        operationId: "updatePayment",
        summary: "Ubah pembayaran, susun ulang jurnal bila bank/payee/baris berubah",
        security: [{ bearerAuth: [] }],
        params: PaymentIdParamsSchema,
        body: UpdatePaymentSchema,
        response: {
          200: createDataResponseSchema(PaymentDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, paymentId } = request.params;
      const body = request.body;

      const existing = await getPaymentById(businessId, paymentId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pembayaran tidak ditemukan.");
      }

      if (body.bankAccountId) {
        const bankCheck = await checkBankAccount(businessId, body.bankAccountId);
        if (bankCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, bankCheck);
      }

      if (body.contactId) {
        const contact = await getContactById(businessId, body.contactId);
        if (!contact) {
          return sendError(reply, 400, ErrorCode.BAD_REQUEST, "Kontak (Payee) tidak ditemukan.");
        }
      }

      if (body.lines) {
        const accountCheck = await checkPaymentLineAccounts(
          businessId,
          body.lines.map((l) => l.accountId),
        );
        if (accountCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, accountCheck);
      }

      const updated = await updatePayment(businessId, paymentId, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pembayaran tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "payments",
        entityId: paymentId,
        oldValues: { reference: existing.reference, bankAccountId: existing.bankAccountId },
        newValues: {
          reference: updated.reference,
          bankAccountId: updated.bankAccountId,
          totalAmount: updated.totalAmount,
          allocations: updated.lines.map(l => ({ purchaseInvoiceId: l.purchaseInvoiceId, expenseClaimId: l.expenseClaimId, amount: l.amount })),
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/payments/:paymentId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.PAYMENT_DELETE)],
      schema: {
        tags: ["Payments"],
        operationId: "deletePayment",
        summary: "Soft-delete pembayaran + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: PaymentIdParamsSchema,
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
      const { businessId, paymentId } = request.params;
      const existing = await getPaymentById(businessId, paymentId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pembayaran tidak ditemukan.");
      }

      const deleted = await softDeletePayment(businessId, paymentId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Pembayaran tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "payments",
        entityId: paymentId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Pembayaran berhasil dihapus." });
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

async function checkPaymentLineAccounts(
  businessId: string,
  accountIds: string[],
): Promise<string | null> {
  for (const accountId of [...new Set(accountIds)]) {
    const account = await getAccountById(businessId, accountId);
    if (!account) return "Akun baris item tidak ditemukan.";
    if (!ALLOWED_LINE_CATEGORIES.has(account.category)) {
      return `Akun ${account.code} tidak boleh kategori Revenue untuk baris pembayaran (${account.category}).`;
    }
  }
  return null;
}

export default paymentRoutesPlugin;
