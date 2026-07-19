# Siempre Barato Development Rules

## Scope

These rules apply to the complete repository: admin, storefront, API, workers, database, and deployment scripts.

## Mandatory workflow

1. Make and validate changes locally first.
2. Never deploy unless the user explicitly requests production deployment.
3. Use repository scripts for local startup, database migrations, backups, and deployment.
4. Production schema changes require a successful database backup first. Stop when backup fails.
5. Keep migrations backward-compatible, ordered, idempotent where practical, and safe for existing data.
6. Never put secrets, OAuth tokens, payment credentials, production data, or database dumps in Git.
7. Preserve isolation from OVM, Tablee, and Oliva y Miel: unique ports, services, databases, roles, directories, and virtual hosts.
8. Run the existing-app health checks before and after any future production deployment.

## Architecture boundaries

- Browsers communicate only with the API; browsers never connect directly to PostgreSQL.
- Mercado Libre research data remains internal and separate from Siempre Barato catalog data.
- Mercado Libre records must never be automatically converted into public catalog products.
- Admin authentication is Google-only in production and requires an explicitly invited active user.
- Development auth bypass must remain disabled outside local development.
- Sensitive authorization decisions are enforced by the API, never only by frontend controls.

## Naming and files

- React pages and reusable components use kebab-case filenames.
- Express route modules live in `services/api/src/routes/`.
- Shared API security code lives in `services/api/src/security/`.
- Database migrations use ordered names such as `001_core.sql`.
- Development seeds live in `database/seeds/development/` and must be safe to rerun.
- Documentation updates include a dated entry in the document change log.

## User experience

- Use the Siempre Barato navy, yellow, and white palette consistently.
- Storefront product grids are intentionally dense: 5–6 columns on wide desktop, 4 on laptop, 3 on tablet, and 2 on mobile.
- Wholesale quantity tiers must remain visible and understandable before checkout.
- Use app modals for confirmations; do not use native browser alert/confirm/prompt dialogs.
- All controls must be keyboard accessible and retain visible focus states.
- User-facing dates use `dd/mm/yyyy`.

## Definition of done

- The affected workspace builds.
- Relevant automated tests pass.
- Database migrations and seeds are verified when schema changes.
- Local launcher behavior remains functional for individual components and the complete stack.
- Documentation and environment examples reflect operational changes.

## Change log

- 2026-07-18: Created repository-wide workflow, isolation, security, data-boundary, UX, and validation rules.
