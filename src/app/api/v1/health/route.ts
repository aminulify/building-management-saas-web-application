import { db } from "@/lib/db";
import { route } from "@/lib/api/handler";

export const GET = route(async () => {
  await db.$queryRaw`SELECT 1`;
  return { status: "ok" };
});
