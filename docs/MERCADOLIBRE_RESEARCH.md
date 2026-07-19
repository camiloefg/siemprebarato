# Mercado Libre Chile internal research

## Purpose and boundary

This service records Mercado Libre Chile best-seller rankings as private product-candidate research. It does not import Mercado Libre listings into the Siempre Barato catalog, estimate sales volumes, publish copied product content, or create catalog products automatically.

The public storefront has no route to these tables. Only authenticated administrators can see the research screens and API responses.

## Official API design

- Site: `MLC` (Mercado Libre Chile).
- Category discovery: `GET /sites/MLC/categories/all`. The complete category tree is flattened and leaf categories are stored locally.
- Ranking capture: `GET /highlights/MLC/category/{category_id}`. The API currently returns up to 20 ranked `ITEM`, `PRODUCT`, or `USER_PRODUCT` records for a leaf category.
- Optional detail enrichment: `GET /items/{id}`, `GET /products/{id}`, or `GET /user-products/{id}`, depending on the ranking record type.
- Authentication: all requests use a bearer access token issued through Mercado Libre OAuth. Tokens and application secrets are environment secrets and are never stored in Git or exposed by the API.

Official references:

- [Best sellers in Mercado Libre](https://developers.mercadolibre.com.ar/en_us/usuarios-y-aplicaciones/best-sellers-in-mercado-libre)
- [Categories and listings](https://developers.mercadolibre.com.ar/en_us/api-docs/categories-and-listings)
- [Authentication and authorization](https://developers.mercadolibre.com.ar/en_us/nodejs/authentication-and-authorization)
- [Domains and products](https://developers.mercadolibre.com.ar/en_us/domains-and-products)
- [Developer terms and conditions](https://developers.mercadolibre.com.ar/en_us/mercado-libre-developer-terms-and-conditions)

## Operational safeguards

External synchronization remains off unless all of the following are true:

1. `MERCADOLIBRE_WORKER_ENABLED=true` is present in the worker environment.
2. `MERCADOLIBRE_ACCESS_TOKEN` is present in the worker environment.
3. An administrator has acknowledged the current Mercado Libre developer terms in the research settings.
4. The research setting itself is enabled.

The default schedule is once daily at 03:00 in `America/Santiago`. All eligible leaf categories can be selected, but a configurable per-run category limit and request delay keep traffic conservative. Categories are processed least-recently-checked first so subsequent runs naturally continue across the tree.

- `404` from the highlights endpoint means that no ranking is available for that category; it is recorded and processing continues.
- `401` stops the run because credentials need attention.
- `429` and transient server/network failures use bounded exponential backoff. A run with remaining failures is marked partial.
- Detail enrichment is best effort. A ranking snapshot remains useful even if its detail endpoint is unavailable.
- The worker stores the furnished rank and source payload. It does not derive sales counts or marketplace-wide statistics.
- Every selected category has a durable run checkpoint. After a process interruption, completed/no-ranking categories remain complete and only unfinished categories are retried in the same run.

## Credential setup (future)

Create a dedicated Mercado Libre application and authorize the intended Mercado Libre account through its OAuth authorization-code flow. Store the resulting secrets in the environment/secret store used by the deployment, never in PostgreSQL or repository files.

The first implementation accepts an access token through `MERCADOLIBRE_ACCESS_TOKEN`. Automated refresh-token rotation will be added when the Mercado Libre application/account exists and a production secret-storage mechanism is selected. Until then, an expired token safely stops synchronization with a visible credential error.

## Data retention

Ranking snapshots default to 365 days of retention. A future maintenance job may delete older snapshots according to the configured retention period; candidate notes are retained independently. Research candidates have no foreign key or automation path into catalog products by design.

## Change log

- 2026-07-19: Documented the official API path, authorization gate, internal-only boundary, scheduling model, and error handling for Milestone 3.
