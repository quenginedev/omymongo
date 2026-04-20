import { describe, expect, test } from "vite-plus/test";
import z from "zod";
import { createCollection, createConnection } from "../src/index";

const TestSchema = z.object({
  questions: z.array(z.string()),
});

describe("index.ts", () => {
  test("should connect to MongoDB", async () => {
    const connection = createConnection({
      uri: process.env.MONGO_URI!,
      appName: "TestApp",
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    expect(connection.connection_counter).toBe(0);
    await connection.connect();
    expect(connection.connection_counter).toBe(1);
    await connection.disconnect();
    expect(connection.connection_counter).toBe(0);
  });

  test("should run lifecycle methods correctly", async () => {
    const connection = createConnection({
      uri: process.env.MONGO_URI!,
      appName: "TestApp",
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    const TestCollection = createCollection({
      name: "test_collection",
      schema: TestSchema,
    });

    expect(connection.connection_counter).toBe(0);
    const results = await TestCollection.find({ questions: { $exists: true } });
    expect(Array.isArray(results)).toBe(true);

    // Auto disconnected
    expect(connection.connection_counter).toBe(0);
  });
});
