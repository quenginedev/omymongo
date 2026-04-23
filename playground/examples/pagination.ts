/**
 * Pagination Example
 * Demonstrates: paginate() with page/pageSize, sort, and withDeleted
 *
 * Run: npx tsx playground/examples/pagination.ts
 */
import { connect, disconnect } from "../../src/index.ts";
import { Posts, Users } from "../shared.ts";

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  const author = await Users.insertOne({
    name: "Blogger",
    email: "blogger@example.com",
    age: 28,
    role: "member",
  });

  console.log("\n── seed 12 posts ───────────────────────────────────────");
  await Posts.insertMany(
    Array.from({ length: 12 }, (_, i) => ({
      title: `Post ${i + 1}`,
      body: `Body of post ${i + 1}`,
      authorId: String(author._id),
      tags: i % 2 === 0 ? ["even"] : ["odd"],
    })),
  );
  console.log("Seeded 12 posts");

  console.log("\n── page 1 (default pageSize = 5) ───────────────────────");
  const page1 = await Posts.paginate({}, { page: 1 });
  console.log(
    "Page 1:",
    page1.data.map((p) => p.title),
  );
  console.log("Meta:", page1.meta);

  console.log("\n── page 2 ──────────────────────────────────────────────");
  const page2 = await Posts.paginate({}, { page: 2 });
  console.log(
    "Page 2:",
    page2.data.map((p) => p.title),
  );

  console.log("\n── page 3 (last) ───────────────────────────────────────");
  const page3 = await Posts.paginate({}, { page: 3 });
  console.log(
    "Page 3:",
    page3.data.map((p) => p.title),
  );

  console.log("\n── paginate with filter + sort ─────────────────────────");
  const evenPosts = await Posts.paginate(
    { tags: "even" },
    { page: 1, pageSize: 3, sort: { title: -1 } },
  );
  console.log(
    "Even posts (sorted desc, 3 per page):",
    evenPosts.data.map((p) => p.title),
  );
  console.log("Meta:", evenPosts.meta);

  console.log("\n── soft-delete a post and re-paginate ──────────────────");
  await Posts.deleteOne({ title: "Post 1" });
  const afterDelete = await Posts.paginate({}, { page: 1 });
  console.log("After soft-delete total:", afterDelete.meta.total, "(Post 1 hidden)");

  const withDeleted = await Posts.paginate({}, { page: 1, withDeleted: true });
  console.log("With deleted total:", withDeleted.meta.total, "(Post 1 included)");

  console.log("\n── cleanup ─────────────────────────────────────────────");
  await Posts.hardDeleteMany({});
  await Users.deleteOne({ _id: author._id });

  await disconnect();
}

main().catch(console.error);
