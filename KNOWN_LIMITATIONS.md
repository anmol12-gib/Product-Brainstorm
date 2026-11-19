# What is and is not implemented

This is a meaningful feature upgrade, **not a claim of zero bugs, unlimited scalability, or a production SLA**.

## Implemented in this ZIP

- PostgreSQL schema and transactions for boards/objects/operation log.
- Version-checked create/update/delete, per-board operation serialization, idempotent operation IDs.
- Board-scoped Socket.IO rooms and snapshots; snapshot/event sequence checks on clients.
- Link-based owner/editor/viewer roles verified at connection and before writes.
- Link rotation for editor/viewer tokens; previous invitations are revoked.
- Frontend drawing, transform, text edits, image compression, undo/redo with safety checks.
- Docker/Caddy/GitHub Actions configuration, unit tests, optional database integration test and load-test harness.

## Important limitations to address before serious adoption

1. **No full browser/production validation in this delivery.** Verify on a real machine and run the manual checklist; npm registry access was unavailable in the build environment, so npm installs, frontend bundle and Docker stack could not be executed here.
2. **No named user accounts or OAuth.** Board roles are bearer capability links. Owner links must be treated like passwords. Sharing a secret via chat or URL can expose permissions; the `#token=` fragment prevents routine server request logging, not browser-extension or recipient access.
3. **No offline edit queue or durable client outbox.** If offline, editing is blocked, and unsaved optimistic edits might be lost during recovery. Socket.IO reconnects and fetches full snapshots, not arbitrary missed-operation replays.
4. **Undo/redo is conflict-conservative.** Concurrent later edits to the same object can make undo impossible; it refuses to silently overwrite somebody else's changes. There is no generalized operational transformation or CRDT algorithm.
5. **Images are compressed base64 in PostgreSQL.** This intentionally limits image size for a small portfolio demo. For bigger images and real usage, upload to S3-compatible object storage using short-lived upload URLs and save only object keys in DB.
6. **A single backend instance only.** The in-memory presence and IP rate limiter are not shared; horizontal scaling requires the Socket.IO Redis adapter and shared rate-limit storage. Do not launch multiple backend replicas until that is implemented and tested.
7. **No automated off-server disaster recovery.** `deployment/backup.sh` makes an on-disk backup; set `BACKUP_S3_URI` with authenticated AWS CLI (or move the file to another location) and test restoring backups before treating them as durable.
8. **No production observability suite.** Health checks and console errors exist, but there is no central log ingestion, OpenTelemetry spans, dashboard or SLO. Set up logs/alerts if operating the service long-term.
9. **Not a multi-tenant SaaS.** No billing, organization memberships, account-level quotas, verified emails, consent/cookie notices, formal audit trails or abuse-reporting workflow.
10. **Potential client-side optimistic races.** Multiple rapid updates on the same object can conflict. The backend rejects stale versions and the client refreshes authoritative state; edits in progress may need to be retried.
11. **PostgreSQL write serialization is per board.** It guarantees a simple order but can become a bottleneck for highly active boards. Benchmark first, then consider operation batching or purpose-built collaborative data structures.
12. **No auto-rotation of owner tokens.** Back up the owner's unique link securely. Lost owner links cannot currently be recovered without database administration.
13. **No browser-level multi-client tests yet.** Add Playwright tests for concurrent users, dragged objects, image export, reconnection and mobile input devices before claiming a high QA standard.
14. **Deployment requirements.** A reachable domain, running Docker VPS, secure secrets, DNS/ports and adequate resources are prerequisites. The ZIP itself is not a live website.

## Next improvements by actual value

1. Run CI, real PostgreSQL integration tests, cross-device manual smoke tests and browser e2e tests.
2. Introduce actual user authentication if board ownership recovery and named collaborators matter.
3. Move images to object storage and use browser-generated thumbnails.
4. Add a reliable queued client outbox with deterministic retry and server-side idempotency receipts.
5. Add automated offsite backup and tested restore procedures, structured logs and monitoring alerts.
6. Benchmark 10/20/50 clients on the real deployment; report p50/p95 and environment, then optimize hotspots.
7. Only if warranted: Redis Socket.IO adapter + sticky/polling constraints + shared presence and limiter, then CRDT/OT for rich text.

### Why this architecture omits Kafka and Kubernetes

Real-time collaborative input is latency-sensitive and operations are small. PostgreSQL provides an ordering guarantee via per-board transactions, while Socket.IO distributes committed events to active viewers on the single server. Kafka adds overhead without solving client-side editing conflicts, and Kubernetes adds cost without improving the algorithm. This is a design choice, not an unfinished dependency.
