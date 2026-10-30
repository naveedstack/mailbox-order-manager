import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

// Home sends each role to its own start page.
export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect(user.role === "ADMIN" ? "/admin/orders" : "/orders");
}
