import { describe, expect, test } from "vite-plus/test";
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
} from "../src/index";

await connect({
  uri: "mongodb://localhost:27017/testdb",
  appName: "TestAppV2",
  maxPoolSize: 10,
  minPoolSize: 0,
});

const connection = createConnection({
  uri: "mongodb://localhost:27017/testdb",
  appName: "TestAppV2",
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
  schema: defineSchema(z.object({
    title: z.string(),
  })),
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

describe("v2 APIs", () => {
  test.sequential("should strip unknown keys when strict mode is strip", async () => {
    await StripCollection.deleteMany({});

    const created = await StripCollection.create({
      name: "Ernest",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extra: "value",
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((created as any).extra).toBeUndefined();
  });

  test.sequential("should reject unknown keys when strict mode is strict", async () => {
    await StrictCollection.deleteMany({});

    await expect(
      StrictCollection.create({
        title: "Hello",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        extra: "value",
      } as any),
    ).rejects.toThrow();
  });

  test.sequential("should run pre and post hooks", async () => {
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

  test.sequential("should expose connect and disconnect helpers", async () => {
    await disconnect();

    const connection = await connect({
      uri: "mongodb://localhost:27017/testdb",
      appName: "TestAppV2-Reconnect",
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    expect(connection.connection_counter).toBeGreaterThan(0);
  });

  test.sequential("should support chainable query builder", async () => {
    await SoftDeleteCollection.hardDeleteMany({});
    await SoftDeleteCollection.insertMany([
      { title: "B" },
      { title: "A" },
      { title: "C" },
    ]);

    const docs = await SoftDeleteCollection
      .query({ title: { $in: ["A", "B", "C"] } })
      .sort({ title: 1 })
      .limit(2)
      .exec();

    expect(docs.length).toBe(2);
    expect(docs[0].title).toBe("A");
    expect(docs[1].title).toBe("B");
  });

  test.sequential("should support soft delete and restore workflow", async () => {
    await SoftDeleteCollection.hardDeleteMany({});

    const first = await SoftDeleteCollection.create({ title: "keep" });
    await SoftDeleteCollection.create({ title: "remove" });

    const deleted = await SoftDeleteCollection.deleteOne({ title: "remove" });
    expect(deleted).not.toBeNull();

    const activeCount = await SoftDeleteCollection.countDocuments();
    const allCount = await SoftDeleteCollection.countDocuments({}, {
      withDeleted: true,
    });
    expect(activeCount).toBe(1);
    expect(allCount).toBe(2);

    const restored = await SoftDeleteCollection.restoreOne({ title: "remove" });
    expect(restored).not.toBeNull();

    const afterRestore = await SoftDeleteCollection.countDocuments();
    expect(afterRestore).toBe(2);

    await SoftDeleteCollection.findByIdAndDelete(first._id);
    const withDeleted = await SoftDeleteCollection.exists(
      { title: "keep" },
      { withDeleted: true },
    );
    expect(withDeleted).toBe(true);
  });

  test.sequential("should support pagination helper", async () => {
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

  test.sequential("should populate referenced documents", async () => {
    await BookCollection.hardDeleteMany({});
    await AuthorCollection.hardDeleteMany({});

    const author = await AuthorCollection.create({ name: "John" });
    await BookCollection.create({
      title: "DX Patterns",
      authorId: author._id,
    });

    const found = await BookCollection.findOne(
      { title: "DX Patterns" },
      { populate: "authorId" },
    );

    expect(found).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((found as any)?.authorId?.name).toBe("John");
  });

  test.sequential("should support fluent where/equality and execMany", async () => {
    await FluentCollection.hardDeleteMany({});

    await FluentCollection.insertMany([
      { name: "Ada", score: 91, tags: ["core"] },
      { name: "Ben", score: 72, tags: ["core", "edge"] },
      { name: "Cara", score: 88, tags: ["edge"] },
    ]);

    const docs = await FluentCollection
      .findFluent()
      .where("name")
      .in(["Ada", "Cara"])
      .sort({ score: -1 })
      .execMany();

    expect(docs.length).toBe(2);
    expect(docs[0].name).toBe("Ada");
    expect(docs[1].name).toBe("Cara");
  });

  test.sequential("should support fluent range operators and first/execOne", async () => {
    await FluentCollection.hardDeleteMany({});

    await FluentCollection.insertMany([
      { name: "Mia", score: 64, tags: ["alpha"] },
      { name: "Noah", score: 84, tags: ["alpha"] },
      { name: "Ola", score: 96, tags: ["beta"] },
    ]);

    const topMid = await FluentCollection
      .where("score")
      .gte(80)
      .lt(95)
      .sort({ score: -1 })
      .first();

    expect(topMid).not.toBeNull();
    expect(topMid?.name).toBe("Noah");

    const single = await FluentCollection
      .findOneFluent({ tags: { $in: ["beta"] } })
      .execOne();

    expect(single).not.toBeNull();
    expect(single?.name).toBe("Ola");
  });

  test.sequential("should support findByIdFluent with exec", async () => {
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

  test.sequential("should support fluent regex, exists, size and text operators", async () => {
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

    const regexMatch = await FluentCollection
      .findFluent()
      .where("name")
      .regex(/^a/i)
      .execMany();
    expect(regexMatch.length).toBe(1);
    expect(regexMatch[0].name).toBe("Ada");

    const hasNoBio = await FluentCollection
      .findFluent()
      .where("bio")
      .exists(false)
      .execMany();
    expect(hasNoBio.length).toBe(1);
    expect(hasNoBio[0].name).toBe("Cara");

    const twoTags = await FluentCollection
      .findFluent()
      .where("tags")
      .size(2)
      .sort({ score: -1 })
      .execMany();
    expect(twoTags.length).toBe(2);
    expect(twoTags[0].name).toBe("Ada");
    expect(twoTags[1].name).toBe("Cara");

    const textMatch = await FluentCollection
      .findFluent()
      .text("platform")
      .execMany();
    expect(textMatch.length).toBe(1);
    expect(textMatch[0].name).toBe("Ada");
  });
});
