/**
 * HealthPlugin (Guide §3.1, §7.1 langkah 7, §7.4).
 *
 * KENAPA `exposeStatusRoute` TIDAK DIPAKAI
 * ---------------------------------------
 * @fastify/under-pressure mendaftarkan route status bawaannya dengan JSON
 * Schema mentah (`{ type: 'object', properties: { status: ... } }`).
 * Aplikasi ini memasang serializer Zod secara global (index.ts), dan
 * `fastify-type-provider-zod` melempar "Invalid schema passed" untuk skema
 * respons yang bukan Zod — hasilnya /health balas 500
 * FST_ERR_FAILED_ERROR_SERIALIZATION.
 *
 * Jadi route /health ditulis sendiri di sini dengan skema Zod, dan
 * under-pressure tetap dipakai untuk tugas aslinya: load shedding.
 * Bonusnya, payload jadi patuh format baku `{ data }` (§7.3) — route bawaan
 * under-pressure mengembalikan objek telanjang tanpa pembungkus.
 *
 * TIGA STATUS DATABASE, BUKAN DUA
 * -------------------------------
 * Probe `SELECT 1` punya tiga kemungkinan hasil yang artinya berbeda:
 *
 *   up      - menjawab dalam batas waktu. Sehat.
 *   timeout - tidak menjawab dalam 2 detik, TAPI juga tidak melempar error.
 *             Ini yang terjadi saat compute Neon bangun dari scale-to-zero:
 *             database baik-baik saja, cuma sedang menyalakan diri.
 *             Hasilnya INCONCLUSIVE, bukan kegagalan.
 *   down    - koneksi benar-benar gagal (ditolak, auth salah, host tidak
 *             ketemu). Ini kegagalan nyata.
 *
 * Menyamakan `timeout` dengan `down` membuat /health melapor `degraded`
 * tiap kali Neon bangun — alarm palsu. Tapi menganggap SEMUA timeout
 * sebagai cold start juga salah: database yang hang beneran juga timeout,
 * dan itu tidak boleh tersamar selamanya. Jadi timeout dihitung: sekali-dua
 * kali dianggap `warming`, tapi setelah MAX_CONSECUTIVE_TIMEOUTS berturut-turut
 * statusnya naik jadi `degraded`.
 *
 * Aturan §7.4 yang tetap dipegang: apa pun hasilnya, HTTP-nya 200. Proses
 * masih hidup dan siap melayani begitu DB balik; orchestrator jangan
 * me-restart container hanya karena database sedang bermasalah.
 *
 * /health juga dibebaskan dari rate-limit dan dari load shedding, supaya
 * tetap terbaca justru saat server sedang bermasalah.
 */
import underPressure from "@fastify/under-pressure";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import env from "../constants/env.js";
import { ErrorCode } from "../constants/errors.js";
import { pingDatabase, poolStats } from "../db/index.js";
import { sendData } from "../libs/reply.js";

/** Batas tunggu satu probe `SELECT 1` (Guide §7.4: 2 detik). */
const DB_PROBE_TIMEOUT_MS = 2000;

/**
 * Berapa kali timeout beruntun sebelum dianggap masalah nyata.
 * Cold start Neon biasanya selesai dalam satu-dua probe; hang beneran tidak.
 */
const MAX_CONSECUTIVE_TIMEOUTS = 3;

type DatabaseStatus = "up" | "timeout" | "down";
type OverallStatus = "ok" | "warming" | "degraded";

export const HealthResponseSchema = z.object({
  data: z.object({
    status: z.enum(["ok", "warming", "degraded"]),
    environment: z.string(),
    uptimeSeconds: z.number(),
    database: z.object({
      status: z.enum(["up", "timeout", "down"]),
      /** Hanya terisi saat status "up". */
      latencyMs: z.number().nullable(),
      probeTimeoutMs: z.number(),
      consecutiveTimeouts: z.number(),
    }),
    pool: z.object({
      total: z.number(),
      idle: z.number(),
      waiting: z.number(),
    }),
    process: z.object({
      rssBytes: z.number(),
      heapUsedBytes: z.number(),
      eventLoopDelayMs: z.number().nullable(),
    }),
    timestamp: z.string(),
  }),
});

/** Penanda bahwa probe kehabisan waktu, bukan gagal. */
class ProbeTimeoutError extends Error {
  constructor() {
    super(`DB probe melewati ${DB_PROBE_TIMEOUT_MS} ms`);
    this.name = "ProbeTimeoutError";
  }
}

interface DbProbe {
  status: DatabaseStatus;
  latencyMs: number | null;
  /** Hanya untuk log server — TIDAK pernah ikut ke respons. Pesan error
   *  koneksi bisa memuat host/kredensial, dan /health tanpa autentikasi. */
  error: unknown;
}

async function probeDatabase(): Promise<DbProbe> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      pingDatabase(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ProbeTimeoutError()),
          DB_PROBE_TIMEOUT_MS,
        );
      }),
    ]);

    return { status: "up", latencyMs: Date.now() - startedAt, error: null };
  } catch (error) {
    if (error instanceof ProbeTimeoutError) {
      return { status: "timeout", latencyMs: null, error: null };
    }
    return { status: "down", latencyMs: null, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveOverallStatus(
  database: DatabaseStatus,
  consecutiveTimeouts: number,
): OverallStatus {
  if (database === "up") return "ok";
  if (database === "down") return "degraded";

  // timeout: masih dianggap wajar selama belum berulang terlalu sering.
  return consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS ? "degraded" : "warming";
}

async function healthPlugin(fastify: FastifyInstance) {
  // Load shedding saja — tanpa exposeStatusRoute, tanpa healthCheck berkala.
  // Cek DB dilakukan on-demand di handler supaya tidak ada query latar
  // belakang tiap beberapa detik ke database.
  await fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxEventLoopUtilization: 0.98,
    retryAfter: 50,
    // Handler yang tidak mengirim respons = request diteruskan. /health
    // harus tetap terbaca justru ketika server sedang kelebihan beban,
    // jadi ia dilewatkan sementara route lain ditolak 503.
    // Ditaruh di opsi plugin (bukan di `config` route) supaya tidak
    // bergantung pada augmentasi tipe FastifyContextConfig.
    pressureHandler: (request, reply) => {
      if (request.url.startsWith("/health")) return;

      reply.code(503).send({
        error: ErrorCode.SERVICE_UNAVAILABLE,
        message:
          "Server sedang menolak trafik karena beban tinggi. Coba lagi sebentar lagi.",
      });
    },
  });

  // Dihitung lintas request. Di-reset begitu ada probe yang bukan timeout.
  let consecutiveTimeouts = 0;

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/health",
    {
      logLevel: "warn",
      config: {
        // Dibaca @fastify/rate-limit: endpoint ini tidak dibatasi.
        rateLimit: false,
      },
      schema: {
        tags: ["Health"],
        operationId: "getHealth",
        summary: "Status backend, database, dan pool koneksi",
        description: [
          "Tidak butuh autentikasi. SELALU balas HTTP 200 — kondisi dibaca dari `data.status`.",
          "",
          "- `ok` — semuanya sehat.",
          "- `warming` — database belum menjawab dalam batas waktu, tapi juga tidak error.",
          "  Lazimnya compute Neon sedang bangun dari scale-to-zero. Anggap masih sehat;",
          "  jangan restart, jangan alarm.",
          "- `degraded` — koneksi database gagal, atau sudah timeout beruntun",
          `  ${MAX_CONSECUTIVE_TIMEOUTS} kali. Ini yang layak dialarmkan.`,
          "",
          "`data.database.status` memisahkan `up` / `timeout` / `down` kalau butuh detailnya.",
        ].join("\n"),
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const probe = await probeDatabase();

      if (probe.status === "timeout") {
        consecutiveTimeouts += 1;
        request.log.warn(
          {
            consecutiveTimeouts,
            probeTimeoutMs: DB_PROBE_TIMEOUT_MS,
          },
          "Health: database tidak menjawab dalam batas waktu",
        );
      } else {
        consecutiveTimeouts = 0;

        if (probe.status === "down") {
          request.log.error(
            { err: probe.error },
            "Health: koneksi database gagal",
          );
        }
      }

      // memoryUsage() didekorasi under-pressure. Diakses defensif supaya
      // handler tidak ikut jatuh kalau dekoratornya belum terpasang.
      const pressure = (
        fastify as unknown as {
          memoryUsage?: () => { eventLoopDelay?: number };
        }
      ).memoryUsage?.();

      const memory = process.memoryUsage();

      return sendData(reply, {
        status: resolveOverallStatus(probe.status, consecutiveTimeouts),
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        database: {
          status: probe.status,
          latencyMs: probe.latencyMs,
          probeTimeoutMs: DB_PROBE_TIMEOUT_MS,
          consecutiveTimeouts,
        },
        pool: poolStats(),
        process: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          eventLoopDelayMs: pressure?.eventLoopDelay ?? null,
        },
        timestamp: new Date().toISOString(),
      });
    },
  );
}

export const healthPluginInstance = fp(healthPlugin, { name: "health-plugin" });

export default healthPluginInstance;
