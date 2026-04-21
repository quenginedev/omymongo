/**
 * Soft Delete Example
 * Demonstrates: deleteOne (soft), deleteMany (soft), find excluding deleted,
 *               find with withDeleted, restoreOne, hardDeleteOne
 *
 * Run: npx tsx playground/examples/soft-delete.ts
 */
import { connect, disconnect } from "../../src/index.ts";
import { Posts, Users } from "../shared.ts";

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  // seed an author
  const author = await Users.insertOne({
    name: "Writer",
    email: "writer@example.com",
    age: 35,
    role: "member",
  });

  console.log("\n── insert two posts ────────────────────────────────────");
  const postA = await Posts.insertOne({
    title: "Post A",
    body: "Hello world",
    authorId: String(author._id),
    tags: ["news"],
  });
  const postB = await Posts.insertOne({
    title: "Post B",
    body: "Second post",
    authorId: String(author._id),
    tags: ["tech"],
  });
  console.log("Created:", [postA.title, postB.title]);

  console.log("\n── soft-delete Post A ──────────────────────────────────");
  await Posts.deleteOne({ _id: postA._id });

  console.log("\n── find (excludes soft-deleted) ────────────────────────");
  const visible = await Posts.find({});
  console.log(
    "Visible posts:",
    visible.map((p) => p.title),
  );

  console.log("\n── find with withDeleted: true ─────────────────────────");
  const all = await Posts.find({}, { withDeleted: true });
  console.log(
    "All posts (incl. deleted):",
    all.map((p) => p.title),
  );
  const deletedPost = all.find((p) => p.title === "Post A");
  console.log("Post A deletedAt:", (deletedPost as Record<string, unknown>)?.deletedAt);

  console.log("\n── restoreOne ──────────────────────────────────────────");
  const restored = await Posts.restoreOne({ _id: postA._id });
  console.log("Restored:", restored?.title);

  console.log("\n── soft-delete many ────────────────────────────────────");
  const softDeletedCount = await Posts.deleteMany({});
  console.log("Soft-deleted count:", softDeletedCount);

  console.log("\n── hardDeleteOne ───────────────────────────────────────");
  const hardDeleted = await Posts.hardDeleteOne({ _id: postB._id });
  console.log("Hard-deleted:", hardDeleted?.title);

  console.log("\n── cleanup ─────────────────────────────────────────────");
  await Posts.hardDeleteOne({ _id: postA._id });
  await Users.deleteOne({ _id: author._id });

  await disconnect();
}

main().catch(console.error);
