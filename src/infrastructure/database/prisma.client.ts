import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.config";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL via Prisma ORM");
  } catch (error) {
    console.error("Failed to connect to PostgreSQL database:", error);
    // Don't crash during build/dry-run if local DB is not currently running
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  console.log("Disconnected from PostgreSQL database");
};
