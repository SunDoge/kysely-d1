import type { D1Database } from '@cloudflare/workers-types';
import type {
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
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

  // biome-ignore lint/suspicious/noExplicitAny: Kysely's Dialect interface requires Kysely<any>
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}
