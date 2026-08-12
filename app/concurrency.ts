/**
 * A few at a time.
 *
 * Two places want the same thing for the same reason — the parts of an upload
 * on the way to the store, and the records of a submission on the way back from
 * another service. Both are waiting on somebody else, so doing one at a time
 * makes the whole batch as slow as the sum of its pieces; and both are somebody
 * else's service, so doing all of them at once is not a request to make.
 *
 * **Answers come back in the order the items were given**, whatever order they
 * finished in.
 */
export async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const answers = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index]
      if (item !== undefined) answers[index] = await run(item, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return answers
}
