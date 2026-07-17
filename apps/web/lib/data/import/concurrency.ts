import "server-only"

/**
 * Run `fn` over `items` with at most `limit` promises in flight, preserving input
 * order in the returned results. Used to parallelise the CSV importers' per-row
 * create round-trips (ORR-761) — N sequential inserts become ceil(N/limit) waves
 * — without an unbounded fan-out that would exhaust the DB connection pool. Each
 * item is still its own call, so per-row error isolation is preserved (a
 * rejection is captured, never thrown).
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let cursor = 0
  const workerCount = Math.min(Math.max(1, limit), Math.max(1, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor
      cursor += 1
      if (i >= items.length) return
      try {
        // eslint-disable-next-line security/detect-object-injection -- i is our own monotonic cursor
        results[i] = { status: "fulfilled", value: await fn(items[i], i) }
      } catch (reason) {
        // eslint-disable-next-line security/detect-object-injection -- i is our own monotonic cursor
        results[i] = { status: "rejected", reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}
