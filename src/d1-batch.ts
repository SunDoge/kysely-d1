import type { D1Database } from '@cloudflare/workers-types';
import type { CompiledQuery, QueryResult } from 'kysely';
import { prepareStatement } from './d1-utils.ts';

// biome-ignore lint/suspicious/noExplicitAny: tuple inference requires queries with different result types
export type BatchResult<T extends readonly CompiledQuery<any>[]> = {
  -readonly [K in keyof T]: QueryResult<T[K] extends CompiledQuery<infer O> ? O : unknown>;
};

/** Executes compiled queries atomically using D1's native batch API. */
// biome-ignore lint/suspicious/noExplicitAny: tuple inference requires queries with different result types
export async function batch<const T extends readonly CompiledQuery<any>[]>(
  database: D1Database,
  compiledQueries: T
): Promise<BatchResult<T>> {
  if (compiledQueries.length === 0) {
    // biome-ignore lint/suspicious/noExplicitAny: an empty tuple is a valid mapped tuple result
    return [] as any;
  }

  const statements = compiledQueries.map((query) => prepareStatement(database, query));

  // biome-ignore lint/suspicious/noExplicitAny: D1 cannot express heterogeneous batch result tuples
  const results = await database.batch<any>(statements);

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
    // biome-ignore lint/suspicious/noExplicitAny: results map back to the input query tuple
  }) as any;
}
