# Security Model

## Administration identity

- Google OpenID Connect is the only production login method.
- Google accounts are never auto-provisioned.
- Email must be verified by Google and present in the active admin allowlist.
- The first super administrator is bootstrapped as `camiloefg@gmail.com`.
- Google subject identifiers are pinned after first successful login.

## Sessions

- Session tokens are random, stored only as peppered hashes, and delivered through HttpOnly cookies.
- CSRF tokens use a separate cookie and required request header for mutations.
- Access removal revokes the user session family.
- Sensitive user-management actions are recorded in `audit_events`.

## Secrets

- `.env` and all environment variants except examples are ignored.
- Production secrets must use protected server-local files.
- OAuth, payment, SMTP, and Mercado Libre secrets must never be returned by API read endpoints.

## Research boundary

- Mercado Libre data is internal-only research.
- The public API cannot read research tables.
- Research entries cannot be converted automatically into public products.
- Only official bearer-authenticated endpoints are used; scraping is prohibited.
- Worker requests require an environment enable flag, an environment-only access token, an enabled database setting, and a recorded terms acknowledgement.
- Research settings and manual runs are restricted to `super_admin`/`admin`; candidate evaluations also allow `catalog_manager`. Every mutation requires CSRF protection and creates an audit event.
- One queued/running database constraint plus a worker lease prevents concurrent or abandoned jobs from duplicating a run.

## Catalog mutations

- Catalog reads require an active admin session; writes additionally require `super_admin`, `admin`, or `catalog_manager` and a valid CSRF token.
- Product, variant, price, image, inventory, history, and audit changes commit in one PostgreSQL transaction.
- Product versions prevent a stale editor session from silently overwriting a newer save.
- Reserved inventory blocks incompatible stock reduction or row/variant removal.
- Public catalog queries require an explicitly published, non-archived product and never read admin history or inventory-movement details.
- Product duplication creates a private draft, generates unique SKUs, removes barcodes, and starts copied inventory at zero.

## Development bypass

The local bypass exists only to test the administration UI before OAuth credentials are available. The API requires development mode, an explicit flag, a loopback request, and a local database host. Production startup rejects unsafe authentication secrets and cannot enable the bypass.

## Change log

- 2026-07-19: Added Mercado Libre credential, authorization, concurrency, role, CSRF, and audit safeguards.
- 2026-07-18: Added transactional catalog authorization, optimistic concurrency, reserved-stock protection, publication boundaries, and safe duplication controls.
- 2026-07-18: Defined Google allowlist authentication, session/CSRF protection, secret handling, research isolation, and development bypass controls.
