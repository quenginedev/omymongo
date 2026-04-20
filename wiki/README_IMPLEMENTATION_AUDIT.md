# README Implementation Audit

Date: 2026-04-20
Scope reviewed: README.md vs all runtime implementation in src/ and behavior coverage in tests/.

## Status Legend

- Implemented: claim matches current code behavior.
- Partially implemented: feature exists, but behavior is narrower/different than README wording.
- Non-existing or inaccurate: claim is not implemented, not exposed as documented, or currently stale.

## Implemented

- Core CRUD APIs listed in README are present and implemented:
  - create, insertOne, insertMany, findOne, find, findById
  - updateOne, updateMany, findByIdAndUpdate, replaceOne
  - deleteOne, deleteMany, findByIdAndDelete
  - countDocuments, exists, distinct, aggregate
- Fluent APIs are implemented:
  - findFluent, findOneFluent, findByIdFluent, where, exec, execOne, execMany, first
  - fluent operators include in/gt/gte/lt/lte/ne/regex/exists/size/text
- Middleware hooks are implemented via pre and post with registration-order execution.
- Plugin entrypoint is implemented via use.
- Soft-delete lifecycle is implemented:
  - enableSoftDelete, restoreOne, hardDeleteOne, hardDeleteMany
  - deleteOne/deleteMany become soft-delete when enabled.
- Pagination helper is implemented on collection as paginate with metadata.
- Pagination plugin is implemented and configures paginate defaults (defaultPageSize/maxPageSize).
- Populate is implemented through refs mapping and populate option.
  - Populate supports alias output fields via refs mapping (e.g., populate `authorId` into `author`).
- Index support is implemented:
  - simple index map and rich index definitions (compound, unique, sparse, TTL, partial filter)
  - indexes are ensured lazily before operations.
- Connection/session/transaction helpers are implemented and exported:
  - connect, disconnect, startSession, withSession, withTransaction
  - collection operations reuse a shared connection via withLifetime without per-call disconnect.
- Schema modes strict/strip/passthrough are implemented through defineSchema.
- Error types exist and are exported:
  - ConnectionError, CollectionError, ValidationError, OmyMongoError.
- Lean/projection validation controls are implemented:
  - `skipValidation` query option bypasses read validation explicitly.
  - fluent `lean()` enables `skipValidation` behavior.
- Hook execution semantics are deterministic and non-short-circuiting across registered handlers:
  - all hooks run in registration order; first error is rethrown after execution.

## Partially Implemented

- "Zod validates on every write and full-document read"
  - Reads: behavior matches README (`skipValidation`/projection/lean skip validation; full document reads validate).
  - Writes: `insert/create/replace` validate full payloads and `updateOne/updateMany` validate `$set` payloads.
  - Remaining gap: non-`$set` update operators are not schema-validated as full write payloads.
- "Zero abstraction leakage / 1:1 native calls"
  - Operations map to MongoDB calls, but extra behavior exists (validation, hooks, soft-delete filter scoping, populate), so this is not strict 1:1 behavior.

## Non-existing or Inaccurate in README

- None currently identified in README for the previously-audited list.

## Notes on README Claims That Are Hard to Verify from Source Alone

- Bundle size claims ("lightweight/heavy") are not validated in this audit.
- Ecosystem comparison statements against Mongoose/native driver are not directly verifiable from repository code alone.

## Evidence Pointers

- Runtime API implementation:
  - src/collection.ts
  - src/connection.ts
  - src/schema.ts
  - src/plugins.ts
  - src/errors.ts
  - src/index.ts
- Behavioral coverage:
  - tests/collection.test.ts
  - tests/connection.test.ts
  - tests/v2.test.ts
