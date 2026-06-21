import type { D1Database } from '@cloudflare/workers-types';
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely';
import { prepareStatement } from './d1-utils.ts';

export class D1Connection implements DatabaseConnection {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    // D1 没有区分读写操作的 API，统一使用 all() 来获取结果和元数据。
    // 对于写操作（INSERT/UPDATE/DELETE），all() 同样会返回正确的 meta 信息。
    const stmt = prepareStatement(this.#db, compiledQuery);
    const result = await stmt.all<O>();
    const meta = result.meta || {};

    const numAffectedRows =
      meta.changes !== undefined && meta.changes !== null ? BigInt(meta.changes) : undefined;

    const insertId =
      meta.last_row_id !== undefined && meta.last_row_id !== null
        ? BigInt(meta.last_row_id)
        : undefined;

    return {
      rows: result.results || [],
      numAffectedRows,
      insertId,
    };
  }

  streamQuery<O>(
    _compiledQuery: CompiledQuery,
    _chunkSize: number
  ): AsyncIterableIterator<QueryResult<O>> {
    throw new Error('Cloudflare D1 does not support streaming queries.');
  }
}
