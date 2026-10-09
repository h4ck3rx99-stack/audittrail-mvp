import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL may be absent when only generating the client (e.g. in a Docker build stage).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
