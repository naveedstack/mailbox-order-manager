// Runs fn over items with at most `limit` calls in flight; results keep input
// order. On the first rejection no new items are started, in-flight calls are
// awaited (so nothing keeps writing after we return), then the error is thrown.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function lane(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const lanes = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  const rejection = lanes.find((lane) => lane.status === "rejected");
  if (rejection) throw rejection.reason;
  return results;
}
