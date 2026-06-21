import type { D1Database } from '@cloudflare/workers-types';
import type { CompiledQuery, DatabaseConnection, QueryResult } from 'kysely';

export class D1Connection implements DatabaseConnection {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    let stmt = this.#db.prepare(compiledQuery.sql);

    if (compiledQuery.parameters.length > 0) {
      // Cloudflare D1 驱动层在绑定参数时，如果直接传入 JS bigint 类型值（例如 1n），
      // 会触发运行时序列化错误 (Do not know how to serialize a BigInt)。
      // 这里的处理是将 bigint 安全地转换为 number。SQLite 的整型大小符合 Number.MAX_SAFE_INTEGER，
      // 大部分自增 ID 和常规数值转换后不会有精度丢失风险。
      const boundParams = compiledQuery.parameters.map((p) =>
        typeof p === 'bigint' ? Number(p) : p
      );
      stmt = stmt.bind(...boundParams);
    }

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
