import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ErrorCode } from "../constants/errors.js";
import { Permission } from "../constants/permissions.js";
import { sendData, sendError, sendPaginated } from "../libs/reply.js";
import { getBankAccountById } from "../repositories/BankAccountRepository.js";
import {
  createInterAccountTransfer,
  getInterAccountTransferById,
  listInterAccountTransfers,
  softDeleteInterAccountTransfer,
  updateInterAccountTransfer,
} from "../repositories/InterAccountTransferRepository.js";
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
  CreateInterAccountTransferSchema,
  InterAccountTransferDetailResponseSchema,
  InterAccountTransferIdParamsSchema,
  InterAccountTransferListQuerySchema,
  InterAccountTransferResponseSchema,
  UpdateInterAccountTransferSchema,
} from "../schemas/InterAccountTransfer.js";

export async function interAccountTransferRoutesPlugin(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const businessScoped = [
    fastify.requireAuth,
    fastify.requireBusinessScopeParam,
  ];

  app.get(
    "/businesses/:businessId/inter-account-transfers",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.INTER_ACCOUNT_TRANSFER_READ)],
      schema: {
        tags: ["InterAccountTransfers"],
        operationId: "listInterAccountTransfers",
        summary: "Daftar transfer antar akun bank/kas",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        querystring: InterAccountTransferListQuerySchema,
        response: {
          200: createPaginatedResponseSchema(InterAccountTransferResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { page, pageSize, q } = request.query;
      const { data, total } = await listInterAccountTransfers(request.params.businessId, {
        page,
        pageSize,
        q,
      });
      return sendPaginated(reply, data, total, page, pageSize);
    },
  );

  app.get(
    "/businesses/:businessId/inter-account-transfers/:transferId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.INTER_ACCOUNT_TRANSFER_READ)],
      schema: {
        tags: ["InterAccountTransfers"],
        operationId: "getInterAccountTransfer",
        summary: "Detail transfer antar akun",
        security: [{ bearerAuth: [] }],
        params: InterAccountTransferIdParamsSchema,
        response: {
          200: createDataResponseSchema(InterAccountTransferDetailResponseSchema),
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const transfer = await getInterAccountTransferById(
        request.params.businessId,
        request.params.transferId,
      );
      return transfer
        ? sendData(reply, transfer)
        : sendError(reply, 404, ErrorCode.NOT_FOUND, "Transfer tidak ditemukan.");
    },
  );

  app.post(
    "/businesses/:businessId/inter-account-transfers",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.INTER_ACCOUNT_TRANSFER_WRITE)],
      schema: {
        tags: ["InterAccountTransfers"],
        operationId: "createInterAccountTransfer",
        summary: "Buat transfer + langsung posting jurnal",
        security: [{ bearerAuth: [] }],
        params: BusinessIdParamsSchema,
        body: CreateInterAccountTransferSchema,
        response: {
          201: createDataResponseSchema(InterAccountTransferDetailResponseSchema),
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

      if (body.fromBankAccountId === body.toBankAccountId) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun tujuan harus berbeda dari akun sumber.",
        );
      }

      const fromCheck = await checkBankAccount(businessId, body.fromBankAccountId, "sumber");
      if (fromCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, fromCheck);
      const toCheck = await checkBankAccount(businessId, body.toBankAccountId, "tujuan");
      if (toCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, toCheck);

      const transfer = await createInterAccountTransfer(businessId, body);

      request.audit = {
        action: "CREATE",
        entityType: "inter_account_transfers",
        entityId: transfer.id,
        newValues: {
          reference: transfer.reference,
          fromBankAccountId: transfer.fromBankAccountId,
          toBankAccountId: transfer.toBankAccountId,
          amount: transfer.amount,
        },
      };

      return sendData(reply, transfer, 201);
    },
  );

  app.put(
    "/businesses/:businessId/inter-account-transfers/:transferId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.INTER_ACCOUNT_TRANSFER_WRITE)],
      schema: {
        tags: ["InterAccountTransfers"],
        operationId: "updateInterAccountTransfer",
        summary: "Ubah transfer, susun ulang jurnal bila akun/nominal berubah",
        security: [{ bearerAuth: [] }],
        params: InterAccountTransferIdParamsSchema,
        body: UpdateInterAccountTransferSchema,
        response: {
          200: createDataResponseSchema(InterAccountTransferDetailResponseSchema),
          400: BadRequest,
          401: Unauthorized,
          403: Forbidden,
          404: NotFound,
          500: InternalServerError,
        },
      },
    },
    async (request, reply) => {
      const { businessId, transferId } = request.params;
      const body = request.body;

      const existing = await getInterAccountTransferById(businessId, transferId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Transfer tidak ditemukan.");
      }

      const effectiveFromId = body.fromBankAccountId ?? existing.fromBankAccountId;
      const effectiveToId = body.toBankAccountId ?? existing.toBankAccountId;
      if (effectiveFromId === effectiveToId) {
        return sendError(
          reply,
          400,
          ErrorCode.BAD_REQUEST,
          "Akun tujuan harus berbeda dari akun sumber.",
        );
      }

      if (body.fromBankAccountId) {
        const fromCheck = await checkBankAccount(businessId, body.fromBankAccountId, "sumber");
        if (fromCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, fromCheck);
      }
      if (body.toBankAccountId) {
        const toCheck = await checkBankAccount(businessId, body.toBankAccountId, "tujuan");
        if (toCheck) return sendError(reply, 400, ErrorCode.BAD_REQUEST, toCheck);
      }

      const updated = await updateInterAccountTransfer(businessId, transferId, body);
      if (!updated) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Transfer tidak ditemukan.");
      }

      request.audit = {
        action: "UPDATE",
        entityType: "inter_account_transfers",
        entityId: transferId,
        oldValues: {
          reference: existing.reference,
          fromBankAccountId: existing.fromBankAccountId,
          toBankAccountId: existing.toBankAccountId,
          amount: existing.amount,
        },
        newValues: {
          reference: updated.reference,
          fromBankAccountId: updated.fromBankAccountId,
          toBankAccountId: updated.toBankAccountId,
          amount: updated.amount,
        },
      };

      return sendData(reply, updated);
    },
  );

  app.delete(
    "/businesses/:businessId/inter-account-transfers/:transferId",
    {
      preHandler: [...businessScoped, fastify.requirePermissions(Permission.INTER_ACCOUNT_TRANSFER_DELETE)],
      schema: {
        tags: ["InterAccountTransfers"],
        operationId: "deleteInterAccountTransfer",
        summary: "Soft-delete transfer + jurnal terkait",
        security: [{ bearerAuth: [] }],
        params: InterAccountTransferIdParamsSchema,
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
      const { businessId, transferId } = request.params;
      const existing = await getInterAccountTransferById(businessId, transferId);
      if (!existing) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Transfer tidak ditemukan.");
      }

      const deleted = await softDeleteInterAccountTransfer(businessId, transferId);
      if (!deleted) {
        return sendError(reply, 404, ErrorCode.NOT_FOUND, "Transfer tidak ditemukan.");
      }

      request.audit = {
        action: "DELETE",
        entityType: "inter_account_transfers",
        entityId: transferId,
        oldValues: { reference: existing.reference },
      };

      return sendData(reply, { message: "Transfer berhasil dihapus." });
    },
  );
}

async function checkBankAccount(
  businessId: string,
  bankAccountId: string,
  label: string,
): Promise<string | null> {
  const bank = await getBankAccountById(businessId, bankAccountId);
  if (!bank) return `Rekening ${label} tidak ditemukan.`;
  if (bank.status !== "active") return `Rekening ${label} tidak aktif.`;
  return null;
}

export default interAccountTransferRoutesPlugin;
