/**
 * CRUD Operations Example
 * Demonstrates: insertOne, insertMany, findOne, findById, find, updateOne,
 *               findByIdAndUpdate, updateMany, replaceOne, deleteOne,
 *               findByIdAndDelete, deleteMany, countDocuments, exists, distinct
 *
 * Run: npx tsx playground/examples/crud.ts
 */
import { connect, disconnect } from "../../src/index.ts";
import { Users } from "../shared.ts";

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  console.log("\n── insertOne ───────────────────────────────────────────");
  const alice = await Users.insertOne({
    name: "Alice",
    email: "alice@example.com",
    age: 28,
    role: "admin",
  });
  console.log("Inserted:", alice);

  console.log("\n── insertMany ──────────────────────────────────────────");
  const [bob, carol] = await Users.insertMany([
    { name: "Bob", email: "bob@example.com", age: 34, role: "member" },
    { name: "Carol", email: "carol@example.com", age: 22, role: "member" },
  ]);
  console.log(
    "Inserted:",
    [bob, carol].map((u) => u.name),
  );

  console.log("\n── findOne ─────────────────────────────────────────────");
  const found = await Users.findOne({ email: "alice@example.com" });
  console.log("Found:", found?.name);

  console.log("\n── findById ────────────────────────────────────────────");
  const byId = await Users.findById(alice._id);
  console.log("Found by id:", byId?.name);

  console.log("\n── find ────────────────────────────────────────────────");
  const allMembers = await Users.find({ role: "member" });
  console.log(
    "Members:",
    allMembers.map((u) => u.name),
  );

  console.log("\n── find with sort + limit ──────────────────────────────");
  const youngest = await Users.find({}, { sort: { age: 1 }, limit: 2 });
  console.log(
    "Two youngest:",
    youngest.map((u) => `${u.name} (${u.age})`),
  );

  console.log("\n── updateOne ───────────────────────────────────────────");
  const updatedAlice = await Users.updateOne({ email: "alice@example.com" }, { $set: { age: 29 } });
  console.log("Updated age:", updatedAlice?.age);

  console.log("\n── findByIdAndUpdate ───────────────────────────────────");
  const updatedBob = await Users.findByIdAndUpdate(bob._id, { $set: { role: "admin" } });
  console.log("Bob's new role:", updatedBob?.role);

  console.log("\n── updateMany ──────────────────────────────────────────");
  const modifiedCount = await Users.updateMany({ role: "member" }, { $set: { role: "admin" } });
  console.log("Updated count:", modifiedCount);

  console.log("\n── replaceOne ──────────────────────────────────────────");
  const replaced = await Users.replaceOne(
    { email: "carol@example.com" },
    { name: "Caroline", email: "carol@example.com", age: 23, role: "member" },
  );
  console.log("Replaced name:", replaced?.name);

  console.log("\n── countDocuments ──────────────────────────────────────");
  const total = await Users.countDocuments();
  console.log("Total users:", total);

  console.log("\n── exists ──────────────────────────────────────────────");
  const aliceExists = await Users.exists({ email: "alice@example.com" });
  const ghostExists = await Users.exists({ email: "ghost@nowhere.io" });
  console.log("Alice exists:", aliceExists, " | Ghost exists:", ghostExists);

  console.log("\n── distinct ────────────────────────────────────────────");
  const roles = await Users.distinct("role");
  console.log("Distinct roles:", roles);

  console.log("\n── deleteOne ───────────────────────────────────────────");
  const deleted = await Users.deleteOne({ email: "carol@example.com" });
  console.log("Deleted:", deleted?.name);

  console.log("\n── findByIdAndDelete ───────────────────────────────────");
  const deletedBob = await Users.findByIdAndDelete(bob._id);
  console.log("Deleted by id:", deletedBob?.name);

  console.log("\n── deleteMany ──────────────────────────────────────────");
  const deletedCount = await Users.deleteMany({});
  console.log("Deleted count:", deletedCount);

  await disconnect();
}

main().catch(console.error);
