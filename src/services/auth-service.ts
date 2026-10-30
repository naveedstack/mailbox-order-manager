// Credential check. Issuing the session cookie is the route handler's job.
import bcrypt from "bcryptjs";
import { UnauthorizedError } from "@/domain/errors";
import type { LoginInput } from "@/domain/schemas";
import type { AuthUser } from "@/domain/types";
import type { UserRepository } from "@/repositories/user-repository";

// Compared against when the email is unknown, so both failure paths cost one
// bcrypt comparison and response time doesn't reveal which emails exist.
const DUMMY_HASH = "$2b$10$Du22CeKM9kq1guQZL7x72.sj6ro4OaucPNUtZ9gGTGx42xHTXWso6";

export function createAuthService(deps: { users: UserRepository }) {
  const { users } = deps;

  return {
    async login(input: LoginInput): Promise<AuthUser> {
      const user = await users.findByEmail(input.email);
      const passwordMatches = await bcrypt.compare(
        input.password,
        user?.passwordHash ?? DUMMY_HASH,
      );
      if (!user || !passwordMatches) {
        throw new UnauthorizedError("Invalid email or password");
      }
      return { userId: user.id, role: user.role, email: user.email };
    },
  };
}
