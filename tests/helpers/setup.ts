import { afterAll } from "vitest";
import { db } from "@/server/db";

afterAll(async () => {
  await db.$disconnect();
});
