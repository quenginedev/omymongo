/**
 * Pre / Post Hooks Example
 * Demonstrates: .pre() and .post() hooks on insertOne, find, updateOne, deleteOne
 *
 * Run: npx tsx playground/examples/hooks.ts
 */
import { Collection, connect, disconnect } from "../../src/index.ts";
import { UserSchema, UserType, connection } from "../shared.ts";

// Build a dedicated collection instance so hooks don't pollute shared.ts
const Users = new Collection<UserType>("users", UserSchema, { connection });

Users
  // ── insert hooks ────────────────────────────────────────────────────────────
  .pre("insertOne", ({ payload }) => {
    console.log("[pre:insertOne]  payload:", (payload as UserType).name);
  })
  .post("insertOne", ({ result }) => {
    const user = result as { name: string; _id: unknown };
    console.log("[post:insertOne] saved: ", user.name, "| id:", user._id);
  })

  // ── find hooks ──────────────────────────────────────────────────────────────
  .pre("find", ({ filter }) => {
    console.log("[pre:find]  filter:", JSON.stringify(filter));
  })
  .post("find", ({ result }) => {
    const docs = result as { name: string }[];
    console.log("[post:find] returned", docs.length, "document(s)");
  })

  // ── update hooks ────────────────────────────────────────────────────────────
  .pre("updateOne", ({ filter, payload }) => {
    console.log(
      "[pre:updateOne]  filter:",
      JSON.stringify(filter),
      "| update:",
      JSON.stringify(payload),
    );
  })
  .post("updateOne", ({ result }) => {
    const doc = result as { name: string; age: number } | null;
    console.log("[post:updateOne] new state:", doc?.name, "age:", doc?.age);
  })

  // ── delete hooks ────────────────────────────────────────────────────────────
  .pre("deleteOne", ({ filter }) => {
    console.log("[pre:deleteOne]  filter:", JSON.stringify(filter));
  })
  .post("deleteOne", ({ result }) => {
    const doc = result as { name: string } | null;
    console.log("[post:deleteOne] removed:", doc?.name);
  });

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  console.log("\n── trigger insertOne hooks ─────────────────────────────");
  const user = await Users.insertOne({
    name: "Hook User",
    email: "hook@example.com",
    age: 30,
    role: "member",
  });

  console.log("\n── trigger find hooks ──────────────────────────────────");
  await Users.find({ role: "member" });

  console.log("\n── trigger updateOne hooks ─────────────────────────────");
  await Users.updateOne({ email: "hook@example.com" }, { $set: { age: 31 } });

  console.log("\n── trigger deleteOne hooks ─────────────────────────────");
  await Users.deleteOne({ _id: user._id });

  await disconnect();
}

main().catch(console.error);
