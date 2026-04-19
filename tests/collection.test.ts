import { describe, expect, test } from "vite-plus/test";

import { createCollection, createConnection } from "../src/index";
import z from "zod";
import { Logger } from "../src/logger";

const connection = createConnection({
  uri: "mongodb://localhost:27017/testdb",
  appName: "TestApp",
  maxPoolSize: 10,
  minPoolSize: 0,
});

const TestSchema = z.object({
  questions: z.array(z.string()),
});

const TestCollection = createCollection({
  name: "test_collection",
  schema: TestSchema,
});

const IndexedSchema = z.object({
  email: z.string().optional(),
  orgId: z.string(),
  status: z.enum(["active", "archived"]).optional(),
  nickname: z.string().optional(),
  expiresAt: z.date().optional(),
});

const IndexedCollection = createCollection({
  name: "indexed_test_collection",
  schema: IndexedSchema,
  options: {
    indexes: [
      {
        keys: { orgId: 1, createdAt: -1 },
        name: "org_createdAt_compound",
      },
      {
        keys: { nickname: 1 },
        name: "nickname_sparse",
        sparse: true,
      },
      {
        keys: { expiresAt: 1 },
        name: "expires_at_ttl",
        expireAfterSeconds: 0,
      },
      {
        keys: { email: 1 },
        name: "active_email_unique",
        unique: true,
        partialFilterExpression: {
          status: "active",
        },
      },
    ],
  },
});

const listIndexes = async (name: string) =>
  connection.withLifetime(async (client) => client.db().collection(name).listIndexes().toArray());

describe("should test collection functionality", () => {
  test.sequential("should support create, findById and find options", async () => {
    await TestCollection.deleteMany({});

    const first = await TestCollection.create({
      questions: ["q1", "q2"],
    });
    await TestCollection.create({
      questions: ["q1", "q3", "q4"],
    });

    const byId = await TestCollection.findById(first._id);
    expect(byId).not.toBeNull();
    expect(byId?._id).toEqual(first._id);

    const sorted = await TestCollection.find(
      { questions: { $exists: true } },
      {
        sort: { createdAt: -1 },
        limit: 1,
      },
    );
    expect(sorted.length).toBe(1);

    const projected = await TestCollection.findOne(
      { _id: first._id },
      {
        projection: { questions: 1 },
      },
    );
    expect(projected).not.toBeNull();
    expect(projected?.questions.length).toBe(2);
  });

  test.sequential("should support countDocuments, exists and distinct", async () => {
    await TestCollection.deleteMany({});

    await TestCollection.insertMany([
      { questions: ["mongodb", "typescript"] },
      { questions: ["mongodb", "zod"] },
      { questions: ["node", "zod"] },
    ]);

    const count = await TestCollection.countDocuments({
      questions: { $exists: true },
    });
    expect(count).toBe(3);

    const exists = await TestCollection.exists({
      questions: { $in: ["node"] },
    });
    expect(exists).toBe(true);

    const missing = await TestCollection.exists({
      questions: { $in: ["not-found"] },
    });
    expect(missing).toBe(false);

    const distinct = await TestCollection.distinct("questions");
    expect(distinct.includes("mongodb")).toBe(true);
    expect(distinct.includes("zod")).toBe(true);
  });

  test.sequential("should support updateMany and findByIdAndUpdate", async () => {
    await TestCollection.deleteMany({});

    const docs = await TestCollection.insertMany([
      { questions: ["a"] },
      { questions: ["a", "b"] },
      { questions: ["b", "c"] },
    ]);

    const updatedCount = await TestCollection.updateMany(
      { questions: { $in: ["a"] } },
      { $set: { questions: ["updated"] } },
    );
    expect(updatedCount).toBe(2);

    const updated = await TestCollection.findByIdAndUpdate(docs[2]._id, {
      $set: { questions: ["single-update"] },
    });
    expect(updated).not.toBeNull();
    expect(updated?.questions).toEqual(["single-update"]);
  });

  test.sequential("should support replaceOne and aggregate", async () => {
    await TestCollection.deleteMany({});

    await TestCollection.insertMany([
      { questions: ["x", "y"] },
      { questions: ["x", "z"] },
      { questions: ["z"] },
    ]);

    const replaced = await TestCollection.replaceOne(
      { questions: { $in: ["x"] } },
      { questions: ["replacement"] },
    );
    expect(replaced).not.toBeNull();
    expect(replaced?.questions).toEqual(["replacement"]);

    const aggregation = await TestCollection.aggregate<{
      _id: string;
      count: number;
    }>([
      { $unwind: "$questions" },
      { $group: { _id: "$questions", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    expect(aggregation.length).toBeGreaterThan(0);
    expect(typeof aggregation[0].count).toBe("number");
  });

  test.sequential("should support deleteMany and findByIdAndDelete", async () => {
    await TestCollection.deleteMany({});

    const docs = await TestCollection.insertMany([
      { questions: ["remove", "a"] },
      { questions: ["remove", "b"] },
      { questions: ["keep"] },
    ]);

    const deletedOne = await TestCollection.findByIdAndDelete(docs[2]._id);
    expect(deletedOne).not.toBeNull();
    expect(deletedOne?._id).toEqual(docs[2]._id);

    const deletedManyCount = await TestCollection.deleteMany({
      questions: { $in: ["remove"] },
    });
    expect(deletedManyCount).toBe(2);

    const left = await TestCollection.countDocuments({
      questions: { $exists: true },
    });
    expect(left).toBe(0);
  });

  test.sequential("should insert and find documents", async () => {
    await TestCollection.deleteMany({});

    const doc = await TestCollection.insertOne({
      questions: ["What is MongoDB?", "What is TypeScript?"],
    });
    expect(doc).toHaveProperty("_id");
    expect(doc.questions).toEqual(["What is MongoDB?", "What is TypeScript?"]);

    const foundDoc = await TestCollection.findOne({ _id: doc._id });
    expect(foundDoc).not.toBeNull();
    Logger.log("Found document:", foundDoc, doc._id);
    expect(foundDoc?._id).toEqual(doc._id);
    expect(foundDoc?.questions).toEqual(["What is MongoDB?", "What is TypeScript?"]);

    const updatedDoc = await TestCollection.updateOne(
      { _id: doc._id },
      {
        $set: {
          questions: ["What is MongoDB?", "What is TypeScript?", "What is Vite?"],
        },
      },
    );
    expect(updatedDoc).not.toBeNull();
    expect(updatedDoc?._id).toEqual(doc._id);
    expect(updatedDoc?.questions).toEqual([
      "What is MongoDB?",
      "What is TypeScript?",
      "What is Vite?",
    ]);

    const deletedDoc = await TestCollection.deleteOne({ _id: doc._id });
    expect(deletedDoc).not.toBeNull();
    expect(deletedDoc?._id).toEqual(doc._id);

    const shouldBeNull = await TestCollection.findOne({ _id: doc._id });
    expect(shouldBeNull).toBeNull();
  });

  test.sequential("should create compound, sparse, ttl and partial indexes", async () => {
    await IndexedCollection.deleteMany({});
    await IndexedCollection.insertOne({
      orgId: "org-1",
      status: "active",
      email: "indexed@example.com",
      nickname: "nick",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const indexes = await listIndexes("indexed_test_collection");

    expect(indexes.some((index) => index.name === "org_createdAt_compound")).toBe(true);
    expect(indexes.some((index) => index.name === "nickname_sparse" && index.sparse === true)).toBe(
      true,
    );
    expect(
      indexes.some((index) => index.name === "expires_at_ttl" && index.expireAfterSeconds === 0),
    ).toBe(true);

    const compoundIndex = indexes.find((index) => index.name === "org_createdAt_compound");
    expect(compoundIndex?.key).toEqual({ orgId: 1, createdAt: -1 });

    const partialIndex = indexes.find((index) => index.name === "active_email_unique");
    expect(partialIndex?.unique).toBe(true);
    expect(partialIndex?.partialFilterExpression).toEqual({ status: "active" });
  });

  test.sequential("should enforce partial unique indexes only for matching documents", async () => {
    await IndexedCollection.deleteMany({});

    await IndexedCollection.insertOne({
      orgId: "org-1",
      status: "active",
      email: "same@example.com",
    });

    await IndexedCollection.insertOne({
      orgId: "org-2",
      status: "archived",
      email: "same@example.com",
    });

    await expect(
      IndexedCollection.insertOne({
        orgId: "org-3",
        status: "active",
        email: "same@example.com",
      }),
    ).rejects.toThrow();
  });
});
