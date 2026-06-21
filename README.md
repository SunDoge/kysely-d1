# @sundoge/kysely-d1

A robust, type-safe [Kysely](https://github.com/kysely-org/kysely) dialect for [Cloudflare D1](https://developers.cloudflare.com/d1/), designed with advanced features like dynamic bindings, native batch execution, and safe `BigInt` serialization.

[![npm version](https://img.shields.io/npm/v/@sundoge/kysely-d1.svg?style=flat-square)](https://www.npmjs.com/package/@sundoge/kysely-d1)
[![License](https://img.shields.io/npm/l/@sundoge/kysely-d1.svg?style=flat-square)](https://github.com/SunDoge/kysely-d1/blob/main/LICENSE)
[![CI Status](https://img.shields.io/github/actions/workflow/status/SunDoge/kysely-d1/test.yml?branch=main&style=flat-square)](https://github.com/SunDoge/kysely-d1/actions)

---

## 🚀 Key Advantages

Compared to other Kysely D1 dialects (like `kysely-d1`), `@sundoge/kysely-d1` provides several significant quality-of-life and performance enhancements:

| Feature | `@sundoge/kysely-d1` | `aidenwallis/kysely-d1` | Why it matters |
| :--- | :---: | :---: | :--- |
| **Dynamic Database Getter** | **Yes** (`() => D1Database`) | No (Static only) | Crucial for SSR/Next.js/Pages where environment bindings (`env.DB`) are only available per-request rather than at startup/module-evaluation time. |
| **Native D1 Batching** | **Yes** (via `dialect.batch(...)`) | No | Executes multiple queries atomically in a single network request to D1, reducing HTTP overhead. |
| **Tuple Type Inference** | **Yes** (Strict Tuple Output) | No | `dialect.batch([q1, q2])` automatically infers the return type as `[QueryResult<T1>, QueryResult<T2>]` without manual casting. |
| **Safe `BigInt` Binding** | **Yes** (Auto-serializes) | No | D1 normally crashes when binding JS `bigint` (e.g. `1n`). We automatically convert it to `number` if it fits within safe limits, or throw a clear error. |
| **Modern Built-in Tests** | **Yes** (Miniflare 4 + Bun) | Prettier / Pre-v4 | Validated under mock workers and modern sandbox runtimes. |

---

## 📦 Installation

Install the package via your preferred package manager:

```bash
# Using bun (recommended)
bun add @sundoge/kysely-d1

# Using npm
npm install @sundoge/kysely-d1

# Using pnpm
pnpm add @sundoge/kysely-d1
```

> **Note:** Ensure you also have `kysely` installed as a dependency.

---

## 🛠️ Usage

### 1. Basic Setup

Bind your Kysely instance by providing the static D1 Database instance.

```typescript
import { Kysely } from 'kysely';
import { D1Dialect } from '@sundoge/kysely-d1';

interface UserTable {
  id: number;
  name: string;
}

interface Database {
  users: UserTable;
}

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = new Kysely<Database>({
      dialect: new D1Dialect({
        database: env.DB,
      }),
    });

    const results = await db.selectFrom('users').selectAll().execute();
    return new Response(JSON.stringify(results));
  }
}
```

### 2. Dynamic Database Binding (Getter)

In many scenarios (such as Next.js Edge Runtime or complex Cloudflare Pages set ups), bindings are not globally available. You can pass a resolver function to dynamically fetch the database instance on each query execution:

```typescript
// Define db at the module level
let currentEnv: Env;

export const db = new Kysely<Database>({
  dialect: new D1Dialect({
    // Dynamically resolve D1 binding during query time
    database: () => currentEnv.DB,
  }),
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    currentEnv = env; // Update environment bindings

    const results = await db.selectFrom('users').selectAll().execute();
    return new Response(JSON.stringify(results));
  }
}
```

### 3. Atomic Batching with Strict Types

Use D1's native performance batching. Pass multiple compiled Kysely queries to execute them in a single database transaction. The return types are statically typed to match the input query structures.

```typescript
const dialect = new D1Dialect({ database: env.DB });
const db = new Kysely<Database>({ dialect });

const q1 = db.insertInto('users').values({ name: 'Alice' }).compile();
const q2 = db.selectFrom('users').selectAll().compile();

// Statically typed as [QueryResult<InsertResult>, QueryResult<UserTable>]
const [insertResult, usersResult] = await dialect.batch([q1, q2]);
```

### 4. BigInt Support

Normally, passing JavaScript `BigInt` (like `123n`) directly into D1 prepared statement parameters results in a serialization crash: `Do not know how to serialize a BigInt`.

`@sundoge/kysely-d1` intercepts parameter bindings:
- If a `bigint` is within the safe range (`-9007199254740991` to `9007199254740991`), it is safely converted to a `number`.
- If it exceeds `Number.MAX_SAFE_INTEGER`, it throws an explicit error immediately, preventing silent database truncation or precision loss.

---

## 🧪 Development & Testing

This project uses [Bun](https://bun.sh) and [Miniflare 4](https://miniflare.dev/) for local integration testing.

```bash
# Run Biome checks (linting & formatting)
bun run check

# Run integration tests
bun run test
```

## 📄 License

MIT © [SunDoge](https://github.com/SunDoge)
