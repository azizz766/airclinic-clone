import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // DATABASE_URL: transaction pooler locally (port 6543), direct connection in production
    url: process.env.DATABASE_URL!,
    // DIRECT_URL: direct connection only — used by Prisma CLI for migrations/introspection
    // Required because transaction pooler mode cannot run DDL statements
    ...(process.env.DIRECT_URL ? { directUrl: process.env.DIRECT_URL } : {}),
  },
});