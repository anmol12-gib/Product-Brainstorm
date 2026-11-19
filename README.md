# Product Brainstorm v2 — Persistent collaborative whiteboard

A real-time multi-user whiteboard with **React + TypeScript + Zustand**, **Node.js + Socket.IO**, and **PostgreSQL**. This is a substantial redevelopment of the original browser-based prototype. It retains drawing, shapes, sticky notes, text, images, transforms, presence, export and pan/zoom, while replacing the global Socket.IO relay with **authorized, board-isolated, durable operations**.

> **Status: deployment-ready source, not a verified production service.** The included source has not been deployed to AWS or browser-tested in this environment. Run the test checklist before trusting real user data. See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Features

- One URL per board, with random **owner/editor/viewer capability tokens** in URL fragments (the server only receives tokens through authenticated API requests or Socket.IO authentication).
- Owner-generated editing and view-only invitations, with link rotation. Keep **owner links PRIVATE**. This is **link-based access control**, not signed-in user accounts or full user identity management.
- Role checks for each mutation; separate Socket.IO rooms; board-scoped presence and cursor positions.
- PostgreSQL durable objects, ordered operation log, idempotent operation IDs, expected-object-version conflict detection, authoritative snapshots on connection/reconnection.
- Basic collaborative undo/redo that refuses to overwrite changes made since the recorded operation; whole-board clear is owner-only and not undoable.
- Final-stroke synchronization instead of sending an ever-growing path every mouse move; one commit for drag/resize/rotation; compressed image previews capped at ~245 KB each.
- Docker Compose, Caddy HTTPS/WSS reverse proxy, health/readiness endpoints, CI tests, deployment script, optional load test and database backup script.

## Start locally — easiest path

Install **Node.js 22+**, **Docker Desktop** (running), and Git. Open two terminals in the repository root.

**Terminal 1 — PostgreSQL and backend**

```bash
# Create a local PostgreSQL database in Docker (only once)
docker run --name brainstorm-db -e POSTGRES_USER=brainstorm -e POSTGRES_PASSWORD=localpassword -e POSTGRES_DB=brainstorm -p 127.0.0.1:5432:5432 -v brainstorm-local-db:/var/lib/postgresql/data -d postgres:16-alpine

cd whiteboard-backend
npm install
# Linux/macOS bash:
export DATABASE_URL='postgresql://brainstorm:localpassword@localhost:5432/brainstorm'
# Windows PowerShell instead:
# $env:DATABASE_URL='postgresql://brainstorm:localpassword@localhost:5432/brainstorm'
npm run migrate
npm start
```

After the first run, to start the existing DB again: `docker start brainstorm-db`. If the container already exists, do not repeat `docker run`.

**Terminal 2 — React frontend**

```bash
npm ci
npm run dev
```

Open **http://localhost:5173/**. The app creates a new board automatically. Copy the browser's URL somewhere safe: it contains the **owner secret** after `#token=`.

Click **SHARE → Copy new editing invitation** and open the copied link in another browser or incognito window. You should be able to draw on either screen and see the changes on both. Refresh: objects should remain saved.

**Note:** The localhost Vite server proxies `/api` and `/socket.io` to port 3000. No `VITE_SOCKET_URL` setting is needed for this standard development setup.

### Run checks

```bash
# From repository root
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build

# Backend tests (from whiteboard-backend/)
npm test
```

To run the PostgreSQL integration test, set `TEST_DATABASE_URL` to a **disposable test database** before running `npm test`. The test creates boards, checks persistence, conflict rejection, role handling and idempotency. It does not delete those test boards.

## Deploy to AWS Lightsail

Read **[`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)**. You will need a paid or free-tier eligible Lightsail instance (billing varies), a domain name, Docker + Compose, and an editable `deployment/.env` file.

The provided production stack runs five services: frontend, backend, PostgreSQL, one-time migration, and Caddy. Only Caddy exposes ports 80/443. PostgreSQL is **not** exposed to the public internet.

```bash
cp deployment/.env.example deployment/.env
# Edit DOMAIN and POSTGRES_PASSWORD to real values.
./deployment/deploy.sh
```

Configure a GitHub Actions production environment to enable the **manual** deploy workflow; it is not active until you explicitly add SSH secrets. See guide.

## Project map

| Location | Purpose |
|---|---|
| `src/store/useStore.ts` | Socket.IO integration, optimistic state, operation queue, undo/redo |
| `src/canvas/` | Rendering, pointer handling, live cursors |
| `src/components/` | UI tools, sharing, export, controls |
| `whiteboard-backend/server.js` | REST API, origin checks, room auth, Socket.IO events |
| `whiteboard-backend/lib/db.js` | PostgreSQL persistence, transactions and version conflicts |
| `whiteboard-backend/lib/validation.js` | Payload validation and size caps |
| `whiteboard-backend/db/schema.sql` | Initial idempotent DB schema |
| `whiteboard-backend/tests/` | Unit and optional PostgreSQL integration tests |
| `deployment/` | Docker Compose, Caddy, backup and deploy helpers |
| `.github/workflows/` | CI checks and manual production deployment |
| `scripts/load-test.mjs` | Controlled socket operation benchmark |

## Performance experiment (do not invent numbers)

Create a **separate throwaway board**. Use the editor or owner link's ID/token, then from the project root:

```bash
BOARD_ID=your-board-id BOARD_TOKEN=your-token URL=https://your-domain CLIENTS=10 OPERATIONS_PER_CLIENT=5 node scripts/load-test.mjs
```

On PowerShell, use `$env:BOARD_ID='...'` etc. The script creates test objects and reports actual throughput, p50/p95/p99 acknowledgements. It does not establish internet-scale capacity and should be run responsibly.

## Known limitations and roadmap

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for event sequencing, database design and failure modes. See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) for what is deliberately *not* claimed (CRDTs, offline editing, horizontally scaled instances, S3 image storage, login accounts and guaranteed deployment). The initial implementation optimizes for correctness and explainability on a single VPS, not maximum scale.

## Security reminder

Do not upload `.env` files, database dumps, SSH keys or owner invitation URLs to GitHub. Anyone with a board's owner link has owner permissions. Use HTTPS and protected storage for production secrets. To revoke editor/viewer access, rotate the corresponding invite link in **SHARE**.

This edition includes an MIT license file. Confirm the copyright attribution is correct before publishing.
