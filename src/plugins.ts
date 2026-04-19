export type SoftDeletePluginOptions = {
  fieldName?: string;
};

export const softDeletePlugin = <Type>(
  collection: import("./collection.ts").Collection<Type>,
  options?: SoftDeletePluginOptions,
  context?: { enableSoftDelete: (fieldName?: string) => void },
) => {
  const fieldName = options?.fieldName ?? "deletedAt";
  context?.enableSoftDelete(fieldName);
  if (!context) {
    collection.enableSoftDelete(fieldName);
  }
};

export const paginationPlugin = <Type>(_collection: import("./collection.ts").Collection<Type>) => {
  // Pagination is implemented directly on the collection API as paginate().
};
