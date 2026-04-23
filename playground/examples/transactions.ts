/**
 * Transactions Example
 * Demonstrates: withTransaction (commit), withTransaction (rollback on error),
 *               withSession for multi-op read consistency
 *
 * Run: npx tsx playground/examples/transactions.ts
 * Note: Transactions require a replica set or Atlas cluster.
 *       For local testing start MongoDB with: mongod --replSet rs0
 *       Then run once: mongosh --eval "rs.initiate()"
 */
import { Connection, connect, disconnect } from "../../src/index.ts";
import { Users, Posts } from "../shared.ts";

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  const conn = Connection.getInstance();

  // ── successful transaction ─────────────────────────────────────────────────
  console.log("\n── successful transaction (user + post) ────────────────");
  try {
    const { author, post } = await conn.withTransaction(async ({ session }) => {
      const author = await Users.insertOne(
        { name: "Transactional User", email: "tx@example.com", age: 40, role: "admin" },
        { session },
      );
      const post = await Posts.insertOne(
        {
          title: "Transactional Post",
          body: "Created in a transaction",
          authorId: String(author._id),
          tags: [],
        },
        { session },
      );
      return { author, post };
    });
    console.log("Committed — author:", author.name, "| post:", post.title);
  } catch (err) {
    console.error("Transaction failed:", err);
  }

  // ── rolled-back transaction ────────────────────────────────────────────────
  console.log("\n── rolled-back transaction (error mid-way) ─────────────");
  try {
    await conn.withTransaction(async ({ session }) => {
      await Users.insertOne(
        { name: "Ghost User", email: "ghost@example.com", age: 99, role: "member" },
        { session },
      );
      // Simulate a failure after the first insert
      throw new Error("Something went wrong — rolling back");
    });
  } catch (err) {
    console.log("Caught expected error:", (err as Error).message);
  }

  const ghostExists = await Users.exists({ email: "ghost@example.com" });
  console.log("Ghost user in DB after rollback:", ghostExists); // should be false

  // ── withSession (no transaction, just session scope) ───────────────────────
  console.log("\n── withSession (shared session, no transaction) ────────");
  await conn.withSession(async ({ session }) => {
    const count = await Users.countDocuments({}, { session });
    console.log("Users visible in session:", count);
  });

  // cleanup
  await Users.deleteMany({});
  await Posts.hardDeleteMany({});

  await Connection.getInstance().disconnect({ all: true });
}

main().catch(console.error);
