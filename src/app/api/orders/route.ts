import { NextResponse, type NextRequest } from "next/server";
import { createOrderInput } from "@/domain/schemas";
import { requireActor } from "@/server/auth/session";
import { orderService } from "@/server/container";
import { readJson, withErrors } from "@/server/http/route";

// 201 when the order is created, 200 when the idempotency key was replayed.
export const POST = withErrors(async (req: NextRequest) => {
  const actor = await requireActor(req);
  const input = createOrderInput.parse(await readJson(req));
  const { order, created } = await orderService.createOrder(actor, input);
  return NextResponse.json({ order }, { status: created ? 201 : 200 });
});
