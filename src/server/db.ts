import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";

export type { Prisma } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

type Client = ReturnType<typeof createClient>;

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { __audittrailPrisma?: Client };

export const db: Client = globalForPrisma.__audittrailPrisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__audittrailPrisma = db;
}

/** The client type available inside an interactive transaction. */
export type Tx = Parameters<Parameters<Client["$transaction"]>[0]>[0];
/** Either the root client or a transaction client. */
export type DbClient = Client | Tx;
