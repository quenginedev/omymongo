/**
 * Playground Entry Point
 * Runs all examples sequentially.
 *
 * Run: npx tsx playground/index.ts
 */

const examples = [
  "crud",
  "hooks",
  "soft-delete",
  "pagination",
  "transactions",
  "indexes",
  "refs",
  "custom-plugin",
];

console.log("=== omymongo Playground ===\n");
console.log("Available examples (run individually with npx tsx playground/examples/<name>.ts):\n");
for (const name of examples) {
  console.log(`  npx tsx playground/examples/${name}.ts`);
}
console.log("\nMake sure MongoDB is running on localhost:27017 before running any example.");
console.log("For the transactions example, a replica set is required.");
