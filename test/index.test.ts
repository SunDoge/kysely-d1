import { expect, test } from 'bun:test';
import type { D1Database, D1Result } from '@cloudflare/workers-types';
import { Kysely } from 'kysely';
import { batch, D1Dialect } from '../src/index.ts';

test('D1Dialect executes query successfully', async () => {
  const executedQueries: { sql: string; params: any[] }[] = [];

  // Mock D1Database prepare and bind behavior
  const mockD1 = {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return {
            async all() {
              executedQueries.push({ sql, params });
              return {
                success: true,
                results: [{ id: 1, name: 'Test' }],
                meta: {
                  changes: 0,
                  last_row_id: 1,
                  duration: 1.5,
                  size_after: 0,
                  rows_read: 1,
                  rows_written: 0,
                },
              } as D1Result<any>;
            },
          };
        },
        async all() {
          executedQueries.push({ sql, params: [] });
          return {
            success: true,
            results: [{ id: 1, name: 'Test' }],
            meta: {
              changes: 0,
              last_row_id: 1,
              duration: 1.5,
              size_after: 0,
              rows_read: 1,
              rows_written: 0,
            },
          } as D1Result<any>;
        },
      } as any;
    },
  } as unknown as D1Database;

  const db = new Kysely<{ test: { id: number; name: string } }>({
    dialect: new D1Dialect({ database: mockD1 }),
  });

  const result = await db.selectFrom('test').select(['id', 'name']).where('id', '=', 1).execute();

  // Assert rows returned correctly
  expect(result).toEqual([{ id: 1, name: 'Test' }]);

  // Assert compiled SQL and bindings
  expect(executedQueries).toHaveLength(1);
  const q = executedQueries[0]!;
  expect(q.sql).toBe('select "id", "name" from "test" where "id" = ?');
  expect(q.params).toEqual([1]);
});

test('batch executes queries successfully', async () => {
  const executedBatchQueries: { sql: string; params: any[] }[] = [];

  const mockD1 = {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return { sql, params };
        },
      } as any;
    },
    async batch(statements: any[]) {
      statements.forEach((stmt) => {
        executedBatchQueries.push({ sql: stmt.sql, params: stmt.params || [] });
      });
      return [
        {
          success: true,
          results: [{ id: 1, name: 'Alice' }],
          meta: {
            changes: 1,
            last_row_id: 1,
            duration: 1,
            size_after: 0,
            rows_read: 1,
            rows_written: 1,
          },
        },
        {
          success: true,
          results: [{ id: 2, name: 'Bob' }],
          meta: {
            changes: 1,
            last_row_id: 2,
            duration: 1,
            size_after: 0,
            rows_read: 1,
            rows_written: 1,
          },
        },
      ] as any[];
    },
  } as unknown as D1Database;

  const dialect = new D1Dialect({ database: mockD1 });
  const db = new Kysely<{ test: { id: number; name: string } }>({
    dialect,
  });

  const query1 = db.insertInto('test').values({ id: 1, name: 'Alice' }).compile();
  const query2 = db.insertInto('test').values({ id: 2, name: 'Bob' }).compile();

  const results = await batch(mockD1, [query1, query2]);

  expect(results).toHaveLength(2);
  const result1 = results[0]!;
  const result2 = results[1]!;
  expect(result1.rows as any).toEqual([{ id: 1, name: 'Alice' }]);
  expect(result1.numAffectedRows).toBe(1n);
  expect(result1.insertId).toBe(1n);

  expect(result2.rows as any).toEqual([{ id: 2, name: 'Bob' }]);
  expect(result2.numAffectedRows).toBe(1n);
  expect(result2.insertId).toBe(2n);

  expect(executedBatchQueries).toHaveLength(2);
  const batchQ1 = executedBatchQueries[0]!;
  const batchQ2 = executedBatchQueries[1]!;
  expect(batchQ1.sql).toBe('insert into "test" ("id", "name") values (?, ?)');
  expect(batchQ1.params).toEqual([1, 'Alice']);
  expect(batchQ2.sql).toBe('insert into "test" ("id", "name") values (?, ?)');
  expect(batchQ2.params).toEqual([2, 'Bob']);
});

test('D1Dialect throws error when starting an interactive transaction', async () => {
  const mockD1 = {
    prepare() {
      return {} as any;
    },
  } as unknown as D1Database;

  const db = new Kysely<{ test: { id: number; name: string } }>({
    dialect: new D1Dialect({ database: mockD1 }),
  });

  expect(
    db.transaction().execute(async () => {
      // should throw before executing callback
    })
  ).rejects.toThrow(
    'Cloudflare D1 does not support interactive transactions spanning multiple HTTP requests. Use batch() instead.'
  );
});

test('batch handles an empty array', async () => {
  const mockD1 = {} as unknown as D1Database;
  const results = await batch(mockD1, []);
  expect(results).toEqual([]);
});

test('batch serializes bigint parameters to number', async () => {
  const executedQueries: { sql: string; params: any[] }[] = [];

  const mockD1 = {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return { sql, params };
        },
      } as any;
    },
    async batch(statements: any[]) {
      statements.forEach((stmt) => {
        executedQueries.push({ sql: stmt.sql, params: stmt.params || [] });
      });
      return [
        {
          success: true,
          results: [],
          meta: {},
        },
      ] as any[];
    },
  } as unknown as D1Database;

  const dialect = new D1Dialect({ database: mockD1 });
  const db = new Kysely<{ test: { id: bigint; name: string } }>({
    dialect,
  });

  const query = db
    .selectFrom('test')
    .selectAll()
    .where('id', '=', 9007199254740991n) // JS safe max int in bigint form
    .compile();

  await batch(mockD1, [query]);

  expect(executedQueries).toHaveLength(1);
  const q = executedQueries[0]!;
  expect(q.params[0]).toBe(9007199254740991); // should be mapped to number
  expect(typeof q.params[0]).toBe('number');
});

test('batch throws on bigint exceeding Number.MAX_SAFE_INTEGER', async () => {
  const mockD1 = {
    prepare() {
      return {
        bind() {
          return { sql: '', params: [] };
        },
      } as any;
    },
    async batch() {
      return [] as any[];
    },
  } as unknown as D1Database;

  const dialect = new D1Dialect({ database: mockD1 });
  const db = new Kysely<{ test: { id: bigint; name: string } }>({
    dialect,
  });

  // 2^53 exceeds Number.MAX_SAFE_INTEGER (2^53 - 1)
  const unsafeValue = BigInt(2) ** BigInt(53);
  const query = db.selectFrom('test').selectAll().where('id', '=', unsafeValue).compile();

  expect(batch(mockD1, [query])).rejects.toThrow('exceeds Number.MAX_SAFE_INTEGER');
});

test('D1Dialect executeQuery converts bigint parameters to number', async () => {
  const executedQueries: { sql: string; params: any[] }[] = [];

  const mockD1 = {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return {
            async all() {
              executedQueries.push({ sql, params });
              return { success: true, results: [], meta: {} } as any;
            },
          };
        },
      } as any;
    },
  } as unknown as D1Database;

  const db = new Kysely<{ test: { id: bigint; name: string } }>({
    dialect: new D1Dialect({ database: mockD1 }),
  });

  await db.selectFrom('test').selectAll().where('id', '=', 42n).execute();

  expect(executedQueries).toHaveLength(1);
  const q = executedQueries[0]!;
  expect(q.params[0]).toBe(42);
  expect(typeof q.params[0]).toBe('number');
});

test('D1Dialect supports factory function for database config', async () => {
  let callCount = 0;
  const mockD1 = {
    prepare(_sql: string) {
      return {
        bind(..._params: any[]) {
          return {
            async all() {
              return { success: true, results: [{ count: 1 }], meta: {} } as any;
            },
          };
        },
        async all() {
          return { success: true, results: [{ count: 1 }], meta: {} } as any;
        },
      } as any;
    },
  } as unknown as D1Database;

  const factory = () => {
    callCount++;
    return mockD1;
  };

  const db = new Kysely<{ test: { id: number; name: string } }>({
    dialect: new D1Dialect({ database: factory }),
  });

  // Each query should invoke the factory function (no connection caching)
  await db.selectFrom('test').selectAll().execute();
  await db.selectFrom('test').selectAll().execute();

  expect(callCount).toBe(2);
});
