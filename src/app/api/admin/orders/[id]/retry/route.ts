import { NextResponse, type NextRequest } from "next/server";
import { orderIdParam, retryInput } from "@/domain/schemas";
import { requireActor } from "@/server/auth/session";
import { orderService } from "@/server/container";
import { readJson, withErrors } from "@/server/http/route";

export const POST = withErrors(
  async (req: NextRequest, ctx: RouteContext<"/api/admin/orders/[id]/retry">) => {
    const actor = await requireActor(req);
    const id = orderIdParam.parse((await ctx.params).id);
    const { reason } = retryInput.parse(await readJson(req, { optional: true }));
    const order = await orderService.retryOrder(actor, id, reason);
    return NextResponse.json({ order });
  },
);
