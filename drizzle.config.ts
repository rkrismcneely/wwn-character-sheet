import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/auth-schema.generated.ts"],
  dialect: "sqlite",
});
