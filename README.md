# Siempre Barato

Siempre Barato is a two-surface ecommerce platform:

- `www.siemprebarato.cl`: public catalog and commerce experience.
- `admin.siemprebarato.cl`: Google-only administration console.

The platform uses a strict `PostgreSQL <-> API <-> frontend` architecture and keeps Mercado Libre research data private and separate from the commercial catalog.

## Repository layout

```text
apps/admin                       Administration React/Vite app
apps/storefront                  Public React/Vite app
services/api                     Express/PostgreSQL API
services/mercadolibre-worker     Isolated research worker
packages/shared                  Shared types and constants
database/migrations              Ordered production-safe schema
database/seeds/development       Local-only development data
database/scripts                 Database lifecycle helpers
script                           Unified local workflow
assets/brand                     Original and derived brand sources
```

## Local setup

Prerequisites:

- Node.js 20.19 or later.
- npm 10 or later.
- PostgreSQL with local database creation permissions.

Install, create the local database, migrate, seed, and start everything:

```bash
./init-dev.sh
```

Install without starting:

```bash
bash script/install_development.sh
```

Start all local services:

```bash
bash script/start_development.sh
```

Start selected components:

```bash
bash script/run_local.sh --api
bash script/run_local.sh --admin
bash script/run_local.sh --storefront
bash script/run_local.sh --worker
bash script/run_local.sh --all
```

Default local URLs:

- API: `http://127.0.0.1:3020`
- Admin: `http://127.0.0.1:5178`
- Storefront: `http://127.0.0.1:5179`

The ports intentionally avoid the defaults used by INTI, OVM, Tablee, and Oliva y Miel.

## Local authentication

Production administration is Google-only and allowlist-based. Until the dedicated Google Cloud OAuth client exists, local development can use the guarded development sign-in configured by `ALLOW_DEV_AUTH_BYPASS=true`.

The development route is rejected unless all of these are true:

- `NODE_ENV=development`
- `ALLOW_DEV_AUTH_BYPASS=true`
- the request is local
- the target database host is local

## Validation

Run tests, TypeScript checks, production builds, and database verification:

```bash
bash script/test_local.sh
```

## Documentation

- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Catalog and inventory parity](./docs/CATALOG_PARITY.md)
- [Mercado Libre research](./docs/MERCADOLIBRE_RESEARCH.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Local development](./docs/LOCAL_DEVELOPMENT.md)
- [Security](./docs/SECURITY.md)

## Change log

- 2026-07-19: Added the private Mercado Libre Chile research worker, isolated data model, secure admin APIs, and internal research console.
- 2026-07-18: Delivered the Milestone 2 catalog/inventory administration workflow, storefront variant pricing, and OVM/Tablee parity matrix.
- 2026-07-18: Created the monorepo foundation, local workflow, architecture, and first authentication/catalog milestone documentation.
