import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

// interactive transactions (create unit + move tenant in, rent records…) make many round trips; the 5 s default is too tight for a remote database
export const db = g.prisma ?? new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
if (process.env.NODE_ENV !== "production") g.prisma = db;
