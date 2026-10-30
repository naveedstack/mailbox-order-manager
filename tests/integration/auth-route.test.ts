// Login/logout route handlers against real users with bcrypt hashes.
import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE, verifySession } from "@/server/auth/session-token";
import { prisma } from "@/server/db";
import { resetDatabase } from "./setup/db";
import { postRequest } from "./setup/http";

describe("auth routes", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    const user = await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "Ada",
        role: "ADMIN",
        passwordHash: await bcrypt.hash("Admin123!", 4),
      },
    });
    userId = user.id;
  });

  afterAll(() => prisma.$disconnect());

  it("logs in: 200 with the user and an httpOnly, SameSite=Lax session cookie", async () => {
    const res = await login(
      postRequest("/api/auth/login", {
        body: { email: " Admin@Example.com ", password: "Admin123!" },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { id: userId, email: "admin@example.com", role: "ADMIN" },
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=28800/);

    const token = setCookie.split(";")[0].split("=")[1];
    expect(await verifySession(token)).toEqual({
      userId,
      email: "admin@example.com",
      role: "ADMIN",
    });
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    const wrongPassword = await login(
      postRequest("/api/auth/login", { body: { email: "admin@example.com", password: "nope" } }),
    );
    const unknownEmail = await login(
      postRequest("/api/auth/login", { body: { email: "ghost@example.com", password: "nope" } }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json());
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();
  });

  it("validates the login body: 400", async () => {
    const res = await login(postRequest("/api/auth/login", { body: { email: "nope" } }));

    expect(res.status).toBe(400);
  });

  it("logs out: clears the cookie and redirects to /login with 303", async () => {
    const res = await logout(postRequest("/api/auth/logout"));

    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
  });
});
