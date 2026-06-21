import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { CompiledQuery } from 'kysely';

/**
 * 将 bigint 安全地转换为 number。
 * 如果值超出 Number.MAX_SAFE_INTEGER 范围，则抛出错误防止静默精度丢失。
 */
function safeBigIntToNumber(value: bigint): number {
  if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
    throw new Error(
      `BigInt value ${value} exceeds Number.MAX_SAFE_INTEGER and cannot be safely bound to D1.`
    );
  }
  return Number(value);
}

/**
 * 将 Kysely 编译后的查询参数绑定到 D1 PreparedStatement 上。
 *
 * Cloudflare D1 驱动层在绑定参数时，如果直接传入 JS bigint 类型值（例如 1n），
 * 会触发运行时序列化错误 (Do not know how to serialize a BigInt)。
 * 这里的处理是将 bigint 安全地转换为 number，并在超出安全整数范围时抛出明确异常。
 */
export function prepareStatement(database: D1Database, query: CompiledQuery): D1PreparedStatement {
  let stmt = database.prepare(query.sql);
  if (query.parameters.length > 0) {
    const boundParams = query.parameters.map((p) =>
      typeof p === 'bigint' ? safeBigIntToNumber(p) : p
    );
    stmt = stmt.bind(...boundParams);
  }
  return stmt;
}
