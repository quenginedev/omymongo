# omymongo Milestone Board

This board translates the long-term vision into execution milestones with clear outcomes.

## Guiding Themes

- Safe schema evolution at scale
- Realtime event-driven data workflows
- Production reliability and observability
- Best-in-class TypeScript DX

## Milestone Board (12 Months)

| Milestone | Window | Theme | Outcome |
|---|---|---|---|
| M1 | Q1 | Migration Engine Foundation | Drift-safe schema evolution for live datasets |
| M2 | Q2 | Realtime Pub/Sub Core | Typed change streams over WebSocket and broker adapters |
| M3 | Q3 | Reliability Toolkit | Transaction helpers, outbox, and idempotent write paths |
| M4 | Q4 | Query Intelligence + DX | Index advice, perf insights, and stronger fluent typing |

## M1 - Migration Engine Foundation (Q1)

### Scope

- Introduce per-model schema versioning
- Add migration registry and runner
- Add dry-run migration reports
- Add read-time and write-time migration modes
- Add migration audit logs and migration status APIs

### API Shape (Draft)

```ts
const User = model({
  name: "users",
  schema: defineSchema(UserSchema),
  options: {
    versionKey: "_schemaVersion",
  },
});

User.migrations.register("1.0.0", (doc) => doc);
User.migrations.register("1.1.0", (doc) => ({
  ...doc,
  profile: { displayName: doc.name },
}));

await User.migrations.dryRun({ from: "1.0.0", to: "1.1.0" });
await User.migrations.apply({ target: "1.1.0", batchSize: 1000 });
```

### Success Metrics

- 100% migration steps are deterministic and reversible by plan
- 0 data loss in migration test matrix
- Dry-run report generated in under 5 seconds for 100k docs metadata sample
- Migration status visibility per model in API

### Exit Criteria

- Stable migration registry API
- Documentation for migration authoring and rollout playbook
- Integration tests for drift scenarios and rollback strategy

## M2 - Realtime Pub/Sub Core (Q2)

### Scope

- Realtime subscriptions from MongoDB change streams
- WebSocket stream adapter
- At least one broker adapter (Redis or NATS)
- Typed event payloads derived from model schemas
- Event filters and namespace channels

### API Shape (Draft)

```ts
const stream = User.realtime.stream({
  events: ["insert", "update", "delete"],
  filter: { role: { $in: ["admin"] } },
});

stream.on("event", (evt) => {
  // evt: typed payload
});

await User.realtime.attachWebSocketServer(wss, {
  channel: "users:*",
});

await User.realtime.attachRedisPubSub({ url: process.env.REDIS_URL! });
```

### Success Metrics

- p95 end-to-end event latency under 300ms (local benchmark)
- Event contract typings generated for all subscribed models
- Delivery retry strategy documented and tested
- 99.9% successful event dispatch in stress tests

### Exit Criteria

- Stable realtime API and one transport adapter GA
- Backpressure and reconnect handling tests
- Cookbook: chat feed, notifications, audit stream

## M3 - Reliability Toolkit (Q3)

### Scope

- Typed transaction scope helper
- Outbox pattern helper for reliable publish-after-commit
- Idempotency key support for write operations
- Optimistic concurrency controls

### API Shape (Draft)

```ts
await db.transaction(async (tx) => {
  await User.withTransaction(tx).updateOne({ _id: id }, { $set: { status: "active" } });
  await Outbox.withTransaction(tx).publish("user.activated", { id });
});

await User.idempotent("activate-user-123").updateOne(
  { _id: id },
  { $set: { status: "active" } },
);
```

### Success Metrics

- Exactly-once semantics achieved for idempotent writes in tests
- Transaction helper covers common rollback/retry paths
- Outbox processing throughput target documented and met
- No unhandled transient transaction failures in integration suite

### Exit Criteria

- Production-safe transaction docs
- Reliability test harness with fault injection
- Example app with outbox and retry worker

## M4 - Query Intelligence + DX (Q4)

### Scope

- Query analyzer and index recommendation engine
- Slow query diagnostics and explain summaries
- Better fluent select/projection output typing
- Additional fluent operators (regex, exists, size, text)

### API Shape (Draft)

```ts
const report = await User.analyzeQuery(
  User.where("email").equals("a@b.com").execMany,
);

console.log(report.indexRecommendations);

const users = await User
  .findFluent()
  .where("name")
  .regex(/^er/i)
  .select({ name: 1, email: 1 })
  .execMany();
```

### Success Metrics

- Index recommendation precision above 85% on benchmark suite
- p95 query latency improvement with applied recommendations
- Projection inference correctness validated by type tests
- Fluent operator docs with parity matrix

### Exit Criteria

- GA query analyzer and docs
- Type-level test suite for fluent projection inference
- Performance dashboards and reproducible benchmark scripts

## Backlog (Post-Year 1)

- Managed migration dashboard UI
- Plugin marketplace and certification model
- OpenTelemetry exporters and ready-made dashboards
- Multi-tenant policy engine and row-level data access controls

## Delivery Cadence

- Weekly: implementation PRs and test progress updates
- Bi-weekly: milestone demo and acceptance review
- Monthly: roadmap checkpoint and metric review

## Ownership Template

- Product: scope and acceptance criteria
- Core SDK: APIs and type system
- Runtime: transport adapters and reliability
- QA: integration and regression suite
- Docs: examples and migration guides
