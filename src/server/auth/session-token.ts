// Session tokens: an HS256 JWT in an httpOnly cookie. Deliberately free of
// Next.js imports so proxy.ts, route handlers and tests can all use it.
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { ROLES, type Actor, type AuthUser } from "@/domain/types";

export const SESSION_COOKIE = "mom_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SessionUser = AuthUser;

const claimsSchema = z.object({ sub: z.uuid(), role: z.enum(ROLES), email: z.email() });

// Read on use, not at import: importing must never crash (e.g. during build),
// but a misconfigured secret must fail loudly rather than log everyone out.
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters (see .env.example)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

// Returns null for anything that isn't a valid, unexpired token we signed.
export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return { userId: claims.data.sub, role: claims.data.role, email: claims.data.email };
  } catch {
    return null;
  }
}

export function toActor(user: SessionUser): Actor {
  return { type: user.role, userId: user.userId };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Browsers treat http://localhost as secure, so this is safe for local `next start`.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
