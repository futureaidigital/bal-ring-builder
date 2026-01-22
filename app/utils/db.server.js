// app/utils/db.server.js
import { PrismaClient } from "@prisma/client";

let prisma;

// Use global to prevent multiple instances in development
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

// Export both ways to support all files
export { prisma };
export default prisma;
export const db = prisma;
