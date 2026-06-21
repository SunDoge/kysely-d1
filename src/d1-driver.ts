import type { DatabaseConnection, Driver, TransactionSettings } from 'kysely';
import { D1Connection } from './d1-connection.ts';
import type { D1DialectConfig } from './d1-dialect.ts';

export class D1Driver implements Driver {
  readonly #config: D1DialectConfig;
  #connection?: DatabaseConnection;

  constructor(config: D1DialectConfig) {
    this.#config = config;
  }

  async init(): Promise<void> {
    // D1 does not require async initialization
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.#connection) {
      const database =
        typeof this.#config.database === 'function'
          ? this.#config.database()
          : this.#config.database;
      this.#connection = new D1Connection(database);
    }
    return this.#connection;
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {
    // D1 connections are stateless/connectionless; nothing to release
  }

  async destroy(): Promise<void> {
    // D1 driver doesn't hold persistent resources to destroy
  }

  // D1 是基于 HTTP 请求构建的无状态数据库，由于每次查询可能是独立的物理连接上下文，
  // 导致其不支持跨 HTTP 请求执行传统的交互式事务（即通过 sequential SQL `BEGIN` / `COMMIT`）。
  // D1 SQL 语法引擎也会显式禁止直接单条执行 `BEGIN` / `COMMIT` / `ROLLBACK` 命令。
  // 为了防止开发者编写不具备原子性的“伪事务”代码造成脏数据，我们在此处显式抛出异常，
  // 引导开发者采用 D1 官方支持的 `batch` 原子批处理（D1 会将 batch 中的所有语句置于同一个底层的 SQLite 事务中执行）。
  async beginTransaction(
    _connection: DatabaseConnection,
    _settings: TransactionSettings
  ): Promise<void> {
    throw new Error(
      'Cloudflare D1 does not support interactive transactions spanning multiple HTTP requests. Use dialect.batch() instead.'
    );
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error(
      'Cloudflare D1 does not support interactive transactions spanning multiple HTTP requests. Use dialect.batch() instead.'
    );
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error(
      'Cloudflare D1 does not support interactive transactions spanning multiple HTTP requests. Use dialect.batch() instead.'
    );
  }
}
