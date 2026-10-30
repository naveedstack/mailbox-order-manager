// Reading the session in Next.js. Route handlers read the cookie from the
// request (works outside a request scope, so they can be tested directly);
// Server Components use next/headers. Never import this from container.ts.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { UnauthorizedError } from "@/domain/errors";
import type { Actor } from "@/domain/types";
import { SESSION_COOKIE, toActor, verifySession, type SessionUser } from "./session-token";

// Route handlers: throws UnauthorizedError (-> 401) without a valid session.
export async function requireActor(req: NextRequest): Promise<Actor> {
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new UnauthorizedError();
  return toActor(user);
}

// Server Components.
export async function getSession(): Promise<SessionUser | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
