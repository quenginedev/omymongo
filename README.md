# omymongo

A TypeScript-first MongoDB toolkit inspired by Mongoose DX, powered by Zod validation and the official MongoDB driver.

## Inspiration

omymongo is inspired by tools that made database work feel productive and safe:

- Mongoose for clean model-like APIs
- Prisma for type safety and confidence while coding
- Zod for explicit runtime validation
- Native MongoDB driver for flexibility and performance

The goal: keep MongoDB close to native behavior while giving you safer defaults and fluent APIs.

## Why This Library

MongoDB projects often force a trade-off between convenience and control. omymongo aims to give you both.

- Type-safe filters and updates
- Runtime validation with Zod schemas
- Fluent query layer for expressive chaining
- Plugins, hooks, and soft-delete workflows
- Minimal abstraction over the official MongoDB driver

Use omymongo if you want Mongoose-like ergonomics without losing direct MongoDB behavior.

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
    email: z.email(),
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

### Todo

- [ ] Transactions and sessions helpers
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

- Richer index definitions (compound, unique, TTL, partial)
- Transactions and sessions helpers
- Better projection output typing for fluent selects
- Realtime pub/sub to stream document changes over WebSocket or third-party brokers
- Automatic document migration for drifted records when schema evolves

Contributions and feedback are welcome.
