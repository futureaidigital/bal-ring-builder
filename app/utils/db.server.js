// app/utils/db.server.js
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

let prisma;

if (process.env.NODE_ENV === "production" && process.env.TURSO_DATABASE_URL) {
  // Use Turso in production - Prisma 7.x direct instantiation
  const adapter = new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  prisma = new PrismaClient({ adapter });
} else {
  // Use local SQLite in development
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

// Export both ways to support all files
export { prisma };
export default prisma;
export const db = prisma;
