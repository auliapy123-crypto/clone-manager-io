import type { z } from "zod";

/** Adapter validator Zod -> TanStack Form (dipakai di seluruh form field-level). */
export function zodFieldValidator(schema: z.ZodTypeAny) {
  return ({ value }: { value: unknown }) => {
    const result = schema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  };
}
