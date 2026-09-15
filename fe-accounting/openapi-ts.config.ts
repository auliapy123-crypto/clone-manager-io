import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "http://localhost:8014/documentation/json",
  output: "src/integrations/generated-clients/accounting-client",
  plugins: ["@hey-api/schemas", "@hey-api/sdk", "@tanstack/react-query"],
});