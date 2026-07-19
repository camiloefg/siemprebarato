# Siempre Barato Architecture

## Runtime topology

```text
www.siemprebarato.cl   -> Apache -> storefront static assets -> /api/public/*
admin.siemprebarato.cl -> Apache -> admin static assets      -> /api/*
                                                       both -> localhost API
Mercado Libre API -> isolated worker -> PostgreSQL
API                                -> PostgreSQL
```

The two browser applications never receive database credentials and never connect directly to PostgreSQL.

## Application components

### Administration

The administration app supports Google-only authentication. Google proves identity; the API allowlist decides authorization. A verified Google account still cannot enter unless its normalized email exists in `admin_users` and is active.

### Storefront

The storefront is public. Its catalog grid is denser than Tablee and supports unit/weight products, variants, inventory locations, reservations, and quantity-based wholesale prices.

### API

The API owns all validation, authorization, session management, catalog reads, and future commerce operations. Admin mutations use an HttpOnly session cookie plus double-submit CSRF protection.

### Mercado Libre worker

The worker is a separate process so research failures cannot affect administration or checkout. It consumes only the official Mercado Libre API, claims one leased run at a time, rotates least-recently-checked leaf categories, and records partial results safely. Mercado Libre snapshots remain in dedicated research tables and are never promoted or copied automatically into the public catalog.

## Data domains

- Identity and access: admin users, sessions, audit events.
- Catalog: categories, products, variants, image galleries, price tiers, warehouses, inventory, reservations, immutable stock movements, and product history.
- Research: Mercado Libre configuration, categories, runs, rankings, and timestamped product snapshots.
- Commerce: customers, carts, orders, payments, packages, documents, labels, and conversations (later milestones).

## Local ports

| Component | Port |
|---|---:|
| API | 3020 |
| Admin | 5178 |
| Storefront | 5179 |

All values can be overridden through environment variables.

## Change log

- 2026-07-19: Documented the leased Mercado Libre worker, official-API boundary, category rotation, and isolated research data flow.
- 2026-07-18: Added the catalog administration, image, stock-movement, and product-history boundaries delivered in Milestone 2.
- 2026-07-18: Documented the initial application topology, data domains, authentication boundary, research isolation, and local ports.
