// Error mapping for Server Components: a NotFoundError renders the 404 page.
import { notFound } from "next/navigation";
import { NotFoundError } from "@/domain/errors";

export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
