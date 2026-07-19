# Siempre Barato implementation plan

Last updated: 2026-07-19

This is the canonical delivery plan for Siempre Barato. Update the status tables and decisions in this file whenever a milestone is completed or the product scope changes.

## 1. Product objective

Build a secure ecommerce platform with two public entry points:

- `www.siemprebarato.cl`: public catalog, wholesale pricing, cart, checkout, customer orders, and post-sale experience.
- `admin.siemprebarato.cl`: private administration console for catalog, inventory, customers, orders, fulfillment, research, communications, integrations, users, and configuration.

The technical boundary is always:

```text
PostgreSQL <-> API <-> admin/storefront frontends
```

Browsers never connect directly to PostgreSQL. Mercado Libre research is stored separately from the commercial catalog and never becomes a Siempre Barato product automatically.

## 2. Confirmed decisions

| Area | Decision |
| --- | --- |
| Admin identity | Google Sign-In only, with an explicit invited-user allowlist and no passwords |
| Initial administrator | `camiloefg@gmail.com`, role `super_admin` |
| Google configuration | Dedicated Google Cloud project and OAuth web client |
| Storefront identity | Public browsing; Google-only restriction applies only to the admin console |
| Database | PostgreSQL, accessed only through the API |
| Mercado Libre purpose | Private market research and product-candidate discovery only |
| Mercado Libre coverage | Aim for all eligible Mercado Libre Chile leaf categories, subject to the official API's supported data and limits |
| Research frequency | Once daily by default, configurable from the admin console |
| Research visibility | Internal only; no automatic catalog import, publication, or product linkage |
| Catalog density | Compact grid: approximately 5–6 columns on wide desktop, 4 on laptop, 3 on tablet, and 2 on mobile |
| Wholesale pricing | Tablee-style quantity tiers, with the effective price recalculated from cart quantity |
| Catalog model | Variants, SKUs, barcodes, multiple warehouses, reservations, volume prices, and weight-based products |
| Payments | Webpay and Mercado Pago, disabled until credentials exist and configurable from admin |
| Tax documents | Uploaded by administrators and made available to the corresponding customer/order |
| Delivery area | Santiago only for the initial release |
| Labels | Same functional behavior as Tablee |
| Chat | Similar operational behavior to OVM Business App |
| Brand | White, supplied navy blue, and supplied yellow; use the provided vector master |
| Marketing integrations | Configurable later; credentials are not available yet |
| DNS | Google Cloud DNS; records are not currently pointed |
| Testing | Local computer only; no staging environment on the shared VM |
| Production hosting | Same VM as OVM Business App, Oliva y Miel, and Tablee, with strict application isolation |
| Backups | Stored on the VM, including a verified pre-deployment database backup |

## 3. Current status

| Milestone | Status | Result |
| --- | --- | --- |
| Foundation and local workflow | Complete | npm workspace monorepo, isolated ports, install/start/stop/test scripts, environment template, documentation, and supplied raster/vector brand assets |
| PostgreSQL foundation | Complete | Five ordered migrations, 19 verified tables, local seed data, migration checksum protection, and custom-format backup/checksum scripts |
| Admin authentication foundation | Core complete; live OAuth credentials pending | Google OAuth flow, invited-user allowlist, secure opaque sessions, CSRF protection, roles, session revocation, local guarded login, and audit events |
| Admin shell | Complete | Login, dashboard, user administration, and audit-log screens |
| Storefront prototype | Complete | Responsive compact catalog, seeded variants, weight products, cart quantities, and wholesale price tiers |
| Mercado Libre research | Core complete; credentials pending | Official API worker, isolated schema, scheduling, resilient runs, admin configuration, rankings, and candidate notes are complete locally; live requests remain disabled until an application/token exists |
| Catalog/inventory administration | Core complete | End-to-end product workflow delivered; parity extensions are tracked in `CATALOG_PARITY.md` |
| Current local qualification | Complete for delivered scope | Nine API/security tests, six worker tests, all workspace type checks/builds, authenticated API smoke checks, 19-table verification, and a checksummed database backup pass locally |
| Source repository | Published | Initial platform baseline committed and pushed to `origin/main` at `d5f7529` |
| Customers, checkout, orders, payments | Not started | Planned in milestones 4–5 |
| Fulfillment, labels, documents, chat | Not started | Planned in milestones 6–7 |
| Production deployment | Not started | Requires completed local release checks and explicit deployment approval |

### Delivered system checkpoint

The repository currently provides these working local surfaces:

- Administration frontend: Google-only production login flow, guarded development login, dashboard, catalog list/editor, user allowlist management, audit history, and private Mercado Libre research console.
- Storefront frontend: responsive dense catalog, category presentation, variant selection, weight/unit quantity behavior, stock availability, cart quantities, and visible wholesale price tiers.
- API: health, authentication/session, admin users, audit, public catalog, transactional catalog/inventory administration, and private research endpoints with role and CSRF enforcement.
- PostgreSQL: identity/session/audit, catalog, variants, images, price tiers, warehouses, reservations, stock movements, product history, and isolated Mercado Libre settings/categories/runs/checkpoints/snapshots/candidates.
- Research worker: official-API-only Chile category/ranking workflow, disabled-by-default activation gate, daily scheduling, all-leaf rotation, throttling, bounded retries, partial failures, leases, resumable category checkpoints, retention, and heartbeat state.
- Local operations: one-command bootstrap, component-specific or full-stack launchers, stop scripts, migrations, idempotent development seeds, schema verification, automated tests/builds, and PostgreSQL backup/checksum generation.

Current verification evidence:

- `bash script/test_local.sh` passes all workspace checks and production builds.
- Nine API/security tests and six Mercado Libre parsing/retry tests pass.
- All five migrations match their recorded checksums and all 19 required tables verify.
- Local HTTP smoke checks confirm research authentication (`401` without a session), invalid-filter rejection (`400`), credential gating (`409`), settings persistence, and zero research fields in the public catalog response.
- The final local custom-format database backup and SHA-256 checksum were verified, including all six research tables.
- No production VM, DNS, proxy, certificate, payment account, Google Cloud project, or live external integration has been changed.

### Explicitly pending

- Dedicated Google Cloud project, consent screen, and OAuth credentials for live admin login.
- Mercado Libre application/account authorization, access token, and live-response validation.
- Customer identity and guest-checkout decision, Santiago delivery configuration, and the remaining commerce milestones.
- Webpay/Mercado Pago accounts, Tablee label references, private customer documents, OVM-style chat, and remaining administration parity decisions.
- Full release qualification and any production deployment work.

## 4. Delivery roadmap

### Milestone 1 — Foundation and secure access

Status: core implementation complete locally. Live Google sign-in remains gated by the dedicated Google Cloud OAuth client.

Delivered:

- npm workspace monorepo containing the API, admin frontend, storefront, shared types, worker, database, and operational scripts.
- Local ports chosen to avoid the existing INTI, OVM, Tablee, and Oliva y Miel development services.
- Secure Google OAuth authorization-code flow and local-only guarded authentication bypass.
- Invited admin users with `super_admin`, `admin`, and `viewer` roles.
- Server-side sessions stored as peppered token hashes, secure cookie policy, CSRF defenses, OAuth state/nonce validation, and audit logging.
- PostgreSQL catalog foundation and a public read-only catalog endpoint.
- Local test, build, migration, seed, verification, and backup workflows.

Exit evidence:

- Workspace type checks, four security tests, and both frontend production builds pass.
- Ten required database tables are verified.
- Local authentication, session, users, audit, logout, health, and catalog flows pass.
- A PostgreSQL custom-format backup and SHA-256 checksum were generated and verified.

### Milestone 2 — Catalog and inventory administration

Status: core workflow complete. Deferred source-app parity extensions are explicitly tracked in `CATALOG_PARITY.md` and are not silently excluded.

Scope:

- Product create, edit, archive, duplicate, preview, and publish workflows.
- Categories, brands, descriptions, images, SEO fields, tax settings, and storefront visibility.
- Variant matrices and per-variant SKU, barcode, weight, unit-of-measure, and stock settings.
- Warehouses, stock movements, reservations, available-to-sell quantities, and adjustment reasons.
- Retail and wholesale price tiers with validation against duplicate, increasing, or invalid tiers. Effective dating is deferred until scheduled pricing is required.
- Weight-based sale increments and minimum quantities.
- Admin search, filtering, pagination, bulk actions, and change history. XLSX import/export remains a planned parity extension pending a safe template and dry-run design.
- A functional parity matrix against the relevant Tablee catalog/inventory tools.

Delivered:

- Versioned migration `003_catalog_administration.sql` adds sale increments, publication/archive metadata, SEO, image galleries, product history, and immutable inventory movements.
- Secured admin APIs cover metadata, category creation, product list/detail/create/update/duplicate, and bulk draft/publish/archive changes.
- Product writes are transactional and validate variants, SKU/barcode uniqueness, image references, warehouse rows, reserved stock, and decreasing wholesale tiers.
- The admin console now includes a catalog dashboard, search/status/category filters, pagination, bulk actions, safe duplication, and a complete product editor.
- The editor manages identity, descriptions, category, images, variants, barcodes, attributes, prices, weight, wholesale tiers, warehouse stock, reorder points, adjustment reasons, SEO, and publication.
- The storefront now understands variant selection, variant inventory/pricing, product minimums/increments, weight steps, wholesale price changes, and out-of-stock states.
- Local development seeds include a two-variant product with independent stock and variant-specific wholesale pricing.
- The OVM/Tablee catalog capability audit is recorded in `CATALOG_PARITY.md`.

Exit evidence:

- Draft products are absent from the public API; publishing exposes them; archiving or returning to draft removes them.
- A complete temporary product with an image, variant, stock, and two wholesale tiers was created, published, updated, and archived through the secured API.
- A stale version update returned HTTP 409 and did not overwrite the newer product.
- Initial stock and a later adjustment generated separate immutable inventory movements.
- Safe duplication created unique product/variant SKUs, removed copied barcodes, preserved tiers, started with zero stock, and remained a private draft.
- Nine automated API/security rules, all workspace type checks, both frontend production builds, the API/worker builds, and all 13 required database tables pass locally.

Acceptance criteria:

- An administrator can create a product with variants, inventory, images, and wholesale tiers entirely through the admin console.
- Draft products remain private; only published products appear through the public API.
- Inventory cannot become inconsistent through concurrent reservations or adjustments.
- All mutating operations require authorization and CSRF protection and create audit events.
- Catalog API and storefront tests cover retail, wholesale, weight, unavailable, and unpublished products.

### Milestone 3 — Private Mercado Libre Chile research

Status: core implementation complete locally. Live synchronization is intentionally gated by credentials and an administrator’s terms acknowledgement.

Discovery conclusions (complete):

- The official `MLC` category dump plus leaf-category highlights endpoints provide the supported category and top-20 ranking signals; bearer OAuth credentials are required.
- Mercado Libre does not publish one universal numeric quota for this workflow, so request pacing, retries, category limits, and retention remain conservative and configurable.
- Scraping, inferred sales volumes, and unsupported workarounds are excluded; the service stores only official ranking observations and optional official detail responses.

Delivered:

- Official API discovery confirmed `MLC`, the complete category dump, leaf-only highlights, top-20 `ITEM`/`PRODUCT`/`USER_PRODUCT` rankings, bearer-token OAuth, and the no-scraping boundary. Details are recorded in `MERCADOLIBRE_RESEARCH.md`.
- Additive migrations `004_mercadolibre_research.sql` and `005_mercadolibre_run_checkpoints.sql` create isolated settings, category, run, per-category checkpoint, snapshot, and candidate-note tables with timestamps and constraints.
- The worker supports a daily Santiago schedule, all-leaf or selected scope, least-recently-checked rotation, one active run, leases plus per-category checkpoints for interrupted-run recovery, conservative pacing, bounded retries, manual runs, and partial outcomes.
- Category `404` responses are recorded as no ranking; authentication failures stop safely; optional detail failures do not discard rankings.
- Snapshot retention is configurable, raw official payloads remain traceable, and exact ranks are stored without deriving sales-volume estimates.
- Authenticated admin APIs expose readiness, settings, categories, rankings, run queue/history, and internal candidate evaluations. Mutations are role/CSRF protected and audited.
- The admin console includes connection gates, schedule controls, run history, empty states, ranking filters, and candidate status/notes/tags.
- Secrets remain environment-only. The worker is off by default and cannot call Mercado Libre until its environment flag, access token, database setting, and terms acknowledgement are all present.

Acceptance criteria:

- The default schedule is once daily and can be changed safely from admin.
- Re-running an interrupted date/category range is idempotent.
- Every stored observation and every ingestion run has a timestamp and traceable source identity.
- A failed category does not invalidate successful category snapshots.
- Public API tests prove that Mercado Libre research data cannot leak to the storefront.

Exit evidence:

- The worker parser tests cover category-tree flattening, supported top-20 ranking records, normalized optional detail fields, and fixed endpoint selection.
- Nine API/security tests, six worker parsing/retry tests, all TypeScript checks, production builds, and 19 required PostgreSQL tables pass locally.
- The disabled worker reports credential/readiness state without initiating external requests.
- Live-response validation remains pending because the Mercado Libre application/account and access token do not yet exist.

### Milestone 4 — Customers, storefront, cart, and checkout foundation

Status: planned.

Scope:

- Final storefront navigation, search, category pages, filters, sorting, product detail pages, and responsive compact grid.
- Persistent cart with variant, weight, stock, minimum-quantity, and wholesale-tier validation.
- Customer accounts, addresses, contact information, consent records, and password/account-recovery security model to be approved before implementation.
- Guest checkout decision and workflow, if approved.
- Santiago-only delivery validation using configurable communes/zones, fees, minimums, and service rules.
- Shipping, billing, and order-summary screens with server-authoritative totals.
- Accessibility, keyboard behavior, loading/error/empty states, and mobile validation.

Acceptance criteria:

- Prices, discounts, taxes, delivery, and totals are recalculated by the API and cannot be trusted from the browser.
- Wholesale prices change correctly at each configured quantity tier.
- Weight products follow their configured increments and minimums.
- Checkout rejects unavailable inventory and addresses outside the configured Santiago service area.
- The two-column mobile grid remains legible and usable on supported screen sizes.

### Milestone 5 — Orders and configurable payments

Status: planned.

Scope:

- Order lifecycle, line snapshots, totals, status transitions, internal notes, customer history, cancellations, and refunds.
- Stock reservation and release rules tied to checkout/payment state.
- Admin order table and detail workflow modeled on the relevant Tablee behavior.
- Payment-provider abstraction with independently configurable Webpay and Mercado Pago adapters.
- Disabled/test/live modes, credential validation, callback/webhook verification, idempotency, reconciliation state, and provider event logs.
- No real charge capability until provider accounts, test credentials, production credentials, and an explicit enablement decision exist.

Acceptance criteria:

- Duplicate callbacks cannot duplicate an order, payment, refund, or stock movement.
- Order lines preserve the purchased product description, SKU, quantity, and price even if the catalog changes later.
- Provider secrets never reach either frontend or logs.
- Admin clearly distinguishes pending, authorized, paid, failed, cancelled, and refunded states.
- Test-provider flows pass locally before any production credential is introduced.

### Milestone 6 — Fulfillment and labels

Status: planned.

Scope:

- Pick/pack/dispatch queues, fulfillment statuses, delivery details, and operational notes.
- Label templates and print workflow matching Tablee’s required formats and behavior.
- Single and batch label generation, preview, print status, and reprint reason/history.
- Barcode support where applicable and safe PDF/print dimensions.
- Santiago delivery assignment fields and configurable operational statuses.

Acceptance criteria:

- Label output is visually compared with Tablee reference examples at actual print size.
- Batch printing cannot silently omit or duplicate selected orders.
- Reprints are auditable.
- Order and inventory states remain consistent through fulfillment transitions.

### Milestone 7 — Customer documents and chat

Status: planned.

Scope:

- Administrator upload of invoices, receipts, credit notes, or other approved tax documents to the correct customer/order.
- Private document storage with authenticated, authorized downloads; no guessable public file URLs.
- File type, content, size, and malware-scanning controls appropriate to the deployment environment.
- Customer-visible document history.
- OVM-style chat workflow: conversations, assignment, unread status, order/customer context, internal notes, attachments if approved, and auditability.
- Notifications and retention policy to be decided before production.

Acceptance criteria:

- A customer can access only their own documents and conversations.
- Admin access follows roles and is audited.
- Upload failures cannot leave orphan database records or publicly exposed files.
- Chat messages maintain ordering, sender identity, timestamps, and delivery/read state as required.

### Milestone 8 — Administration parity and configurable integrations

Status: planned.

Scope:

- Complete a screen-by-screen capability audit of OVM Business App and Tablee and agree which tools belong in Siempre Barato.
- Dashboard metrics, reports, exports, configuration, operational alerts, and any remaining approved parity modules.
- Configurable marketing/integration registry with disabled-by-default providers, secret separation, connection tests, audit logging, and retry visibility.
- Administration of delivery rules, checkout settings, payment configuration, research schedule, labels, notifications, and storefront content.

Acceptance criteria:

- The parity matrix identifies each source feature as adopted, adapted, deferred, or excluded, with a reason.
- Sensitive settings are never returned in full after storage.
- Configuration changes are validated, role-restricted, and auditable.
- Disabled integrations cannot initiate outbound calls.

### Milestone 9 — Local release qualification

Status: planned; required before production deployment.

Scope:

- Automated unit, integration, API authorization, database, and frontend tests.
- Local production builds and production-like local runtime checks.
- Migration forward/rollback strategy and restoration rehearsal from a backup copy.
- Security review of authentication, authorization, CSRF, sessions, uploads, webhooks, secrets, headers, dependencies, rate limits, logs, and error responses.
- End-to-end acceptance checklist covering admin, catalog, wholesale prices, inventory, checkout, payments in test mode, orders, labels, documents, and chat.
- Performance checks for catalog queries, admin tables, daily research ingestion, and backup duration.

Release gate:

- All required checks pass locally.
- No testing deployment is performed on the shared VM.
- Known limitations and rollback steps are documented.
- Production deployment requires explicit approval after reviewing the final preflight report.

### Milestone 10 — Isolated production deployment

Status: planned; no production changes have been made.

Principles:

- Reuse the proven OVM/Tablee deployment style only after inspecting the VM’s current live configuration.
- Give Siempre Barato dedicated directories, environment files, process/service names, ports, logs, database, database role, and backup location.
- Never overwrite, restart, rename, or reuse an existing application’s resources.
- Validate proxy configuration before a graceful reload; do not replace shared configuration wholesale.
- Use versioned releases and a reversible activation step.

Preflight:

- Inventory the VM’s live services, listeners, proxy routes, certificates, disk space, memory, PostgreSQL instances/databases, backup jobs, and deployment directories using read-only commands.
- Record the ports and names reserved for OVM Business App, Oliva y Miel, Tablee, and any other services.
- Confirm the final API routing model behind `www.siemprebarato.cl` and `admin.siemprebarato.cl`.
- Create the dedicated Siempre Barato Google Cloud project and OAuth client. Planned callbacks include the local callback and the final HTTPS admin callback.
- Prepare Google Cloud DNS records only after the application and TLS path are healthy.

Deployment sequence:

1. Run the complete local release qualification.
2. Inspect and record current VM health without changing it.
3. Create isolated directories, service identity/configuration, database, and database role.
4. Take and checksum the required VM database backup before migrations; apply a documented retention policy.
5. Upload a versioned release and install production dependencies without touching other releases.
6. Apply versioned Siempre Barato migrations only to its dedicated database.
7. Start the API and web applications on their reserved internal ports.
8. Run localhost health and database checks.
9. Add narrowly scoped reverse-proxy routes and validate the full configuration before graceful reload.
10. Verify HTTPS, secure cookies, OAuth, public catalog, admin authorization, and isolation from all existing applications.
11. Point Google Cloud DNS only after final health approval.
12. Monitor logs and health; roll back the release/proxy activation if any gate fails.

Production acceptance criteria:

- Existing OVM Business App, Oliva y Miel, and Tablee health checks remain unchanged before and after deployment.
- Siempre Barato uses its own database credentials, ports, processes, files, logs, and backups.
- TLS, secure cookies, Google OAuth redirects, and both domains work correctly.
- A documented rollback is tested for the application release and proxy configuration.
- A database restore procedure has been rehearsed safely without overwriting production data.

## 5. Cross-cutting requirements

These apply to every milestone:

- Default-deny authorization and least-privilege roles.
- Validate input at the API boundary; calculate commercial totals on the server.
- Parameterized SQL and explicit transactions for multi-record operations.
- No secrets in Git, frontend bundles, database migrations, logs, or error responses.
- Audit security-sensitive and commercially important mutations.
- Preserve immutable timestamps for research snapshots, orders, payments, documents, messages, and audit events.
- Responsive, keyboard-usable interfaces with clear loading, empty, success, validation, and failure states.
- Add migrations rather than editing migrations already applied.
- Keep Mercado Libre research tables, APIs, permissions, and UI separate from the commercial catalog.
- Run `bash script/test_local.sh` before marking any milestone complete.
- Do not access or modify the shared VM until the production milestone has explicit approval.

## 6. Dependencies and decisions still needed

These items do not block catalog administration work but must be resolved before their corresponding milestones finish:

- Dedicated Google Cloud project, OAuth consent configuration, and OAuth client credentials.
- Final customer authentication model, including whether guest checkout is allowed.
- Exact Santiago communes/zones, fees, delivery promises, minimum order, and free-delivery thresholds.
- Webpay and Mercado Pago test/production accounts and operational refund rules.
- Tax-document types, maximum file sizes, retention, and storage location on the VM.
- Reference label sizes, printers, PDFs, and examples from Tablee.
- Detailed OVM chat parity requirements, notifications, attachment policy, and retention.
- Approved Tablee/OVM parity matrix for the remaining admin tools.
- Mercado Libre application/account authorization and access token. The official ranking signal and safe retention model are documented; no universal numeric highlights quota is published, so pacing remains conservative and configurable.
- Production VM inventory, reserved ports/service names, reverse-proxy technology, certificate approach, and backup retention.
- Final marketing providers and credentials.

## 7. How to continue

At the beginning of each work session:

1. Read this plan plus `ARCHITECTURE.md`, `SECURITY.md`, and `LOCAL_DEVELOPMENT.md`.
2. Confirm the next incomplete milestone and its acceptance criteria.
3. Check the repository status and preserve unrelated work.
4. Run the current local test suite before changing shared foundations.
5. Implement one coherent slice, including database, API, frontend, authorization, tests, and documentation where applicable.
6. Update this document’s status and decisions before handing the work back.

The immediate next slice is Milestone 4: define the customer identity/guest-checkout decision and the initial Santiago delivery rules, then implement the customer, cart, and checkout foundation locally.

## 8. Document change log

- 2026-07-19: Reconciled the plan with the published `d5f7529` baseline, added a delivered-system checkpoint, updated cumulative local validation evidence, and separated completed foundations from credential/product decisions that remain pending.
- 2026-07-19: Completed the local Milestone 3 core, documented the official Mercado Libre API/terms boundary, recorded the credential gate, and advanced the next slice to Milestone 4.
- 2026-07-18: Marked the Milestone 2 core catalog workflow complete, recorded its validation evidence, linked the source-app parity matrix, and advanced the immediate next slice to Mercado Libre discovery.
