# Local Development

## One-command workflow

`./init-dev.sh` performs the complete first-time workflow:

1. Checks required local commands.
2. Creates `.env` from `.env.example` when needed.
3. Installs all npm workspaces.
4. Creates the local PostgreSQL role and database when absent.
5. Applies ordered migrations.
6. Loads idempotent development seeds.
7. Starts the selected local components.

## Components

`script/run_local.sh` accepts `--api`, `--admin`, `--storefront`, `--worker`, or `--all`. Foreground mode is the default and stops child processes on Ctrl+C. Background mode writes PID and bounded log files under `.run/`.

Examples:

```bash
bash script/run_local.sh --all --foreground
bash script/run_local.sh --api --background
bash script/stop_local.sh
```

## Database commands

```bash
npm run db:migrate
npm run db:seed
npm run db:verify
bash database/scripts/backup_database.sh
```

Development database creation and seeding refuse non-local database hosts.

## Google OAuth

When the OAuth client is created in the dedicated Siempre Barato Google Cloud project, add its values to local `.env` and register:

```text
http://127.0.0.1:3020/api/auth/google/callback
```

Production will use:

```text
https://admin.siemprebarato.cl/api/auth/google/callback
```

## Mercado Libre research

The local worker starts safely with external requests disabled. Its admin screen is available at `/research`, but no Mercado Libre call can occur with the example defaults.

When a dedicated Mercado Libre application and account exist, add the access token to the local `.env`, set `MERCADOLIBRE_WORKER_ENABLED=true`, then acknowledge the developer terms and enable research through the admin console. Do not commit the token. See `MERCADOLIBRE_RESEARCH.md` for the exact gate and official API references.

## Change log

- 2026-07-19: Documented the disabled-by-default Mercado Libre worker and credential/terms activation flow.
- 2026-07-18: Added the unified install, start, stop, database, testing, and OAuth callback workflow.
