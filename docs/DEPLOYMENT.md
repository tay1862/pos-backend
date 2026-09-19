# Deployment

Recommended first production shape:

```text
Caddy -> backend container -> PostgreSQL
```

Add a worker process from the same image when outbox consumers or print dispatch jobs are implemented.

## Local

```bash
docker compose up -d postgres
# DATABASE_URL points at pos_app; drizzle uses MIGRATION_DATABASE_URL for this step.
bun run db:migrate
bun run dev
```

The application connects with the `pos_app` role, which is not the table owner, so PostgreSQL RLS policies are enforced. Migrations run once with the separate `pos_migrator` owner role. In production, store both URLs as separate secrets and never give the app container the migration URL.

## Release

1. Build the image.
2. Run migrations once as a release step.
3. Start the app containers.
4. Check `/api/v1/ready`.

Do not let every replica run migrations on boot.

## Production compose

Copy `.env.production.example` to `.env.production`, replace every `CHANGE_ME` value,
and set `APP_ORIGIN` to the HTTPS origin that will be used by the frontend. Keep the
file mode at `0600`; it contains database credentials.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
docker compose --env-file .env.production -f compose.production.yaml config
docker compose --env-file .env.production -f compose.production.yaml up -d postgres
docker compose --env-file .env.production -f compose.production.yaml run --rm backend bun run db:migrate
docker compose --env-file .env.production -f compose.production.yaml up -d backend
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
```

The production compose file binds the backend to loopback so a reverse proxy can
terminate TLS. Add Caddy or another TLS proxy before exposing the API to the public
internet. The PostgreSQL data volume must be backed up before upgrades; never remove
the volume as part of a normal deploy.

### Caddy reverse proxy

For the pilot domain, point its `A` record at the VPS before starting Caddy. Caddy
will obtain and renew the HTTPS certificate automatically when ports 80 and 443 are
reachable:

```caddyfile
kanghan.site {
    reverse_proxy 127.0.0.1:3000
}
```

After installing Caddy, save the block as `/etc/caddy/Caddyfile`, validate it, and
restart the service:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy
curl -fsS https://kanghan.site/api/v1/health
curl -fsS https://kanghan.site/api/v1/ready
```

Set `APP_ORIGIN=https://kanghan.site` and
`INVITATION_BASE_URL=https://kanghan.site/invitations` in the production env file
before recreating the backend container. Keep the backend bound to loopback so it
cannot bypass the TLS proxy.

If the frontend is hosted on another origin, add its exact HTTPS origin to the
comma-separated `CORS_ORIGINS` setting and recreate the backend. The API never uses
a wildcard origin with credentialed sessions.

## Operations

Track at minimum:

- request latency and error rate
- database connection usage
- failed authentication attempts
- migration result
- job backlog once jobs exist
- print failure rate once printing exists

Before pilot, test backup and restore. Initial target: RPO under 15 minutes and RTO under 4 hours, with backups stored away from the app host.
