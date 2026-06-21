import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type Generated, Kysely } from 'kysely';
import { Miniflare } from 'miniflare';
import { D1Dialect } from '../src/index.ts';

interface UserTable {
  id: Generated<number>;
  name: string;
  age: number;
}

interface Database {
  user: UserTable;
}

let miniflare: Miniflare;
let db: Kysely<Database>;
let dialect: D1Dialect;

beforeAll(async () => {
  // Start Miniflare with a D1 database configured
  miniflare = new Miniflare({
    d1Databases: {
      DB: 'cf-d1-db',
    },
    modules: true,
    script: `
      export default {
        async fetch() {
          return new Response("OK");
        }
      }
    `,
  });

  // Get the D1 Database binding instance
  const d1 = await miniflare.getD1Database('DB');

  // Initialize the dialect and Kysely
  dialect = new D1Dialect({ database: d1 });
  db = new Kysely<Database>({
    dialect,
  });

  // Create test table
  await db.schema
    .createTable('user')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('age', 'integer', (col) => col.notNull())
    .execute();
});

afterAll(async () => {
  // Cleanup Miniflare
  await miniflare.dispose();
});

test('D1 integration: should insert and select rows successfully', async () => {
  // Insert row
  await db.insertInto('user').values({ name: 'Alice', age: 30 }).execute();

  // Select row
  const rows = await db.selectFrom('user').selectAll().execute();

  expect(rows).toHaveLength(1);
  const user = rows[0]!;
  expect(user.id).toBe(1);
  expect(user.name).toBe('Alice');
  expect(user.age).toBe(30);
});

test('D1 integration: should execute batch query successfully', async () => {
  const query1 = db.insertInto('user').values({ name: 'Bob', age: 25 }).compile();

  const query2 = db.insertInto('user').values({ name: 'Charlie', age: 35 }).compile();

  // Run the batch
  const results = await dialect.batch([query1, query2] as const);

  expect(results).toHaveLength(2);
  const result1 = results[0]!;
  const result2 = results[1]!;

  expect(result1.numAffectedRows).toBe(1n);
  expect(result2.numAffectedRows).toBe(1n);

  // Assert rows in database
  const rows = await db
    .selectFrom('user')
    .select(['name', 'age'])
    .where('name', 'in', ['Bob', 'Charlie'])
    .orderBy('age', 'asc')
    .execute();

  expect(rows).toEqual([
    { name: 'Bob', age: 25 },
    { name: 'Charlie', age: 35 },
  ]);
});
