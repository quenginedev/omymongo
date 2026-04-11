import z from "zod";
import { ObjectId } from 'mongodb'

export const ObjectID = ObjectId

export const ObjectIdSchema = z.union([z.string(), z.instanceof(ObjectId)])
  .refine((val) => {
    if (typeof val === "string") {
      return /^[0-9a-fA-F]{24}$/.test(val);
    }
    return val instanceof ObjectId;
  }, {
    message: "Invalid ObjectId format",
  })
  .transform((val) => typeof val === "string" ? new ObjectId(val) : val);

export const ConnectionOptionsSchema = z.object({
  uri: z.url().refine((url) => {
    try {
      const parsedUrl = new URL(url);
      return ["mongodb:", "mongodb+srv:"].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }, {
    message: "Invalid MongoDB connection string",
  }),
  appName: z.string().optional(),
  auth: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
  maxPoolSize: z.number().optional(),
  minPoolSize: z.number().optional(),
});

export const DocumentBaseSchema = z.object({
  _id: ObjectIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WithDocumentBase = <T extends z.ZodTypeAny>(schema: T) =>
  z.intersection(schema, DocumentBaseSchema);

export type StrictMode = "strict" | "strip" | "passthrough";

export type SchemaOptions = {
  strict?: StrictMode;
  timestamps?: boolean;
};

export class SchemaDefinition<Type> {
  readonly schema: z.ZodType<Type>;
  readonly options: Required<SchemaOptions>;

  constructor(schema: z.ZodType<Type>, options?: SchemaOptions) {
    this.options = {
      strict: options?.strict ?? "strict",
      timestamps: options?.timestamps ?? true,
    };

    this.schema = this.withStrictMode(schema, this.options.strict);
  }

  parseWrite(document: unknown): Type {
    return this.schema.parse(document);
  }

  parseRead(document: unknown): z.infer<typeof DocumentBaseSchema> & Type {
    return WithDocumentBase(this.schema).parse(document);
  }

  private withStrictMode(schema: z.ZodType<Type>, strict: StrictMode): z.ZodType<Type> {
    if (!(schema instanceof z.ZodObject)) return schema;

    if (strict === "strip") {
      return schema.strip() as unknown as z.ZodType<Type>;
    }

    if (strict === "passthrough") {
      return schema.passthrough() as unknown as z.ZodType<Type>;
    }

    return schema.strict() as unknown as z.ZodType<Type>;
  }
}

export const defineSchema = <Type>(schema: z.ZodType<Type>, options?: SchemaOptions) =>
  new SchemaDefinition(schema, options);

export const schema = defineSchema;

export interface BaseFilter<Value = unknown> {
  _id: z.infer<typeof ObjectIdSchema> | Partial<BaseFilter<ObjectId>>;
  $exists: boolean;
  $type: string | string[];
  $in: Value[];
  $nin: Value[];
  $gt: Value;
  $gte: Value;
  $lt: Value;
  $lte: Value;
  $ne: Value;
  $regex: string | { pattern: string; options?: string };
  $and?: Partial<BaseFilter<Value>>[];
  $or?: Partial<BaseFilter<Value>>[];
  $not?: Partial<BaseFilter<Value>>;
}

export const BaseFilterSchema: z.ZodType<Partial<BaseFilter>> = z.lazy(() => 
  z.object({
    $exists: z.boolean().optional(),
    $type: z.union([z.string(), z.array(z.string())]).optional(),
    $in: z.array(z.unknown()).optional(),
    $nin: z.array(z.unknown()).optional(),
    $gt: z.unknown().optional(),
    $gte: z.unknown().optional(),
    $lt: z.unknown().optional(),
    $lte: z.unknown().optional(),
    $ne: z.unknown().optional(),
    $regex: z.union([
      z.string(),
      z.object({
        pattern: z.string(),
        options: z.string().optional(),
      }),
    ]).optional(),
    // Reference the schema directly here, no need for extra z.lazy inside the object
    $and: z.array(BaseFilterSchema).optional(),
    $or: z.array(BaseFilterSchema).optional(),
    $not: BaseFilterSchema.optional(),
  })
);