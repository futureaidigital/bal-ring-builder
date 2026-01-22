// app/utils/db.server.js
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

let prisma;

// Check if we should use Turso (when auth token is present)
const useTurso = process.env.TURSO_AUTH_TOKEN && process.env.DATABASE_URL?.startsWith("libsql://");

if (useTurso) {
  // Use Turso with libSQL adapter
  const libsql = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const adapter = new PrismaLibSQL(libsql);
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
