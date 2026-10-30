import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/domain/types";

export type UserCredentials = { id: string; email: string; role: Role; passwordHash: string };

export interface UserRepository {
  findByEmail(email: string): Promise<UserCredentials | null>;
}

export function createUserRepository(db: PrismaClient): UserRepository {
  return {
    findByEmail(email) {
      return db.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true, passwordHash: true },
      });
    },
  };
}
