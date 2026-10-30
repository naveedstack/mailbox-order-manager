import { NextResponse, type NextRequest } from "next/server";
import { loginInput } from "@/domain/schemas";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/server/auth/session-token";
import { authService } from "@/server/container";
import { readJson, withErrors } from "@/server/http/route";

export const POST = withErrors(async (req: NextRequest) => {
  const input = loginInput.parse(await readJson(req));
  const user = await authService.login(input);

  const res = NextResponse.json({ user: { id: user.userId, email: user.email, role: user.role } });
  res.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
  return res;
});
