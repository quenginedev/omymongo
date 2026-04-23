/**
 * Indexes Example
 * Demonstrates: simple index map, rich index definitions (unique, sparse, TTL,
 *               compound, partial filter), and index enforcement on insert
 *
 * Run: npx tsx playground/examples/indexes.ts
 */
import z from "zod";
import { Collection, SchemaDefinition, connect, disconnect } from "../../src/index.ts";
import { connection } from "../shared.ts";

// ── schema: Article ───────────────────────────────────────────────────────────

const ArticleZodSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  author: z.string(),
  publishedAt: z.date().optional(),
  viewCount: z.number().default(0),
});

type ArticleType = z.infer<typeof ArticleZodSchema>;
const ArticleSchema = new SchemaDefinition(ArticleZodSchema, { timestamps: true });

const Articles = new Collection<ArticleType>("articles", ArticleSchema, {
  connection,
  indexes: [
    // Unique — no duplicate slugs
    { keys: { slug: 1 }, unique: true, name: "slug_unique" },
    // Compound
    { keys: { author: 1, publishedAt: -1 }, name: "author_publishedAt" },
    // Sparse — only indexes docs that have publishedAt set
    { keys: { publishedAt: -1 }, sparse: true, name: "publishedAt_sparse" },
    // Partial filter — only index high-traffic articles
    {
      keys: { viewCount: -1 },
      name: "high_traffic",
      partialFilterExpression: { viewCount: { $gt: 1000 } },
    },
  ],
});

// ── schema: Session (TTL index) ───────────────────────────────────────────────

const SessionZodSchema = z.object({
  userId: z.string(),
  token: z.string(),
  expiresAt: z.date(),
});

type SessionType = z.infer<typeof SessionZodSchema>;
const SessionSchema = new SchemaDefinition(SessionZodSchema, { timestamps: true });

// TTL: MongoDB will auto-delete documents 0 seconds after expiresAt
const Sessions = new Collection<SessionType>("sessions", SessionSchema, {
  connection,
  indexes: [
    { keys: { expiresAt: 1 }, expireAfterSeconds: 0, name: "session_ttl" },
    { keys: { token: 1 }, unique: true, name: "token_unique" },
  ],
});

// ── simple map-style indexes ──────────────────────────────────────────────────

const TagZodSchema = z.object({ name: z.string(), count: z.number().default(0) });
type TagType = z.infer<typeof TagZodSchema>;
const TagSchema = new SchemaDefinition(TagZodSchema, { timestamps: true });

// Indexes are declared as a field → direction map (shorthand)
const Tags = new Collection<TagType>("tags", TagSchema, {
  connection,
  indexes: { name: 1, count: -1 },
});

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  console.log("\n── insert articles (triggers ensureIndexes) ────────────");
  const a1 = await Articles.insertOne({
    slug: "hello-world",
    title: "Hello World",
    author: "Alice",
    viewCount: 0,
  });
  const a2 = await Articles.insertOne({
    slug: "second-post",
    title: "Second Post",
    author: "Alice",
    publishedAt: new Date(),
    viewCount: 5000,
  });
  console.log("Inserted:", [a1.slug, a2.slug]);

  console.log("\n── unique index violation ──────────────────────────────");
  try {
    await Articles.insertOne({
      slug: "hello-world",
      title: "Duplicate",
      author: "Bob",
      viewCount: 0,
    });
  } catch (err) {
    console.log("Expected duplicate key error:", (err as Error).message.slice(0, 80));
  }

  console.log("\n── insert session with TTL ─────────────────────────────");
  const session = await Sessions.insertOne({
    userId: "user_123",
    token: "tok_abc123",
    expiresAt: new Date(Date.now() + 60_000), // expires in 1 minute
  });
  console.log("Session expires at:", session.expiresAt);

  console.log("\n── tags (map-style indexes) ────────────────────────────");
  await Tags.insertMany([
    { name: "mongodb", count: 42 },
    { name: "typescript", count: 17 },
  ]);
  const sortedTags = await Tags.find({}, { sort: { count: -1 } });
  console.log(
    "Tags by count desc:",
    sortedTags.map((t) => `${t.name}(${t.count})`),
  );

  // cleanup
  await Articles.deleteMany({});
  await Sessions.deleteMany({});
  await Tags.deleteMany({});

  await disconnect();
}

main().catch(console.error);
