# omymongo

A predictable, TypeScript-first MongoDB ODM. Mongoose ergonomics without the quirks.

> Built for teams that want Prisma-level type confidence with MongoDB's full flexibility.

## TL;DR

```text
Why omymongo?

- No silent casting       (unlike Mongoose)
- Fully inferred types    (no schema duplication)
- Deterministic hooks     (no surprises)
- Zero abstraction leakage — what you write is what Mongo executes

→ Use it if you want Mongoose DX without Mongoose behavior
```

## Inspiration

omymongo is inspired by tools that made database work feel productive and safe:

- Mongoose for clean model-like APIs
- Prisma for type safety and confidence while coding
- Zod for explicit runtime validation
- Native MongoDB driver for flexibility and performance

The goal: keep MongoDB close to native behavior while giving you safer defaults and fluent APIs.

## Why This Library

MongoDB projects often force a trade-off between convenience and control. omymongo gives you both — without the footguns.

- **No silent type casting** — Zod validates on every write and every full-document read; bad data throws, it doesn't slip through. Projection and lean queries intentionally skip validation.
- **Fully inferred types without duplication** — define your schema once, get filter, update, and return types for free
- **Deterministic middleware** — pre/post hooks run in registration order; all registered hooks execute in order even if one fails, then the operation aborts with the first hook error
- **Fluent queries that stay type-safe** — chain `.where()`, `.sort()`, `.limit()` without losing autocomplete
- **Close-to-native behavior** — operations map directly to native MongoDB driver calls while layering explicit validation, hooks, and soft-delete scoping

> **On validation overhead:** Zod runs only on full-document reads and writes, not on lean/projection queries. Pass `{ skipValidation: true }` in read options to bypass validation on hot paths.

Use omymongo if you've hit Mongoose's TypeScript limits or the native driver's verbosity.

### Built with serverless in mind

Mongoose struggles in Lambda and other short-lived runtimes. omymongo doesn't.

- Safe connection reuse across invocations — no duplicate connection storms
- No background processes or event emitters that block function shutdown
- Predictable transaction lifecycle that works cleanly inside a single invocation

If you're running MongoDB on AWS Lambda, Vercel, or Cloudflare Workers, this is worth your attention.

### When NOT to use omymongo

Honesty builds trust.

- You need a battle-tested, large-ecosystem ODM today → use Mongoose
- You rely heavily on existing Mongoose plugins or community middleware → stay on Mongoose
- You want a fully managed ORM with migrations and a studio UI → use Prisma
- You're building a large team project and need years of Stack Overflow coverage → native driver + Zod manually

omymongo is the right call when you want control, type safety, and clean ergonomics — not when you need the widest ecosystem safety net.

## omymongo vs Mongoose vs Native Driver

| Feature             | omymongo                  | Mongoose                       | Native driver            |
| ------------------- | ------------------------- | ------------------------------ | ------------------------ |
| TypeScript-first    | ✅ Full inference         | ⚠️ Partial (requires generics) | ⚠️ Manual generics       |
| Runtime validation  | ✅ Zod on every write     | ⚠️ Optional, schema-based      | ❌ None                  |
| Silent type casting | ❌ Never                  | ✅ Yes (e.g. string → number)  | ❌ None                  |
| Middleware hooks    | ✅ Deterministic pre/post | ⚠️ Async, can be non-obvious   | ❌ None                  |
| Fluent query API    | ✅ Chainable, type-safe   | ⚠️ Chainable, loosely typed    | ❌ Manual filter objects |
| Soft deletes        | ✅ Built-in plugin        | ❌ Manual                      | ❌ Manual                |
| Pagination          | ✅ Built-in plugin        | ❌ Manual                      | ❌ Manual                |
| Bundle size         | ✅ Lightweight            | ❌ Heavy                       | ✅ Lightweight           |

## Installation

### npm

```bash
npm install omymongo zod
```

### pnpm

```bash
pnpm add omymongo zod
```

### yarn

```bash
yarn add omymongo zod
```

## Quick Start

```ts
import z from "zod";
import { connect, model, defineSchema } from "omymongo";

await connect({
  uri: "mongodb://localhost:27017/testdb",
  appName: "MyApp",
  maxPoolSize: 10,
  minPoolSize: 0,
});

const UserSchema = defineSchema(
  z.object({
    name: z.string(),
    email: z.string().email(),
    tags: z.array(z.string()).default([]),
  }),
  { strict: "strip" },
);

const Users = model({
  name: "users",
  schema: UserSchema,
  options: {
    indexes: {
      email: 1,
    },
  },
});

const created = await Users.create({
  name: "Ernest",
  email: "ernest@example.com",
  tags: ["admin"],
});

const found = await Users.findById(created._id);
console.log(found);
```

## v2 Highlights

- Schema modes: strict, strip, passthrough
- Fluent model APIs: findFluent, findOneFluent, findByIdFluent, where
- Middleware hooks: pre and post
- Plugin system with built-in softDeletePlugin and paginationPlugin
- Soft-delete lifecycle with restore and hard-delete APIs
- Populate via refs mapping
- Pagination helper with metadata

## Core Concepts

Each saved document includes base fields managed by omymongo:

- \_id
- createdAt
- updatedAt

Documents are validated against your Zod schema on writes and full-document reads.

## API Overview

### Done

- [x] Core CRUD: create, insertOne, insertMany, findOne, find, findById
- [x] Updates: updateOne, updateMany, findByIdAndUpdate, replaceOne
- [x] Deletes: deleteOne, deleteMany, findByIdAndDelete
- [x] Aggregation helpers: countDocuments, exists, distinct, aggregate
- [x] Fluent API: findFluent, findOneFluent, findByIdFluent, where, exec, execOne, execMany, first
- [x] Plugin hooks: use
- [x] Middleware hooks: pre, post
- [x] Soft-delete lifecycle: enableSoftDelete, restoreOne, hardDeleteOne, hardDeleteMany
- [x] Pagination helper: paginate
- [x] Populate support via refs mapping
- [x] Rich index definitions: compound, unique, sparse, TTL, partial
- [x] More fluent operators (regex, exists, size, text)
- [x] Transactions and sessions helpers

### Todo

- [ ] Better projection output typing for fluent select

## Usage Examples

### Fluent Queries

```ts
const topUsers = await Users.findFluent()
  .where("tags")
  .in(["admin", "pro"])
  .sort({ createdAt: -1 })
  .limit(10)
  .execMany();

const oneUser = await Users.where("email").equals("ernest@example.com").execOne();
```

### Querying

```ts
const users = await Users.find(
  { tags: { $in: ["admin"] } },
  {
    sort: { createdAt: -1 },
    limit: 10,
    skip: 0,
  },
);

const oneUser = await Users.findOne(
  { email: "ernest@example.com" },
  { projection: { name: 1, email: 1 }, populate: "teamId" },
);
```

### Indexes

Simple single-field indexes still work:

```ts
const Users = model({
  name: "users",
  schema: UserSchema,
  options: {
    indexes: {
      email: 1,
    },
  },
});
```

For compound or option-rich indexes, pass an array of definitions:

```ts
const Sessions = model({
  name: "sessions",
  schema: defineSchema(
    z.object({
      userId: z.string(),
      email: z.string().optional(),
      status: z.enum(["active", "archived"]).optional(),
      nickname: z.string().optional(),
      expiresAt: z.date().optional(),
    }),
  ),
  options: {
    indexes: [
      {
        keys: { userId: 1, createdAt: -1 },
        name: "sessions_user_createdAt",
      },
      {
        keys: { nickname: 1 },
        sparse: true,
      },
      {
        keys: { expiresAt: 1 },
        expireAfterSeconds: 0,
      },
      {
        keys: { email: 1 },
        unique: true,
        partialFilterExpression: { status: "active" },
      },
    ],
  },
});
```

### Updates

```ts
const updated = await Users.findByIdAndUpdate(created._id, { $set: { name: "Ernest H." } });

const modifiedCount = await Users.updateMany(
  { tags: { $in: ["admin"] } },
  { $set: { tags: ["admin", "active"] } },
);

console.log(updated, modifiedCount);
```

### Replacing and Deleting

```ts
await Users.replaceOne(
  { email: "ernest@example.com" },
  {
    name: "Ernest Hayford",
    email: "ernest@example.com",
    tags: ["maintainer"],
  },
);

await Users.findByIdAndDelete(created._id);
await Users.deleteMany({ tags: { $in: ["inactive"] } });
```

### Hooks

```ts
Users.pre("insertOne", ({ payload }) => {
  console.log("About to insert", payload);
});

Users.post("insertOne", ({ result }) => {
  console.log("Inserted", result);
});
```

### Plugins, Soft Delete, Pagination

```ts
import { softDeletePlugin, paginationPlugin } from "omymongo";

Users.use(softDeletePlugin, { fieldName: "deletedAt" });
Users.use(paginationPlugin);

await Users.deleteOne({ email: "a@example.com" });

const active = await Users.countDocuments();
const all = await Users.countDocuments({}, { withDeleted: true });

await Users.restoreOne({ email: "a@example.com" });

const page = await Users.paginate(
  { tags: { $in: ["admin"] } },
  { page: 1, pageSize: 20, sort: { createdAt: -1 } },
);

console.log(active, all, page.meta);
```

### Transactions and Sessions

```ts
import { withSession, withTransaction } from "omymongo";

await withTransaction(async ({ session }) => {
  await Users.insertOne({ name: "Nana", email: "nana@example.com", tags: ["trial"] }, { session });

  await Users.updateOne(
    { email: "nana@example.com" },
    { $set: { tags: ["trial", "active"] } },
    { session },
  );
});

await withSession(async ({ session }) => {
  const user = await Users.findFluent({ email: "nana@example.com" }).session(session).execOne();

  console.log(user);
});
```

### Populate with refs

```ts
const Books = model({
  name: "books",
  schema: z.object({
    title: z.string(),
    authorId: z.instanceof(ObjectID),
  }),
  options: {
    refs: {
      authorId: {
        field: "author",
        collection: "authors",
      },
    },
  },
});

// `author` field on the result holds the populated author document; `authorId` retains the original id value
const book = await Books.findOne({ title: "DX Patterns" }, { populate: "authorId" });
```

### Counts, Existence, Distinct

```ts
const total = await Users.countDocuments();
const hasAdmins = await Users.exists({ tags: { $in: ["admin"] } });
const uniqueTags = await Users.distinct("tags");

console.log(total, hasAdmins, uniqueTags);
```

### Aggregation

```ts
const tagStats = await Users.aggregate<{ _id: string; count: number }>([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]);

console.log(tagStats);
```

## Error Handling

omymongo throws focused errors with codes for safer handling.

```ts
import { CollectionError, ConnectionError, ValidationError } from "omymongo";

try {
  await Users.insertOne({ name: "A", email: "a@example.com", tags: [] });
} catch (error) {
  if (error instanceof CollectionError) {
    console.error("Collection operation failed", error.message);
  } else if (error instanceof ConnectionError) {
    console.error("Connection failed", error.message);
  } else if (error instanceof ValidationError) {
    console.error("Validation failed", error.message);
  } else {
    console.error("Unexpected error", error);
  }
}
```

## Local Development

Install dependencies:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
```

Build package:

```bash
pnpm build
```

## Project Direction

Detailed milestone board: see [ROADMAP.md](./ROADMAP.md).

Planned improvements include:

- Better projection output typing for fluent selects
- Realtime pub/sub to stream document changes over WebSocket or third-party brokers
- Automatic document migration for drifted records when schema evolves

Contributions and feedback are welcome.
