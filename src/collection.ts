import type {
  Document as MongoDocument,
  IndexDescription,
  OptionalUnlessRequiredId,
} from "mongodb";
import type z from "zod";
import { Connection } from "./connection.ts";
import { OmyMongoError, ValidationError } from "./errors.ts";
import { Logger } from "./logger.ts";
import { ObjectIdSchema, SchemaDefinition, WithDocumentBase } from "./schema.ts";
import type {
  AggregateQueryOptions,
  CollectionPlugin,
  DistinctValue,
  Document,
  Filter,
  OptionalId,
  PaginationOptions,
  PaginationResult,
  PluginContext,
  PopulateOption,
  QueryOptions,
  ReplaceOneOptions,
  SessionOperationOptions,
  Update,
  UpdateManyOptions,
  UpdateOneOptions,
} from "./types.ts";

export class CollectionError extends OmyMongoError {
  constructor(message: string) {
    super("COLLECTION_ERROR", message);
    this.name = "CollectionError";
  }
}

type CollectionOperation =
  | "create"
  | "insertOne"
  | "insertMany"
  | "findOne"
  | "find"
  | "updateOne"
  | "updateMany"
  | "deleteOne"
  | "deleteMany"
  | "replaceOne";

type HookContext<Type> = {
  operation: CollectionOperation;
  collection: string;
  payload?: unknown;
  result?: unknown;
  filter?: Filter<Type>;
};

type HookHandler<Type> = (ctx: HookContext<Type>) => Promise<void> | void;

type Reference = {
  field: string;
  collection?: string;
  foreignField?: string;
  single?: boolean;
};

type ReferenceMap<Type> = {
  [Key in keyof Type]?: Reference;
};

export type IndexDirection = 1 | -1;

export type IndexKeys<Type> = Partial<
  Record<keyof Type | keyof Pick<Document<Type>, "_id" | "createdAt" | "updatedAt">, IndexDirection>
>;

export type RichIndexDefinition<Type> = {
  keys: IndexKeys<Type>;
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Filter<Type>;
};

export type IndexMap<Type> = Partial<Record<keyof Type, IndexDirection>>;

export type CollectionIndexes<Type> = IndexMap<Type> | RichIndexDefinition<Type>[];

type DeleteOptions = SessionOperationOptions;

type RestoreOptions = SessionOperationOptions;

type HardDeleteOptions = SessionOperationOptions;

export class Collection<Type> {
  private schema: z.ZodType<Type>;
  private connection: Connection;
  private refs: ReferenceMap<Type>;
  private indexes?: CollectionIndexes<Type>;
  private logger = Logger;
  private indexesEnsured = false;
  private preHooks: Map<CollectionOperation, HookHandler<Type>[]> = new Map();
  private postHooks: Map<CollectionOperation, HookHandler<Type>[]> = new Map();
  private schemaDefinition: SchemaDefinition<Type> | null = null;
  private softDeleteField: string | null = null;

  constructor(
    private name: string,
    schema: z.ZodType<Type> | SchemaDefinition<Type>,
    options: CollectionOptions<Type>,
  ) {
    this.connection = options.connection ?? Connection.getInstance();
    this.refs = options.refs ?? {};
    this.indexes = options.indexes;

    if (schema instanceof SchemaDefinition) {
      this.schemaDefinition = schema;
      this.schema = schema.schema;
      return;
    }

    this.schema = schema;
  }

  pre(operation: CollectionOperation, handler: HookHandler<Type>): this {
    const handlers = this.preHooks.get(operation) ?? [];
    handlers.push(handler);
    this.preHooks.set(operation, handlers);
    return this;
  }

  post(operation: CollectionOperation, handler: HookHandler<Type>): this {
    const handlers = this.postHooks.get(operation) ?? [];
    handlers.push(handler);
    this.postHooks.set(operation, handlers);
    return this;
  }

  use<Options = void>(plugin: CollectionPlugin<Type, Options>, options?: Options): this {
    const context: PluginContext = {
      enableSoftDelete: (fieldName?: string) => this.enableSoftDelete(fieldName),
    };

    plugin(this, options as Options, context);
    return this;
  }

  enableSoftDelete(fieldName = "deletedAt") {
    this.softDeleteField = fieldName;
  }

  query(filter: Filter<Type> = {} as Filter<Type>) {
    return new CollectionQuery<Type>(this, filter);
  }

  findFluent(filter: Filter<Type> = {} as Filter<Type>) {
    return new CollectionQuery<Type>(this, filter);
  }

  findOneFluent(filter: Filter<Type> = {} as Filter<Type>) {
    return new CollectionQuery<Type>(this, filter);
  }

  findByIdFluent(id: Document<Type>["_id"]) {
    const parsedId = ObjectIdSchema.parse(id);
    return new CollectionQuery<Type>(this, { _id: parsedId } as Filter<Type>);
  }

  where<Key extends keyof Type>(field: Key) {
    return this.findFluent().where(field);
  }

  async paginate(
    filter: Filter<Type> = {} as Filter<Type>,
    options?: PaginationOptions<Type>,
  ): Promise<PaginationResult<Type>> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, options?.pageSize ?? 10);
    const skip = (page - 1) * pageSize;

    const [total, data] = await Promise.all([
      this.countDocuments(filter, { withDeleted: options?.withDeleted }),
      this.find(filter, {
        projection: options?.projection,
        sort: options?.sort,
        skip,
        limit: pageSize,
        withDeleted: options?.withDeleted,
        populate: options?.populate,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  private normalizeIndexes(): RichIndexDefinition<Type>[] {
    if (!this.indexes) return [];

    if (Array.isArray(this.indexes)) {
      return this.indexes;
    }

    return Object.entries(this.indexes).map(([field, direction]) => ({
      keys: { [field]: direction as IndexDirection } as IndexKeys<Type>,
    }));
  }

  private buildIndexModels(definitions: RichIndexDefinition<Type>[]): IndexDescription[] {
    return definitions.map((definition) => {
      const model: IndexDescription = {
        key: Object.fromEntries(
          Object.entries(definition.keys).filter(([, direction]) => direction !== undefined),
        ) as Record<string, IndexDirection>,
      };

      if (definition.name !== undefined) {
        model.name = definition.name;
      }

      if (definition.unique !== undefined) {
        model.unique = definition.unique;
      }

      if (definition.sparse !== undefined) {
        model.sparse = definition.sparse;
      }

      if (definition.expireAfterSeconds !== undefined) {
        model.expireAfterSeconds = definition.expireAfterSeconds;
      }

      if (definition.partialFilterExpression !== undefined) {
        model.partialFilterExpression = definition.partialFilterExpression;
      }

      return model;
    });
  }

  private async ensureIndexes() {
    // References are configured for upcoming populate support.
    void this.refs;

    if (!this.indexes || this.indexesEnsured) return;

    const definitions = this.normalizeIndexes();
    if (definitions.length === 0) {
      this.indexesEnsured = true;
      return;
    }

    for (const definition of definitions) {
      if (Object.keys(definition.keys).length === 0) {
        throw new CollectionError(
          `Index definition for ${this.name} must declare at least one key`,
        );
      }
    }

    const indexModels = this.buildIndexModels(definitions);

    await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection(this.name);

      await collection.createIndexes(indexModels);
    });

    this.indexesEnsured = true;
  }

  async insertOne(
    document: OptionalId<Type>,
    options?: SessionOperationOptions,
  ): Promise<Document<Type>> {
    await this.ensureIndexes();
    await this.runHooks("pre", {
      operation: "insertOne",
      collection: this.name,
      payload: document,
    });

    const parsedDoc = this.parseWrite(document);
    const insertPayload = {
      ...parsedDoc,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OptionalUnlessRequiredId<Document<Type>>;
    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.insertOne(insertPayload, {
        session: options?.session,
      });
    });

    if (!response.acknowledged) {
      throw new CollectionError("Failed to insert document into collection");
    }
    const inserted = { ...insertPayload, _id: response.insertedId } as Document<Type>;
    await this.runHooks("post", {
      operation: "insertOne",
      collection: this.name,
      payload: document,
      result: inserted,
    });
    return inserted;
  }

  async insertMany(
    documents: OptionalId<Type>[],
    options?: SessionOperationOptions,
  ): Promise<Document<Type>[]> {
    await this.ensureIndexes();
    await this.runHooks("pre", {
      operation: "insertMany",
      collection: this.name,
      payload: documents,
    });

    const parsedDocs = documents.map((doc) => this.parseWrite(doc));
    const insertPayloads = parsedDocs.map((doc) => ({
      ...doc,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as OptionalUnlessRequiredId<Document<Type>>[];

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.insertMany(insertPayloads, {
        session: options?.session,
      });
    });

    if (!response.acknowledged) {
      throw new CollectionError("Failed to insert documents into collection");
    }

    const inserted = insertPayloads.map((payload, index) => ({
      ...payload,
      _id: response.insertedIds[index],
    })) as Document<Type>[];

    await this.runHooks("post", {
      operation: "insertMany",
      collection: this.name,
      payload: documents,
      result: inserted,
    });

    return inserted;
  }

  async create(
    document: OptionalId<Type>,
    options?: SessionOperationOptions,
  ): Promise<Document<Type>> {
    await this.runHooks("pre", {
      operation: "create",
      collection: this.name,
      payload: document,
    });

    return this.insertOne(document, options);
  }

  async findOne(
    filter: Filter<Type>,
    options?: QueryOptions<Type>,
  ): Promise<Document<Type> | null> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    await this.runHooks("pre", {
      operation: "findOne",
      collection: this.name,
      filter: scopedFilter,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.findOne(scopedFilter, {
        projection: options?.projection,
        sort: options?.sort,
        session: options?.session,
      });
    });
    if (!response) return null;
    const rawResult = options?.projection
      ? (response as Document<Type>)
      : this.validateDocument(response);
    if (!rawResult) return null;
    const [result] = await this.populateDocuments([rawResult], options?.populate, options);
    await this.runHooks("post", {
      operation: "findOne",
      collection: this.name,
      filter: scopedFilter,
      result,
    });
    return result ?? null;
  }

  async findById(
    id: Document<Type>["_id"],
    options?: QueryOptions<Type>,
  ): Promise<Document<Type> | null> {
    const parsedId = ObjectIdSchema.parse(id);
    return this.findOne({ _id: parsedId } as Filter<Type>, options);
  }

  async find(filter: Filter<Type>, options?: QueryOptions<Type>): Promise<Document<Type>[]> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    await this.runHooks("pre", {
      operation: "find",
      collection: this.name,
      filter: scopedFilter,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection
        .find(scopedFilter, {
          projection: options?.projection,
          sort: options?.sort,
          limit: options?.limit,
          skip: options?.skip,
          session: options?.session,
        })
        .toArray();
    });

    const validated = response
      .map((doc) => this.validateDocument(doc))
      .filter((doc): doc is Document<Type> => doc !== null);
    const result = await this.populateDocuments(validated, options?.populate, options);

    await this.runHooks("post", {
      operation: "find",
      collection: this.name,
      filter: scopedFilter,
      result,
    });

    return result;
  }

  async deleteOne(filter: Filter<Type>, options?: DeleteOptions): Promise<Document<Type> | null> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, false);
    await this.runHooks("pre", {
      operation: "deleteOne",
      collection: this.name,
      filter: scopedFilter,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      if (this.softDeleteField) {
        return await collection.findOneAndUpdate(
          scopedFilter,
          {
            $set: {
              [this.softDeleteField]: new Date(),
              updatedAt: new Date(),
            },
          } as Update<Type>,
          {
            returnDocument: "after",
            session: options?.session,
          },
        );
      }

      const record = await collection.findOne(scopedFilter, {
        session: options?.session,
      });
      await collection.deleteOne(scopedFilter, { session: options?.session });
      return record;
    });

    if (!response) return null;
    const result = this.validateDocument(response);
    await this.runHooks("post", {
      operation: "deleteOne",
      collection: this.name,
      filter: scopedFilter,
      result,
    });
    return result;
  }

  async findByIdAndDelete(
    id: Document<Type>["_id"],
    options?: DeleteOptions,
  ): Promise<Document<Type> | null> {
    const parsedId = ObjectIdSchema.parse(id);
    return this.deleteOne({ _id: parsedId } as Filter<Type>, options);
  }

  async updateOne(
    filter: Filter<Type>,
    update: Update<Type>,
    options?: UpdateOneOptions,
  ): Promise<Document<Type> | null> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    await this.runHooks("pre", {
      operation: "updateOne",
      collection: this.name,
      filter: scopedFilter,
      payload: update,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      const safeUpdate: Update<Type> = {
        ...update,
        $set: {
          ...update.$set,
          updatedAt: new Date(),
        },
      } as Update<Type>;

      return await collection.findOneAndUpdate(scopedFilter, safeUpdate, {
        returnDocument: "after",
        upsert: options?.upsert,
        session: options?.session,
      });
    });

    if (!response) return null;
    const result = this.validateDocument(response);
    await this.runHooks("post", {
      operation: "updateOne",
      collection: this.name,
      filter: scopedFilter,
      payload: update,
      result,
    });
    return result;
  }

  async findByIdAndUpdate(
    id: Document<Type>["_id"],
    update: Update<Type>,
    options?: UpdateOneOptions,
  ): Promise<Document<Type> | null> {
    const parsedId = ObjectIdSchema.parse(id);
    return this.updateOne({ _id: parsedId } as Filter<Type>, update, options);
  }

  async updateMany(
    filter: Filter<Type>,
    update: Update<Type>,
    options?: UpdateManyOptions,
  ): Promise<number> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    await this.runHooks("pre", {
      operation: "updateMany",
      collection: this.name,
      filter: scopedFilter,
      payload: update,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      const safeUpdate: Update<Type> = {
        ...update,
        $set: {
          ...update.$set,
          updatedAt: new Date(),
        },
      } as Update<Type>;

      return await collection.updateMany(scopedFilter, safeUpdate, {
        upsert: options?.upsert,
        session: options?.session,
      });
    });

    await this.runHooks("post", {
      operation: "updateMany",
      collection: this.name,
      filter: scopedFilter,
      payload: update,
      result: response.modifiedCount,
    });

    return response.modifiedCount;
  }

  async replaceOne(
    filter: Filter<Type>,
    replacement: OptionalId<Type>,
    options?: ReplaceOneOptions,
  ): Promise<Document<Type> | null> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    await this.runHooks("pre", {
      operation: "replaceOne",
      collection: this.name,
      filter: scopedFilter,
      payload: replacement,
    });

    const parsedReplacement = this.parseWrite(replacement);
    const nextDoc = {
      ...parsedReplacement,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OptionalId<Document<Type>>;

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.findOneAndReplace(scopedFilter, nextDoc as Document<Type>, {
        returnDocument: "after",
        upsert: options?.upsert,
        session: options?.session,
      });
    });

    if (!response) return null;
    const result = this.validateDocument(response);
    await this.runHooks("post", {
      operation: "replaceOne",
      collection: this.name,
      filter: scopedFilter,
      payload: replacement,
      result,
    });
    return result;
  }

  async deleteMany(filter: Filter<Type>, options?: DeleteOptions): Promise<number> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, false);
    await this.runHooks("pre", {
      operation: "deleteMany",
      collection: this.name,
      filter: scopedFilter,
    });

    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      if (this.softDeleteField) {
        return await collection.updateMany(
          scopedFilter,
          {
            $set: {
              [this.softDeleteField]: new Date(),
              updatedAt: new Date(),
            },
          } as Update<Type>,
          {
            session: options?.session,
          },
        );
      }

      return await collection.deleteMany(scopedFilter, {
        session: options?.session,
      });
    });

    await this.runHooks("post", {
      operation: "deleteMany",
      collection: this.name,
      filter: scopedFilter,
      result: "deletedCount" in response ? response.deletedCount : response.modifiedCount,
    });

    return "deletedCount" in response ? response.deletedCount : response.modifiedCount;
  }

  async countDocuments(
    filter: Filter<Type> = {} as Filter<Type>,
    options?: Pick<QueryOptions<Type>, "withDeleted" | "session">,
  ): Promise<number> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    return this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.countDocuments(scopedFilter, {
        session: options?.session,
      });
    });
  }

  async exists(
    filter: Filter<Type>,
    options?: Pick<QueryOptions<Type>, "withDeleted" | "session">,
  ): Promise<boolean> {
    const count = await this.countDocuments(filter, options);
    return count > 0;
  }

  async distinct<Key extends keyof Type>(
    field: Key,
    filter: Filter<Type> = {} as Filter<Type>,
    options?: Pick<QueryOptions<Type>, "withDeleted" | "session">,
  ): Promise<DistinctValue<Type[Key]>[]> {
    await this.ensureIndexes();
    const scopedFilter = this.withScopedFilter(filter, options?.withDeleted);
    return this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      const values = await collection.distinct(String(field), scopedFilter, {
        session: options?.session,
      });
      return values as DistinctValue<Type[Key]>[];
    });
  }

  async aggregate<Result extends MongoDocument = MongoDocument>(
    pipeline: MongoDocument[],
    options?: AggregateQueryOptions,
  ): Promise<Result[]> {
    await this.ensureIndexes();
    return this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection
        .aggregate<Result>(pipeline, {
          allowDiskUse: options?.allowDiskUse,
          maxTimeMS: options?.maxTimeMS,
          session: options?.session,
        })
        .toArray();
    });
  }

  async restoreOne(filter: Filter<Type>, options?: RestoreOptions): Promise<Document<Type> | null> {
    if (!this.softDeleteField) {
      throw new CollectionError("Soft delete is not enabled on this collection");
    }

    const scopedFilter = this.withScopedFilter(filter, true);
    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.findOneAndUpdate(
        {
          ...scopedFilter,
          [this.softDeleteField!]: { $exists: true },
        } as Filter<Type>,
        {
          $unset: {
            [this.softDeleteField!]: true,
          },
          $set: {
            updatedAt: new Date(),
          },
        } as Update<Type>,
        {
          returnDocument: "after",
          session: options?.session,
        },
      );
    });

    if (!response) return null;
    return this.validateDocument(response);
  }

  async hardDeleteOne(
    filter: Filter<Type>,
    options?: HardDeleteOptions,
  ): Promise<Document<Type> | null> {
    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      const record = await collection.findOne(filter, {
        session: options?.session,
      });
      await collection.deleteOne(filter, { session: options?.session });
      return record;
    });

    if (!response) return null;
    return this.validateDocument(response);
  }

  async hardDeleteMany(filter: Filter<Type>, options?: HardDeleteOptions): Promise<number> {
    const response = await this.connection.withLifetime(async (client) => {
      const db = client.db();
      const collection = db.collection<Document<Type>>(this.name);
      return await collection.deleteMany(filter, { session: options?.session });
    });

    return response.deletedCount;
  }

  validateDocument(document: unknown): Document<Type> | null {
    const parsed = this.safeParseRead(document);
    if (!parsed.success) {
      this.logger.error("Document validation failed", {
        collection: this.name,
        document,
        issues: parsed.error.issues,
      });
      Logger.error("Document validation failed", {
        collection: this.name,
        document,
        issues: JSON.stringify(parsed.error.issues, null, 2),
      });
      return null;
    }
    return parsed.data as Document<Type>;
  }

  private parseWrite(document: unknown): Type {
    try {
      if (this.schemaDefinition) {
        return this.schemaDefinition.parseWrite(document);
      }

      return this.schema.parse(document);
    } catch (error) {
      throw new ValidationError("Document write validation failed", error);
    }
  }

  private safeParseRead(document: unknown) {
    const targetSchema = this.schemaDefinition?.schema ?? this.schema;
    const fullSchema = WithDocumentBase(targetSchema);
    const initial = fullSchema.safeParse(document);

    if (initial.success) return initial;

    if (
      this.softDeleteField &&
      document &&
      typeof document === "object" &&
      !Array.isArray(document)
    ) {
      const clone = { ...(document as Record<string, unknown>) };
      delete clone[this.softDeleteField];
      return fullSchema.safeParse(clone);
    }

    return initial;
  }

  private withScopedFilter(filter: Filter<Type>, withDeleted = false): Filter<Type> {
    if (!this.softDeleteField || withDeleted) {
      return filter;
    }

    if (this.filterMentionsSoftDelete(filter)) {
      return filter;
    }

    return {
      ...filter,
      [this.softDeleteField]: { $exists: false },
    } as Filter<Type>;
  }

  private filterMentionsSoftDelete(filter: Filter<Type>): boolean {
    if (!this.softDeleteField) return false;

    if (Object.prototype.hasOwnProperty.call(filter as object, this.softDeleteField)) {
      return true;
    }

    const logicGroups = [
      (filter as Record<string, unknown>).$and,
      (filter as Record<string, unknown>).$or,
      (filter as Record<string, unknown>).$nor,
    ];

    for (const group of logicGroups) {
      if (!Array.isArray(group)) continue;

      for (const item of group) {
        if (
          item &&
          typeof item === "object" &&
          this.filterMentionsSoftDelete(item as Filter<Type>)
        ) {
          return true;
        }
      }
    }

    const notGroup = (filter as Record<string, unknown>).$not;
    if (notGroup && typeof notGroup === "object") {
      return this.filterMentionsSoftDelete(notGroup as Filter<Type>);
    }

    return false;
  }

  private async populateDocuments(
    docs: Document<Type>[],
    populate?: PopulateOption<Type>,
    options?: SessionOperationOptions,
  ): Promise<Document<Type>[]> {
    if (!populate || docs.length === 0) return docs;

    const fields = Array.isArray(populate)
      ? populate.map((field) => String(field))
      : [String(populate)];

    for (const fieldName of fields) {
      const ref = this.refs[fieldName as keyof Type];
      if (!ref) continue;

      const targetCollectionName = ref.collection ?? ref.field;
      const foreignField = ref.foreignField ?? "_id";
      const values: unknown[] = [];

      for (const doc of docs) {
        const current = (doc as Record<string, unknown>)[fieldName];
        if (Array.isArray(current)) {
          values.push(...current);
          continue;
        }

        if (current !== undefined && current !== null) {
          values.push(current);
        }
      }

      if (values.length === 0) continue;

      const parsedValues = values
        .map((value) => ObjectIdSchema.safeParse(value))
        .filter((res) => res.success)
        .map((res) => res.data);

      if (parsedValues.length === 0 && foreignField === "_id") {
        continue;
      }

      const targetDocs = await this.connection.withLifetime(async (client) => {
        const db = client.db();
        const collection = db.collection(targetCollectionName);
        return collection
          .find(
            {
              [foreignField]: {
                $in: foreignField === "_id" ? parsedValues : values,
              },
            },
            {
              session: options?.session,
            },
          )
          .toArray();
      });

      const map = new Map<string, MongoDocument>();
      for (const targetDoc of targetDocs) {
        const keySource = targetDoc[foreignField] as unknown;
        if (keySource === undefined || keySource === null) continue;
        map.set(String(keySource), targetDoc);
      }

      for (const doc of docs) {
        const current = (doc as Record<string, unknown>)[fieldName];
        if (Array.isArray(current)) {
          (doc as Record<string, unknown>)[fieldName] = current
            .map((value) => map.get(String(value)))
            .filter(Boolean);
          continue;
        }

        if (current === undefined || current === null) {
          continue;
        }

        (doc as Record<string, unknown>)[fieldName] = map.get(String(current)) ?? null;
      }
    }

    return docs;
  }

  private async runHooks(phase: "pre" | "post", context: HookContext<Type>) {
    const store = phase === "pre" ? this.preHooks : this.postHooks;
    const handlers = store.get(context.operation) ?? [];

    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (error) {
        throw new OmyMongoError(
          "COLLECTION_ERROR",
          `Collection ${phase} hook failed for ${context.operation}`,
          error,
        );
      }
    }
  }
}

type CollectionOptions<Type> = {
  connection?: Connection;
  refs?: ReferenceMap<Type>;
  indexes?: CollectionIndexes<Type>;
};

export const createCollection = <Type extends unknown>(options: {
  name: string;
  schema: z.ZodSchema<Type> | SchemaDefinition<Type>;
  options?: CollectionOptions<Type>;
}) =>
  new Collection<Type>(options.name, options.schema, {
    connection: options.options?.connection,
    refs: options.options?.refs,
    indexes: options.options?.indexes,
  });

export const model = createCollection;

export class CollectionQuery<Type> {
  private options: QueryOptions<Type> = {};
  private currentField: string | null = null;

  constructor(
    private collection: Collection<Type>,
    private filter: Filter<Type>,
  ) {}

  where<Key extends keyof Type>(field: Key) {
    this.currentField = String(field);
    return this;
  }

  equals(value: unknown) {
    this.assertCurrentField();
    this.setFieldCondition(this.currentField!, value);
    return this;
  }

  in(values: unknown[]) {
    this.assertCurrentField();
    this.setFieldCondition(this.currentField!, { $in: values });
    return this;
  }

  gt(value: unknown) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$gt", value);
    return this;
  }

  gte(value: unknown) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$gte", value);
    return this;
  }

  lt(value: unknown) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$lt", value);
    return this;
  }

  lte(value: unknown) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$lte", value);
    return this;
  }

  ne(value: unknown) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$ne", value);
    return this;
  }

  regex(pattern: string | RegExp, options?: string) {
    this.assertCurrentField();

    const resolvedPattern = pattern instanceof RegExp ? pattern.source : pattern;
    const resolvedOptions = options ?? (pattern instanceof RegExp ? pattern.flags : undefined);

    this.mergeFieldOperator(this.currentField!, "$regex", resolvedPattern);

    if (resolvedOptions && resolvedOptions.length > 0) {
      this.mergeFieldOperator(this.currentField!, "$options", resolvedOptions);
    }

    return this;
  }

  exists(value = true) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$exists", value);
    return this;
  }

  size(value: number) {
    this.assertCurrentField();
    this.mergeFieldOperator(this.currentField!, "$size", value);
    return this;
  }

  text(
    search: string,
    options?: {
      language?: string;
      caseSensitive?: boolean;
      diacriticSensitive?: boolean;
    },
  ) {
    const textQuery = {
      $search: search,
    } as Record<string, unknown>;

    if (options?.language !== undefined) {
      textQuery.$language = options.language;
    }

    if (options?.caseSensitive !== undefined) {
      textQuery.$caseSensitive = options.caseSensitive;
    }

    if (options?.diacriticSensitive !== undefined) {
      textQuery.$diacriticSensitive = options.diacriticSensitive;
    }

    (this.filter as Record<string, unknown>).$text = textQuery;
    return this;
  }

  and(filter: Filter<Type>) {
    const current = (this.filter as Record<string, unknown>).$and;
    const group = Array.isArray(current) ? current : [];
    group.push(filter as unknown as Record<string, unknown>);
    (this.filter as Record<string, unknown>).$and = group;
    return this;
  }

  or(filter: Filter<Type>) {
    const current = (this.filter as Record<string, unknown>).$or;
    const group = Array.isArray(current) ? current : [];
    group.push(filter as unknown as Record<string, unknown>);
    (this.filter as Record<string, unknown>).$or = group;
    return this;
  }

  sort(sort: QueryOptions<Type>["sort"]) {
    this.options.sort = sort;
    return this;
  }

  limit(limit: number) {
    this.options.limit = limit;
    return this;
  }

  skip(skip: number) {
    this.options.skip = skip;
    return this;
  }

  select(projection: QueryOptions<Type>["projection"]) {
    this.options.projection = projection;
    return this;
  }

  populate(fields: PopulateOption<Type>) {
    this.options.populate = fields;
    return this;
  }

  withDeleted() {
    this.options.withDeleted = true;
    return this;
  }

  session(session: SessionOperationOptions["session"]) {
    this.options.session = session;
    return this;
  }

  lean() {
    return this;
  }

  async exec() {
    return this.collection.find(this.filter, this.options);
  }

  async execOne() {
    return this.collection.findOne(this.filter, this.options);
  }

  async execMany() {
    return this.collection.find(this.filter, this.options);
  }

  async first() {
    return this.collection.findOne(this.filter, this.options);
  }

  private assertCurrentField() {
    if (!this.currentField) {
      throw new CollectionError(
        "No field selected. Call where(field) before applying a field operator.",
      );
    }
  }

  private setFieldCondition(field: string, value: unknown) {
    (this.filter as Record<string, unknown>)[field] = value;
  }

  private mergeFieldOperator(field: string, operator: string, value: unknown) {
    const record = this.filter as Record<string, unknown>;
    const current = record[field];
    if (current && typeof current === "object" && !Array.isArray(current)) {
      record[field] = {
        ...(current as Record<string, unknown>),
        [operator]: value,
      };
      return;
    }

    record[field] = {
      [operator]: value,
    };
  }
}
