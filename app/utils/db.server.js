// app/utils/db.server.js
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

let prisma;

// Check if we should use Turso (when TURSO_DATABASE_URL and auth token are present)
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (tursoUrl && tursoToken) {
  // Use Turso with libSQL adapter in production
  const libsql = createClient({
    url: tursoUrl,
    authToken: tursoToken,
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
