import { expect, test, describe } from "vite-plus/test";
import { createConnection, createCollection } from '../src/index'
import z from "zod";


const TestSchema = z.object({
  questions: z.array(z.string()),
});

describe("index.ts", () => {
  test.sequential("should connect to MongoDB", async () => {
    const connection = createConnection({
      uri: "mongodb://localhost:27017/testdb",
      appName: "TestApp",
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    expect(connection.connection_counter).toBe(0);
    await connection.connect();
    expect(connection.connection_counter).toBe(1);
    await connection.disconnect();
    expect(connection.connection_counter).toBe(0);
  })

  test.sequential("should run lifecycle methods correctly", async () => {
    const connection = createConnection({
      uri: "mongodb://localhost:27017/testdb",
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
    expect(connection.connection_counter).toBe(0);
  })
});
