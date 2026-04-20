import { afterAll, describe, expect, test } from "vite-plus/test";
import z from "zod";

import {
  connect,
  createCollection,
  createConnection,
  defineSchema,
  disconnect,
  ObjectID,
  paginationPlugin,
  softDeletePlugin,
  withSession,
  withTransaction,
} from "../src/index";

const connection = createConnection({
  uri: process.env.MONGO_URI!,
  appName: "TestApp",
  maxPoolSize: 10,
  minPoolSize: 0,
});

const StripSchema = defineSchema(
  z.object({
    name: z.string(),
  }),
  { strict: "strip" },
);

const StrictSchema = defineSchema(
  z.object({
    title: z.string(),
  }),
  { strict: "strict" },
);

const StripCollection = createCollection({
  name: "v2_strip_collection",
  schema: StripSchema,
});

const StrictCollection = createCollection({
  name: "v2_strict_collection",
  schema: StrictSchema,
});

const SoftDeleteCollection = createCollection({
  name: "v2_soft_delete_collection",
  schema: defineSchema(
    z.object({
      title: z.string(),
    }),
  ),
});

SoftDeleteCollection.use(softDeletePlugin, { fieldName: "deletedAt" });
SoftDeleteCollection.use(paginationPlugin);

const AuthorCollection = createCollection({
  name: "v2_author_collection",
  schema: z.object({
    name: z.string(),
  }),
});

const BookCollection = createCollection({
  name: "v2_book_collection",
  schema: z.object({
    title: z.string(),
    authorId: z.instanceof(ObjectID),
  }),
  options: {
    refs: {
      authorId: {
        field: "v2_author_collection",
        single: true,
      },
    },
  },
});

const FluentCollection = createCollection({
  name: "v2_fluent_collection",
  schema: z.object({
    name: z.string(),
    score: z.number(),
    tags: z.array(z.string()),
    bio: z.string().optional(),
  }),
});

const TransactionCollection = createCollection({
  name: "v2_transaction_collection",
  schema: z.object({
    key: z.string(),
    value: z.number(),
  }),
});

const supportsTransactions = async () => {
  const hello = await connection.withLifetime(async (client) => {
    return await client.db("admin").command({ hello: 1 });
  });

  return Boolean(hello.setName) || hello.msg === "isdbgrid";
};

describe("v2 APIs", () => {
  test("should strip unknown keys when strict mode is strip", async () => {
    await StripCollection.deleteMany({});

    const created = await StripCollection.create({
      name: "Ernest",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extra: "value",
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((created as any).extra).toBeUndefined();
  });

  test("should reject unknown keys when strict mode is strict", async () => {
    await StrictCollection.deleteMany({});

    await expect(
      StrictCollection.create({
        title: "Hello",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extra: "value",
      } as any),
    ).rejects.toThrow();
  });

  test("should run pre and post hooks", async () => {
    await StripCollection.deleteMany({});

    let preCalled = 0;
    let postCalled = 0;

    StripCollection.pre("insertOne", async () => {
      preCalled += 1;
    });

    StripCollection.post("insertOne", async () => {
      postCalled += 1;
    });

    await StripCollection.insertOne({ name: "Hook Test" });

    expect(preCalled).toBe(1);
    expect(postCalled).toBe(1);
  });

  test("should expose connect and disconnect helpers", async () => {
    await disconnect();

    const connection = await connect({
      uri: "mongodb://localhost:27017/testdb",
      appName: "TestAppV2-Reconnect",
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    expect(connection.connection_counter).toBeGreaterThan(0);
  });

  test("should support chainable query builder", async () => {
    await SoftDeleteCollection.hardDeleteMany({});
    await SoftDeleteCollection.insertMany([{ title: "B" }, { title: "A" }, { title: "C" }]);

    const docs = await SoftDeleteCollection.query({ title: { $in: ["A", "B", "C"] } })
      .sort({ title: 1 })
      .limit(2)
      .exec();

    expect(docs.length).toBe(2);
    expect(docs[0].title).toBe("A");
    expect(docs[1].title).toBe("B");
  });

  test("should support soft delete and restore workflow", async () => {
    await SoftDeleteCollection.hardDeleteMany({});

    const first = await SoftDeleteCollection.create({ title: "keep" });
    await SoftDeleteCollection.create({ title: "remove" });

    const deleted = await SoftDeleteCollection.deleteOne({ title: "remove" });
    expect(deleted).not.toBeNull();

    const activeCount = await SoftDeleteCollection.countDocuments();
    const allCount = await SoftDeleteCollection.countDocuments(
      {},
      {
        withDeleted: true,
      },
    );
    expect(activeCount).toBe(1);
    expect(allCount).toBe(2);

    const restored = await SoftDeleteCollection.restoreOne({ title: "remove" });
    expect(restored).not.toBeNull();

    const afterRestore = await SoftDeleteCollection.countDocuments();
    expect(afterRestore).toBe(2);

    await SoftDeleteCollection.findByIdAndDelete(first._id);
    const withDeleted = await SoftDeleteCollection.exists({ title: "keep" }, { withDeleted: true });
    expect(withDeleted).toBe(true);
  });

  test("should support pagination helper", async () => {
    await SoftDeleteCollection.hardDeleteMany({});

    await SoftDeleteCollection.insertMany([
      { title: "One" },
      { title: "Two" },
      { title: "Three" },
      { title: "Four" },
      { title: "Five" },
    ]);

    const page = await SoftDeleteCollection.paginate(
      { title: { $exists: true } },
      {
        page: 2,
        pageSize: 2,
        sort: { createdAt: 1 },
      },
    );

    expect(page.data.length).toBe(2);
    expect(page.meta.total).toBe(5);
    expect(page.meta.page).toBe(2);
    expect(page.meta.pageCount).toBe(3);
  });

  test("should populate referenced documents", async () => {
    await BookCollection.hardDeleteMany({});
    await AuthorCollection.hardDeleteMany({});

    const author = await AuthorCollection.create({ name: "John" });
    await BookCollection.create({
      title: "DX Patterns",
      authorId: author._id,
    });

    const found = await BookCollection.findOne({ title: "DX Patterns" }, { populate: "authorId" });

    expect(found).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((found as any)?.authorId?.name).toBe("John");
  });

  test("should support fluent where/equality and execMany", async () => {
    await FluentCollection.hardDeleteMany({});

    await FluentCollection.insertMany([
      { name: "Ada", score: 91, tags: ["core"] },
      { name: "Ben", score: 72, tags: ["core", "edge"] },
      { name: "Cara", score: 88, tags: ["edge"] },
    ]);

    const docs = await FluentCollection.findFluent()
      .where("name")
      .in(["Ada", "Cara"])
      .sort({ score: -1 })
      .execMany();

    expect(docs.length).toBe(2);
    expect(docs[0].name).toBe("Ada");
    expect(docs[1].name).toBe("Cara");
  });

  test("should support fluent range operators and first/execOne", async () => {
    await FluentCollection.hardDeleteMany({});

    await FluentCollection.insertMany([
      { name: "Mia", score: 64, tags: ["alpha"] },
      { name: "Noah", score: 84, tags: ["alpha"] },
      { name: "Ola", score: 96, tags: ["beta"] },
    ]);

    const topMid = await FluentCollection.where("score").gte(80).lt(95).sort({ score: -1 }).first();

    expect(topMid).not.toBeNull();
    expect(topMid?.name).toBe("Noah");

    const single = await FluentCollection.findOneFluent({ tags: { $in: ["beta"] } }).execOne();

    expect(single).not.toBeNull();
    expect(single?.name).toBe("Ola");
  });

  test("should support findByIdFluent with exec", async () => {
    await FluentCollection.hardDeleteMany({});

    const created = await FluentCollection.create({
      name: "Zed",
      score: 77,
      tags: ["id"],
    });

    const byId = await FluentCollection.findByIdFluent(created._id).execOne();

    expect(byId).not.toBeNull();
    expect((byId as { name: string }).name).toBe("Zed");
  });

  test("should support fluent regex, exists, size and text operators", async () => {
    await FluentCollection.hardDeleteMany({});

    await connection.withLifetime(async (client) => {
      await client.db().collection("v2_fluent_collection").createIndex({
        name: "text",
        bio: "text",
      });
    });

    await FluentCollection.insertMany([
      {
        name: "Ada",
        score: 91,
        tags: ["core", "platform"],
        bio: "Platform engineer",
      },
      {
        name: "Ben",
        score: 72,
        tags: ["edge"],
        bio: "Edge runtime specialist",
      },
      { name: "Cara", score: 88, tags: ["core", "edge"] },
    ]);

    const regexMatch = await FluentCollection.findFluent().where("name").regex(/^a/i).execMany();
    expect(regexMatch.length).toBe(1);
    expect(regexMatch[0].name).toBe("Ada");

    const hasNoBio = await FluentCollection.findFluent().where("bio").exists(false).execMany();
    expect(hasNoBio.length).toBe(1);
    expect(hasNoBio[0].name).toBe("Cara");

    const twoTags = await FluentCollection.findFluent()
      .where("tags")
      .size(2)
      .sort({ score: -1 })
      .execMany();
    expect(twoTags.length).toBe(2);
    expect(twoTags[0].name).toBe("Ada");
    expect(twoTags[1].name).toBe("Cara");

    const textMatch = await FluentCollection.findFluent().text("platform").execMany();
    expect(textMatch.length).toBe(1);
    expect(textMatch[0].name).toBe("Ada");
  });

  test("should support session-bound operations", async () => {
    await TransactionCollection.hardDeleteMany({});

    await withSession(async ({ session }) => {
      await TransactionCollection.insertOne({ key: "session", value: 1 }, { session });

      const found = await TransactionCollection.findOne({ key: "session" }, { session });

      expect(found).not.toBeNull();
      expect(found?.value).toBe(1);

      const page = await TransactionCollection.paginate(
        { key: "session" },
        { page: 1, pageSize: 1, session },
      );
      expect(page.meta.total).toBe(1);
      expect(page.data.length).toBe(1);
    });

    const persisted = await TransactionCollection.findOne({ key: "session" });
    expect(persisted).not.toBeNull();
  });

  test("should commit transaction when callback succeeds", async () => {
    if (!(await supportsTransactions())) return;

    await TransactionCollection.hardDeleteMany({});

    await withTransaction(async ({ session }) => {
      await TransactionCollection.insertOne({ key: "tx-commit", value: 10 }, { session });

      await TransactionCollection.updateOne(
        { key: "tx-commit" },
        { $set: { value: 20 } },
        { session },
      );
    });

    const found = await TransactionCollection.findOne({ key: "tx-commit" });
    expect(found).not.toBeNull();
    expect(found?.value).toBe(20);
  });

  test("should rollback transaction when callback throws", async () => {
    if (!(await supportsTransactions())) return;

    await TransactionCollection.hardDeleteMany({});

    await expect(
      withTransaction(async ({ session }) => {
        await TransactionCollection.insertOne({ key: "tx-rollback", value: 5 }, { session });

        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const found = await TransactionCollection.findOne({ key: "tx-rollback" });
    expect(found).toBeNull();
  });
});
