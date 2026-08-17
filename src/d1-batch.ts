import type { D1Database } from '@cloudflare/workers-types';
import type { CompiledQuery, QueryResult } from 'kysely';
import { prepareStatement } from './d1-utils.ts';

export interface BatchQuery<O = unknown> {
  compile(): CompiledQuery<O>;
  execute(): Promise<readonly O[]>;
}

type QueryOutput<Q> = Q extends { execute(): Promise<readonly (infer O)[]> } ? O : never;

export type BatchResult<T extends readonly BatchQuery[]> = {
  -readonly [K in keyof T]: QueryResult<QueryOutput<T[K]>>;
};

/** Compiles and executes Kysely query builders atomically using D1's native batch API. */
export async function batch<const T extends readonly BatchQuery[]>(
  database: D1Database,
  queries: T
): Promise<BatchResult<T>> {
  if (queries.length === 0) {
    return [] as unknown as BatchResult<T>;
  }

  const statements = queries.map((query) => prepareStatement(database, query.compile()));

  const results = await database.batch<unknown>(statements);

  return results.map((result) => {
    const meta = result.meta || {};
    return {
      rows: result.results || [],
      numAffectedRows:
        meta.changes !== undefined && meta.changes !== null ? BigInt(meta.changes) : undefined,
      insertId:
        meta.last_row_id !== undefined && meta.last_row_id !== null
          ? BigInt(meta.last_row_id)
          : undefined,
    };
  }) as unknown as BatchResult<T>;
}
