import type { D1Database } from '@cloudflare/workers-types';
import type {
  CompiledQuery,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
} from 'kysely';
import { SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import { D1Driver } from './d1-driver.ts';

export interface D1DialectConfig {
  /**
   * The D1Database binding instance, or a function that returns it dynamically.
   */
  database: D1Database | (() => D1Database);
}

export class D1Dialect implements Dialect {
  readonly #config: D1DialectConfig;

  constructor(config: D1DialectConfig) {
    this.#config = config;
  }

  createDriver(): Driver {
    return new D1Driver(this.#config);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  // biome-ignore lint/suspicious/noExplicitAny: Kysely 官方的 Dialect 接口定义要求传入 Kysely<any> 类型
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  /**
   * Executes a batch of compiled queries atomically in a single D1 transaction.
   * If any query fails, the entire batch is rolled back.
   */
  // biome-ignore lint/suspicious/noExplicitAny: 用于元组类型推导，必须使用 CompiledQuery<any>[]
  async batch<T extends readonly CompiledQuery<any>[]>(
    compiledQueries: T
  ): Promise<{
    -readonly [K in keyof T]: QueryResult<T[K] extends CompiledQuery<infer O> ? O : unknown>;
  }> {
    if (compiledQueries.length === 0) {
      // Cloudflare D1 不允许传递空数组给 .batch() 执行，这里做防御性拦截，直接返回空结果。
      // biome-ignore lint/suspicious/noExplicitAny: 元组映射返回，需要进行 any 强转
      return [] as any;
    }

    const database =
      typeof this.#config.database === 'function' ? this.#config.database() : this.#config.database;

    const statements = compiledQueries.map((q) => {
      let stmt = database.prepare(q.sql);
      if (q.parameters.length > 0) {
        // 同上，D1 不支持原生绑定 JS bigint 参数，转为 number 规避序列化异常。
        const boundParams = q.parameters.map((p) => (typeof p === 'bigint' ? Number(p) : p));
        stmt = stmt.bind(...boundParams);
      }
      return stmt;
    });

    // biome-ignore lint/suspicious/noExplicitAny: 内部准备好的 D1PreparedStatement 数组不受泛型 T 的限制，使用 any 传递给批处理
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
      // biome-ignore lint/suspicious/noExplicitAny: 结果集需要强制映射为元组泛型返回类型
    }) as any;
  }
}
