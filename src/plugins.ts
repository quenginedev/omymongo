import type { PaginationPluginOptions, PluginContext } from "./types.ts";
import type { Collection } from "./collection.ts";
export type SoftDeletePluginOptions = {
  fieldName?: string;
};

export const softDeletePlugin = <Type>(
  collection: Collection<Type>,
  options: SoftDeletePluginOptions,
  context: PluginContext,
) => {
  const fieldName = options?.fieldName ?? "deletedAt";
  context?.enableSoftDelete(fieldName);
  if (!context) {
    collection.enableSoftDelete(fieldName);
  }
};

export const paginationPlugin = <Type>(
  collection: Collection<Type>,
  options: PaginationPluginOptions | void,
  context: PluginContext,
) => {
  context?.enablePagination(options ?? undefined);
  if (!context) {
    collection.enablePagination(options ?? undefined);
  }
};
