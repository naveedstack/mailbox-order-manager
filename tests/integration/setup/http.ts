// Builds requests for calling route handlers directly (no running server).
import { NextRequest } from "next/server";
import type { Role } from "@/domain/types";
import { SESSION_COOKIE, signSession } from "@/server/auth/session-token";

export async function sessionCookie(user: { id: string; email: string; role: Role }) {
  const token = await signSession({ userId: user.id, email: user.email, role: user.role });
  return `${SESSION_COOKIE}=${token}`;
}

export function postRequest(
  path: string,
  options: { body?: unknown; rawBody?: string; cookie?: string } = {},
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.cookie) headers.set("cookie", options.cookie);
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body });
}

export const routeParams = <T extends Record<string, string>>(params: T) => ({
  params: Promise.resolve(params),
});
