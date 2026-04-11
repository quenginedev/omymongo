import type z from "zod";
import type {
  Filter as MongoFilter,
  UpdateFilter,
  FindOptions,
  Sort,
  AggregateOptions,
  OptionalUnlessRequiredId,
} from "mongodb";

export type ConnectionOptionsType = z.infer<typeof import("./schema.ts").ConnectionOptionsSchema>;
export type ObjectId = z.infer<typeof import("./schema.ts").ObjectIdSchema>;
export type Document<Type> = Type & z.infer<typeof import("./schema.ts").DocumentBaseSchema>;
export type OptionalId<Type> = OptionalUnlessRequiredId<Type>;
export type Filter<Type> = MongoFilter<Document<Type>>;
export type DistinctValue<Value> = Value extends (infer Item)[] ? Item : Value;

export type Update<Type> = UpdateFilter<Document<Type>>;

export type QueryOptions<Type> = {
  projection?: FindOptions["projection"];
  sort?: Sort;
  limit?: number;
  skip?: number;
  withDeleted?: boolean;
  populate?: PopulateOption<Type>;
};

export type PopulateOption<Type> = keyof Type | Array<keyof Type>;

export type AggregateQueryOptions = {
  maxTimeMS?: number;
} & Pick<AggregateOptions, "allowDiskUse">;

export type UpdateOneOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
};

export type UpdateManyOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
};

export type ReplaceOneOptions = {
  upsert?: boolean;
  withDeleted?: boolean;
};

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