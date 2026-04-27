import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first (overrides .env) so Prisma CLI picks up the same
// credentials as the Next.js dev server.
config({ path: ".env.local", override: true });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma CLI (migrate, generate, introspect) requires a direct connection.
    // Runtime PrismaClient uses DATABASE_URL (pooler) via PrismaPg adapter in lib/prisma.ts.
    url: process.env.DIRECT_URL!,
  },
});