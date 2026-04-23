/**
 * Custom Plugin Example
 * Demonstrates: writing and applying a CollectionPlugin, combining multiple
 *               plugins on one collection, and a plugin with options
 *
 * Run: npx tsx playground/examples/custom-plugin.ts
 */
import z from "zod";
import {
  Collection,
  SchemaDefinition,
  connect,
  disconnect,
  softDeletePlugin,
  paginationPlugin,
} from "../../src/index.ts";
import type { CollectionPlugin } from "../../src/index.ts";
import { connection } from "../shared.ts";

// ── Plugin 1: audit logger ─────────────────────────────────────────────────
//   Logs every write operation with a timestamp and the caller operation name.

type AuditPluginOptions = { label?: string };

const auditPlugin: CollectionPlugin<NoteType, AuditPluginOptions> = (collection, options) => {
  const label = options?.label ?? "AUDIT";
  const ops = [
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
  ] as const;

  for (const op of ops) {
    collection.post(op, ({ operation, result }) => {
      console.log(
        `[${label}] ${new Date().toISOString()} — ${operation} completed`,
        result ? "(result present)" : "(no result)",
      );
    });
  }
};

// ── Plugin 2: read-only guard ──────────────────────────────────────────────
//   Throws before any write if the collection is locked.

const readOnlyPlugin: CollectionPlugin<NoteType, { locked: boolean }> = (collection, options) => {
  if (!options?.locked) return;

  const writeOps = [
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
  ] as const;
  for (const op of writeOps) {
    collection.pre(op, () => {
      throw new Error(`Collection is read-only — ${op} is not allowed.`);
    });
  }
};

// ── Schema ─────────────────────────────────────────────────────────────────

const NoteZodSchema = z.object({
  content: z.string().min(1),
  author: z.string(),
  pinned: z.boolean().default(false),
});

type NoteType = z.infer<typeof NoteZodSchema>;
const NoteSchema = new SchemaDefinition(NoteZodSchema, { timestamps: true });

// ── Collection with multiple plugins ───────────────────────────────────────

const Notes = new Collection<NoteType>("notes", NoteSchema, { connection })
  .use(softDeletePlugin, { fieldName: "deletedAt" })
  .use(paginationPlugin, { defaultPageSize: 3 })
  .use(auditPlugin, { label: "NOTES" });

// ── Read-only collection example ───────────────────────────────────────────

const ReadOnlyNotes = new Collection<NoteType>("notes", NoteSchema, { connection }).use(
  readOnlyPlugin,
  { locked: true },
);

async function main() {
  await connect({ uri: "mongodb://localhost:27017/omymongo_playground" });

  console.log("\n── insert via Notes (audit plugin fires) ───────────────");
  const note = await Notes.insertOne({
    content: "Hello from plugin!",
    author: "Alice",
    pinned: true,
  });

  console.log("\n── update via Notes ────────────────────────────────────");
  await Notes.updateOne({ _id: note._id }, { $set: { pinned: false } });

  console.log("\n── soft-delete via Notes ───────────────────────────────");
  await Notes.deleteOne({ _id: note._id });

  console.log("\n── attempt write on read-only collection ───────────────");
  try {
    await ReadOnlyNotes.insertOne({ content: "Should fail", author: "Bob", pinned: false });
  } catch (err) {
    console.log("Expected error:", (err as Error).message);
  }

  console.log("\n── paginate notes ──────────────────────────────────────");
  await Notes.insertMany([
    { content: "Note 2", author: "Bob", pinned: false },
    { content: "Note 3", author: "Carol", pinned: false },
    { content: "Note 4", author: "Dave", pinned: true },
  ]);
  const page = await Notes.paginate({}, { page: 1 });
  console.log(
    "Page 1 notes:",
    page.data.map((n) => n.content),
  );
  console.log("Meta:", page.meta);

  // cleanup
  await Notes.hardDeleteMany({});

  await disconnect();
}

main().catch(console.error);
