type ReadError = {code?: string; message?: string}
type ReadResult<T> = {data: T[] | null; error: ReadError | null}

/** Read small, ordered ranges so a server row cap never silently truncates the index. */
export async function readAllRows<T>(read: (from: number, to: number) => PromiseLike<ReadResult<T>>): Promise<ReadResult<T>> {
  const rows: T[] = []
  const batch = 200
  for (let from = 0; ; from += batch) {
    const result = await read(from, from + batch - 1)
    if (result.error) return {data: null, error: result.error}
    rows.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < batch) return {data: rows, error: null}
  }
}
