/**
 * Refs / Populate Example
 * Demonstrates: refs configuration and populate option on findOne / find
 *
 * Run: npx tsx playground/examples/refs.ts
 */
import { connect, disconnect } from "../../src/index.ts";
import { Users, Posts, Comments } from "../shared.ts";

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  console.log("\n── seed data ───────────────────────────────────────────");
  const alice = await Users.insertOne({
    name: "Alice",
    email: "alice@example.com",
    age: 28,
    role: "admin",
  });
  const bob = await Users.insertOne({
    name: "Bob",
    email: "bob@example.com",
    age: 32,
    role: "member",
  });

  const post = await Posts.insertOne({
    title: "Understanding omymongo",
    body: "omymongo is a TypeScript-first MongoDB toolkit...",
    authorId: String(alice._id),
    tags: ["typescript", "mongodb"],
  });

  await Comments.insertMany([
    { postId: String(post._id), authorId: String(alice._id), text: "Great post!" },
    { postId: String(post._id), authorId: String(bob._id), text: "Very helpful, thanks." },
  ]);

  console.log("Seeded: 2 users, 1 post, 2 comments");

  // ── populate single ref ────────────────────────────────────────────────────
  console.log("\n── findOne post with author populated ──────────────────");
  const postWithAuthor = await Posts.findOne({ _id: post._id }, { populate: "authorId" });
  // authorId field is replaced with the full user document
  console.log("Post title:", postWithAuthor?.title);
  console.log(
    "Author (populated):",
    (postWithAuthor?.authorId as unknown as { name: string })?.name,
  );

  // ── populate on find ──────────────────────────────────────────────────────
  console.log("\n── find all posts with authors populated ───────────────");
  const posts = await Posts.find({}, { populate: ["authorId"] });
  posts.forEach((p) => {
    const author = p.authorId as unknown as { name: string };
    console.log(`  "${p.title}" by ${author?.name}`);
  });

  // ── without populate (raw ref value) ─────────────────────────────────────
  console.log("\n── findOne WITHOUT populate (raw authorId) ─────────────");
  const rawPost = await Posts.findOne({ _id: post._id });
  console.log("authorId (raw):", rawPost?.authorId);

  // cleanup
  await Comments.deleteMany({});
  await Posts.hardDeleteMany({});
  await Users.deleteMany({});

  await disconnect();
}

main().catch(console.error);
