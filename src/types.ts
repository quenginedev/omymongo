import type z from "zod";
import type {
  ClientSession,
  Filter as MongoFilter,
  UpdateFilter,
  FindOptions,
  Sort,
  AggregateOptions,
  OptionalUnlessRequiredId,
  TransactionOptions,
} from "mongodb";

export type ConnectionOptionsType = z.infer<typeof import("./schema.ts").ConnectionOptionsSchema>;
export type ObjectId = z.infer<typeof import("./schema.ts").ObjectIdSchema>;
export type Document<Type> = Type & z.infer<typeof import("./schema.ts").DocumentBaseSchema>;
export type OptionalId<Type> = OptionalUnlessRequiredId<Type>;
export type Filter<Type> = MongoFilter<Document<Type>>;
export type DistinctValue<Value> = Value extends (infer Item)[] ? Item : Value;

export type Update<Type> = UpdateFilter<Document<Type>>;

export type SessionOperationOptions = {
  session?: ClientSession;
};

export type SessionContext = {
  session: ClientSession;
};

export type TransactionContext = SessionContext;

export type TransactionRunOptions = TransactionOptions;

export type QueryOptions<Type> = {
  projection?: FindOptions["projection"];
  sort?: Sort;
  limit?: number;
  skip?: number;
  withDeleted?: boolean;
  populate?: PopulateOption<Type>;
} & SessionOperationOptions;

export type PopulateOption<Type> = keyof Type | Array<keyof Type>;

export type AggregateQueryOptions = {
  maxTimeMS?: number;
} & Pick<AggregateOptions, "allowDiskUse"> & SessionOperationOptions;

export type UpdateOneOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
} & SessionOperationOptions;

export type UpdateManyOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
} & SessionOperationOptions;

export type ReplaceOneOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
} & SessionOperationOptions;

export type PaginationResult<Type> = {
  data: Array<Document<Type>>;
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
};

export type PaginationOptions<Type> = QueryOptions<Type> & {
  page?: number;
  pageSize?: number;
};

export type PluginContext<Type> = {
  enableSoftDelete: (fieldName?: string) => void;
};

export type CollectionPlugin<Type, Options = void> = (
  collection: import("./collection.ts").Collection<Type>,
  options: Options,
  context: PluginContext<Type>,
) => void;