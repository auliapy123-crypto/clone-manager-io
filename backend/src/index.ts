/**
 * Entry point backend Clone Manager.io.
 *
 * URUTAN REGISTRASI DI BAWAH DITETAPKAN GUIDE §7.1 — JANGAN DIUBAH.
 * Lampiran butir 8 menegaskan bahwa posisi Swagger (setelah middleware auth,
 * sebelum route bisnis) adalah urutan sensitif.
 *
 * Format respons baku di seluruh API (Guide §7.3):
 *   sukses           -> { data }
 *   sukses paginated -> { data, pagination }
 *   gagal            -> { error, message }
 */
import "dotenv/config";

import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import env from "./constants/env.js";
import {
  ErrorCode,
  ErrorMessage,
  errorCodeForStatus,
} from "./constants/errors.js";
import { closePool, runMigrations } from "./db/index.js";
import { attachLogger } from "./libs/logger.js";
import { toHttpError } from "./libs/safe-error.js";
import authMiddlewarePlugin from "./plugins/AuthMiddleware.js";
import authRoutesPlugin from "./plugins/AuthRoutes.js";
import bankAccountRoutesPlugin from "./plugins/BankAccountRoutes.js";
import bankReconciliationRoutesPlugin from "./plugins/BankReconciliationRoutes.js";
import businessRoutesPlugin from "./plugins/BusinessRoutes.js";
import chartOfAccountRoutesPlugin from "./plugins/ChartOfAccountRoutes.js";
import customerRoutesPlugin from "./plugins/CustomerRoutes.js";
import healthPlugin from "./plugins/HealthPlugin.js";
import interAccountTransferRoutesPlugin from "./plugins/InterAccountTransferRoutes.js";
import journalEntryRoutesPlugin from "./plugins/JournalEntryRoutes.js";
import expenseClaimRoutesPlugin from "./plugins/ExpenseClaimRoutes.js";
import contactRoutesPlugin from "./plugins/ContactRoutes.js";
import paymentRoutesPlugin from "./plugins/PaymentRoutes.js";
import projectRoutesPlugin from "./plugins/ProjectRoutes.js";
import purchaseInvoiceRoutesPlugin from "./plugins/PurchaseInvoiceRoutes.js";
import purchaseOrderRoutesPlugin from "./plugins/PurchaseOrderRoutes.js";
import receiptRoutesPlugin from "./plugins/ReceiptRoutes.js";
import salesInvoiceRoutesPlugin from "./plugins/SalesInvoiceRoutes.js";
import supplierRoutesPlugin from "./plugins/SupplierRoutes.js";
import userRoutesPlugin from "./plugins/UserRoutes.js";

/** Nilai query `token` tidak boleh ikut tercatat di log (Guide §8.3). */
function stripTokenFromUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/gi, "$1[REDACTED]");
}

/**
 * Validasi environment — lebih baik mati di awal daripada error misterius
 * di tengah request.
 */
function assertEnv() {
  const missing = (
    ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"] as const
  ).filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Environment variable berikut belum diisi: ${missing.join(", ")}. ` +
        "Salin .env.example jadi .env lalu lengkapi nilainya.",
    );
  }
}

export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["x-api-key"]',
          "req.body.password",
          "req.body.oldPassword",
          "req.body.newPassword",
          "req.body.token",
          "req.body.refreshToken",
          'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        req(request: {
          method: string;
          url: string;
          ip?: string;
          hostname?: string;
        }) {
          return {
            method: request.method,
            url: stripTokenFromUrl(request.url),
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Logger dipakai juga oleh modul non-Fastify (db/index.ts, migrasi).
  attachLogger(app.log);

  // Zod jadi validator & serializer untuk semua schema route.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // -------------------------------------------------------------------
  // 1. Error handler global — satu-satunya tempat error jadi { error, message }
  // -------------------------------------------------------------------
  app.setErrorHandler((error, request, reply) => {
    // Fastify v5 memberi `error` bertipe unknown. Dipersempit sekali di sini
    // lewat toHttpError(), bukan dengan cast berulang di tiap akses.
    const err = toHttpError(error);

    if (hasZodFastifySchemaValidationErrors(error)) {
      const detail = error.validation
        .map((issue) => {
          const path = issue.instancePath.replace(/^\//, "") || "body";
          return `${path}: ${issue.message}`;
        })
        .join("; ");

      return reply.code(400).send({
        error: ErrorCode.BAD_REQUEST,
        message: `Data yang dikirim tidak valid. ${detail}`,
      });
    }

    if (err.statusCode === 429) {
      return reply.code(429).send({
        error: ErrorCode.TOO_MANY_REQUESTS,
        message: ErrorMessage[ErrorCode.TOO_MANY_REQUESTS],
      });
    }

    // Dilempar @fastify/under-pressure saat load shedding aktif. Tanpa
    // cabang ini ia jatuh ke cabang 500 di bawah dan tersamar jadi
    // "kesalahan server", padahal ini penolakan sementara yang normal.
    if (err.statusCode === 503) {
      request.log.warn(
        { err: error },
        "Menolak request: server di bawah tekanan",
      );
      return reply.code(503).send({
        error: ErrorCode.SERVICE_UNAVAILABLE,
        message:
          "Server sedang menolak trafik karena beban tinggi. Coba lagi sebentar lagi.",
      });
    }

    // Error klien lain yang sudah membawa status code sendiri.
    if (
      err.statusCode !== undefined &&
      err.statusCode >= 400 &&
      err.statusCode < 500
    ) {
      const code = errorCodeForStatus(err.statusCode);

      // Kode internal Fastify (FST_ERR_*) dicatat di log, TIDAK dikirim ke
      // klien — field `error` harus selalu berisi kode dari constants/errors.
      if (err.code) {
        request.log.debug(
          { frameworkCode: err.code, statusCode: err.statusCode },
          "Error klien dari framework",
        );
      }

      return reply.code(err.statusCode).send({
        error: code,
        message: err.message ?? ErrorMessage[code],
      });
    }

    request.log.error({ err: error }, "Unhandled error");

    return reply.code(500).send({
      error: ErrorCode.INTERNAL_SERVER_ERROR,
      message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR],
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: ErrorCode.NOT_FOUND,
      message: `Endpoint ${request.method} ${request.url} tidak ditemukan.`,
    });
  });

  // -------------------------------------------------------------------
  // 2. CORS — longgar di dev, whitelist di produksi
  // -------------------------------------------------------------------
  await app.register(cors, {
    origin:
      env.NODE_ENV === "development"
        ? true
        : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
    credentials: true,
  });

  // -------------------------------------------------------------------
  // 3. Rate limit
  // -------------------------------------------------------------------
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS,
    allowList: env.RATE_LIMIT_ALLOW_LIST,
    keyGenerator: (request) => request.ip,
  });

  // -------------------------------------------------------------------
  // 4. Security headers
  // -------------------------------------------------------------------
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.removeHeader("X-Powered-By");

    if (env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }

    return payload;
  });

  // -------------------------------------------------------------------
  // 5. Auth middleware — preHandler user + onResponse audit log
  // -------------------------------------------------------------------
  await app.register(authMiddlewarePlugin);

  // 6. WebSocket — belum dibutuhkan project ini.

  // -------------------------------------------------------------------
  // 7. Health + load shedding
  // -------------------------------------------------------------------
  await app.register(healthPlugin);

  // -------------------------------------------------------------------
  // 8. Swagger — SEBELUM route bisnis supaya semua route ter-discover
  // -------------------------------------------------------------------
  if (env.ENABLE_SWAGGER) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Clone Manager.io API",
          description:
            "Backend akuntansi multi-tenant. Endpoint ber-scope bisnis membutuhkan header `x-business-id`.",
          version: "1.0.0",
        },
        servers: [{ url: env.APP_PUBLIC_URL }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
        tags: [
          { name: "Health", description: "Status service" },
          { name: "Auth", description: "Login, token, profil sendiri" },
          {
            name: "Business",
            description: "CRUD bisnis dan pengelolaan anggotanya",
          },
          {
            name: "Users",
            description:
              "Pengelolaan user di bisnis aktif (legacy — lihat tag Business)",
          },
           {
             name: "ChartOfAccounts",
             description: "CRUD chart of accounts per bisnis",
           },
           { name: "Customers", description: "CRUD pelanggan per bisnis" },
           { name: "Suppliers", description: "CRUD supplier per bisnis" },
            { name: "BankAccounts", description: "CRUD rekening kas & bank per bisnis" },
            { name: "SalesInvoices", description: "Faktur penjualan + posting jurnal per bisnis" },
            { name: "PurchaseInvoices", description: "Faktur pembelian + posting jurnal per bisnis" },
            { name: "Receipts", description: "Penerimaan kas/bank + posting jurnal per bisnis" },
            { name: "ExpenseClaims", description: "Klaim biaya dan saldo reimbursement" },
            { name: "Payments", description: "Pengeluaran kas/bank + alokasi ke Purchase Invoice per bisnis" },
            { name: "InterAccountTransfers", description: "Transfer antar akun bank/kas + posting jurnal per bisnis" },
            { name: "BankReconciliations", description: "Lembar verifikasi saldo vs rekening koran per bisnis (tanpa posting jurnal)" },
            { name: "JournalEntries", description: "Buku besar semua jurnal + jurnal manual per bisnis" },
            { name: "PurchaseOrders", description: "Pesanan pembelian non-posting + status penagihan per bisnis" },
            { name: "Projects", description: "Pelacakan proyek dan ringkasan keuangan per bisnis" },
         ],
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  // -------------------------------------------------------------------
  // 9. Route bisnis — satu per satu, di root path
  // -------------------------------------------------------------------
  await app.register(authRoutesPlugin);
  await app.register(businessRoutesPlugin);
  await app.register(userRoutesPlugin);
  await app.register(chartOfAccountRoutesPlugin);
  await app.register(customerRoutesPlugin);
  await app.register(supplierRoutesPlugin);
  await app.register(bankAccountRoutesPlugin);
  await app.register(salesInvoiceRoutesPlugin);
  await app.register(purchaseInvoiceRoutesPlugin);
  await app.register(receiptRoutesPlugin);
  await app.register(paymentRoutesPlugin);
  await app.register(expenseClaimRoutesPlugin);
  await app.register(contactRoutesPlugin);
  await app.register(interAccountTransferRoutesPlugin);
  await app.register(bankReconciliationRoutesPlugin);
  await app.register(journalEntryRoutesPlugin);
  await app.register(purchaseOrderRoutesPlugin);
  await app.register(projectRoutesPlugin);

  return app;
}

async function start() {
  assertEnv();

  const app = await buildApp();

  // Migrasi jalan SEBELUM listen (Guide §5.3), supaya container baru
  // selalu selaras dengan skema kode.
  await runMigrations();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} diterima, mematikan server...`);
    await app.close().catch(() => undefined);
    await closePool().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });

    app.log.info(`Backend jalan di http://localhost:${env.PORT}`);
    if (env.ENABLE_SWAGGER) {
      app.log.info(
        `Dokumentasi API tersedia di http://localhost:${env.PORT}/documentation`,
      );
    }
  } catch (error) {
    app.log.error({ err: error }, "Gagal menjalankan server");
    process.exit(1);
  }
}

start();
