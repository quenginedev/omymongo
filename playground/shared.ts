import z from "zod";
import {
  Collection,
  Connection,
  SchemaDefinition,
  softDeletePlugin,
  paginationPlugin,
} from "../src/index.ts";

// ── Connection ────────────────────────────────────────────────────────────────

export const connection = Connection.getInstance({
  uri: "mongodb://localhost:27017/omymongo_playground",
});

// ── User ──────────────────────────────────────────────────────────────────────

const UserZodSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(0),
  role: z.enum(["admin", "member"]).default("member"),
});

export type UserType = z.infer<typeof UserZodSchema>;

export const UserSchema = new SchemaDefinition(UserZodSchema, {
  strict: "strict",
  timestamps: true,
});

export const Users = new Collection<UserType>("users", UserSchema, { connection });

// ── Post ──────────────────────────────────────────────────────────────────────

const PostZodSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  authorId: z.string(),
  tags: z.array(z.string()).default([]),
});

export type PostType = z.infer<typeof PostZodSchema>;

export const PostSchema = new SchemaDefinition(PostZodSchema, { timestamps: true });

export const Posts = new Collection<PostType>("posts", PostSchema, {
  connection,
  refs: {
    authorId: { field: "authorId", collection: "users", foreignField: "_id", single: true },
  },
})
  .use(softDeletePlugin, { fieldName: "deletedAt" })
  .use(paginationPlugin, { defaultPageSize: 5, maxPageSize: 50 });

// ── Comment ───────────────────────────────────────────────────────────────────

const CommentZodSchema = z.object({
  postId: z.string(),
  authorId: z.string(),
  text: z.string().min(1),
});

export type CommentType = z.infer<typeof CommentZodSchema>;

export const CommentSchema = new SchemaDefinition(CommentZodSchema, { timestamps: true });

export const Comments = new Collection<CommentType>("comments", CommentSchema, {
  connection,
  indexes: [{ keys: { postId: 1 } }, { keys: { authorId: 1 } }],
});
