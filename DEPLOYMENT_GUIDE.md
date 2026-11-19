# Publish Product Brainstorm on AWS — beginner's guide

You already have **source code**. A website also needs a **computer that stays on**, a **public address** and an **HTTPS certificate**. AWS Lightsail rents you a Linux computer. DNS connects your domain name to it. Docker starts the app. Caddy serves HTTPS and WebSockets.

## Before you touch AWS

1. Download/extract this ZIP on your Windows PC. Install Node.js 22+, Git, Docker Desktop. Enable Docker Desktop.
2. Open this folder in VS Code. Follow the local commands in `README.md` **first**. Verify two browser windows sync, refresh preserves work, viewers cannot edit, and two separate boards cannot exchange objects.
3. Run frontend checks and backend tests. Fix any real runtime issues before public launch. This ZIP has NOT been deployed or end-to-end tested in a cloud account.
4. Push the **source** to your own GitHub repository. Do **not** commit `.env`, SSH keys, database dumps, or the secret board links.

## AWS Lightsail: one server

1. Sign in at https://lightsail.aws.amazon.com/ . Add billing limits/alerts, because the server can cost money even when unused.
2. Create an **Ubuntu LTS** Linux instance. Pick an appropriate nearby region and a plan with about **2 GB RAM or more** for a small frontend/backend/PostgreSQL stack. Choose a name like `product-brainstorm`.
3. Under **Networking**, create and attach a **static IPv4 address**. Copy the number, e.g. `203.0.113.10` (just an example, not your real address).
4. In the instance firewall, enable **TCP 80** (HTTP) and **TCP 443** (HTTPS) for the public. Restrict **TCP 22** (SSH) to your own public IP if possible. Optionally enable UDP 443 for HTTP/3. **Do not expose 3000 or 5432**.
5. Purchase or use a domain you control. At its DNS manager, create an **A record** named `brainstorm` pointing to the static IP. Your website address will be `brainstorm.yourdomain.com`. DNS changes can take time to propagate.
6. Open Lightsail's **Connect using SSH** browser terminal. You are now typing commands on the rented Ubuntu machine, not on your laptop.

## Install Docker on the Ubuntu server

Use Docker's official Ubuntu instructions, including Docker Engine and the Compose plugin:

https://docs.docker.com/engine/install/ubuntu/

After installation, verify:

```bash
docker --version
docker compose version
```

If Docker needs `sudo`, prefix the docker commands with `sudo` (or configure membership in the Docker group; this grants root-equivalent power, so grant it only to trusted admins).

## Copy the application to the server

Replace `YOUR_GITHUB_USERNAME` with your GitHub username and `YOUR_REPO` with your repository name.

```bash
sudo mkdir -p /opt/product-brainstorm
sudo chown "$USER":"$USER" /opt/product-brainstorm
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO.git /opt/product-brainstorm
cd /opt/product-brainstorm
cp deployment/.env.example deployment/.env
nano deployment/.env
```

Inside `nano`, edit exactly two settings:

```text
DOMAIN=brainstorm.yourdomain.com
POSTGRES_PASSWORD=YOUR_LONG_RANDOM_ALPHANUMERIC_PASSWORD
```

**Do not literally keep the example password.** Generate one with this command:

```bash
openssl rand -hex 24
```

Use the generated password (48 hex characters) in the config. To save in nano, press **Ctrl+O**, **Enter**, then **Ctrl+X**.

Protect the file:

```bash
chmod 600 deployment/.env
```

## Launch the website

From `/opt/product-brainstorm`:

```bash
./deployment/deploy.sh
```

The first run downloads container images, compiles the frontend, installs backend dependencies, creates PostgreSQL tables and starts the HTTPS proxy. It requires working internet access and correct DNS.

If something fails, inspect:

```bash
docker compose --env-file deployment/.env -f deployment/compose.prod.yml ps
docker compose --env-file deployment/.env -f deployment/compose.prod.yml logs --tail=120 backend
docker compose --env-file deployment/.env -f deployment/compose.prod.yml logs --tail=120 caddy
```

Try `https://brainstorm.yourdomain.com/api/ready` in your browser. It should display `{"status":"ready"}` when the backend/database are healthy.

Then open **https://brainstorm.yourdomain.com/**. It should create your first board. **SAVE THE OWNER URL SOMEWHERE PRIVATE.** Click SHARE to generate an editor link and open it on your phone using mobile internet. Draw on one screen; confirm the other screen updates.

### How WebSockets work here

The browser talks to the same HTTPS domain as the UI. Caddy routes `/api/` and `/socket.io/` to the backend. The Socket.IO WebSocket connection stays open while the user is connected. PostgreSQL saves the actual board objects. If the server restarts, the browser reconnects and receives a fresh snapshot.

## What to verify BEFORE sending your URL to recruiters

- Open board A in two independent browsers. Draw, move, resize, rotate, edit a note, delete an object. Refresh both. Data should persist.
- Open a new board B. Verify objects and cursors from A do not appear in B.
- Share a **view-only** link. Verify the other person can see but not edit.
- Rotate the editor link. Confirm the old editor link can no longer connect. Confirm a newly generated link works.
- Disconnect one device's internet, reconnect it, then check it eventually matches the server's board state.
- Restart the backend and confirm board objects survive:

```bash
docker compose --env-file deployment/.env -f deployment/compose.prod.yml restart backend
```

- Run `npm run build`, CI, tests, and a controlled load test; record real numbers instead of claiming invented ones.

## Back up your database (VERY IMPORTANT)

```bash
./deployment/backup.sh
```

This generates a compressed PostgreSQL SQL dump inside `backups/`. **A backup sitting on the same server is not disaster recovery.** Copy it to another machine or configure the optional `BACKUP_S3_URI` (requires AWS CLI and permission to upload to your S3 bucket). Schedule backups and test restoration on a spare database before important use.

### Test restoring a backup (only to a separate testing database!)

A SQL dump can contain all boards. Do NOT overwrite the live database while practicing. Create a separate PostgreSQL instance/database and run:

```bash
gunzip -c brainstorm-YYYYMMDDTHHMMSSZ.sql.gz | psql -h YOUR_TEST_DATABASE_HOST -U brainstorm -d brainstorm_restore
```

Follow your database provider's restore instructions for credentials and database creation. Record the test result.

## Deploy later changes

```bash
cd /opt/product-brainstorm
git pull --ff-only origin main
./deployment/deploy.sh
```

Optional GitHub Actions: set **Production** environment secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_KNOWN_HOSTS` and run the `Deploy to Lightsail (manual)` workflow. Use a dedicated deploy SSH identity and verify known-host fingerprints independently. The `deploy.sh` script is idempotent for the initial schema but not a universal zero-downtime deployment system. Keep backward-compatible migrations and database backups before deploying incompatible upgrades.

## Common mistakes

| Problem | Check |
|---|---|
| Website will not open | Instance running? Domain A record correct? Firewall 80/443 open? Caddy logs? |
| HTTPS certificate fails | DNS points to wrong IP, stale AAAA record, port 80 blocked, domain not public |
| UI opens but cannot create board | Backend/DB/migration status; `/api/ready` |
| Socket constantly reconnects | Reverse proxy routes `/socket.io/`, allowed origin matches exactly, TLS certificates |
| Board disappears after restart | PostgreSQL persistent Docker volume and DB status |
| Sharing does nothing | Did you use a full copied invite link with `#token=`? Was it revoked? |
| Server becomes slow | Memory, PostgreSQL connections, browser canvas size, log errors; measure before adding Redis |

## Don't overbuild

Once this system is running reliably, spend energy on tests, recovery, usability and measured performance. You do **not** need Kafka, microservices or Kubernetes simply to have a credible engineering project.
