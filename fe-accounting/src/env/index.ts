import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Validasi seluruh env variable saat aplikasi boot (Guide §1, §2).
 * Typo atau variabel hilang -> gagal sejak compile/boot, bukan runtime.
 */
export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_APP_NAME: z.string().min(1),
    VITE_API_URL: z.string().url(),
  },
  runtimeEnv: import.meta.env,
});

export default env;
