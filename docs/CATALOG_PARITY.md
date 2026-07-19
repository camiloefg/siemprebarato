# Catalog and inventory parity matrix

Last updated: 2026-07-18

This matrix records which catalog and inventory behaviors from the OVM Business App inventory module and Tablee ecommerce administration are adopted by Siempre Barato. It prevents accidental copying of legacy security or data-consistency patterns while preserving useful operator workflows.

## Reference scope reviewed

- OVM Business App inventory: product search, location filters, add/delete, inline quantity/price/cost/margin/category editing, and XLSX import/export.
- Tablee ecommerce: public catalog fields, image galleries and optimization, product options, price ranges, featured products, stock visibility, and product suggestions.

## Capability matrix

| Source capability | Siempre Barato status | Decision |
| --- | --- | --- |
| Product search and category filtering | Adopted | Server-filtered admin table with status and category filters |
| Location/warehouse stock | Adopted and strengthened | Dedicated warehouse rows, available-to-sell calculation, reservations, reorder points, and movement history |
| Product creation and editing | Adopted and strengthened | Transactional API workflow with version-conflict protection and audit history |
| Product deletion | Adapted | Archive replaces destructive deletion so commercial references remain safe |
| Inline quantity editing | Adapted | Stock is edited in the product inventory matrix with an adjustment reason and movement record |
| Retail price editing | Adopted | Server-validated base, comparison, and variant override prices |
| Quantity/wholesale prices | Adopted and strengthened | Product-wide or variant-specific tiers; prices cannot increase at higher quantities |
| Category/subcategory assignment | Partially adopted | Existing categories can be selected and new top-level categories created inline; hierarchy maintenance is deferred |
| Multiple locations | Adopted | Product or variant stock is represented independently in each active warehouse |
| Cost and margin editing | Deferred | Requires a decision on product-level versus warehouse/lot cost and who may see financial fields |
| XLSX import/export | Deferred | Preserve the operator workflow after defining a Siempre Barato template, dry-run report, row validation, and rollback behavior |
| Public/draft product visibility | Adopted and strengthened | Draft and archived products are excluded at the public API boundary |
| Product duplication | Adopted and strengthened | Creates a draft with unique SKUs, no copied barcodes, and zero copied stock |
| Image gallery | Partially adopted | Ordered URL gallery with primary image and alt text is complete; binary upload/optimization is deferred to the storage milestone |
| Product options | Adapted | First-class variants with UUID, SKU, barcode, attributes, weight, price, active state, stock, tiers, and optional image association |
| Featured products | Adopted | Featured products sort first; manual rank can be added with merchandising tools |
| Product suggestions | Deferred | Complements, substitutes, bundles, and frequently-bought relationships belong with merchandising/product-detail work |
| Price ranges with maximum quantities | Adapted | Siempre Barato uses simpler minimum-quantity breakpoints; the next breakpoint closes the previous tier |
| Effective-dated prices | Deferred | Add only when scheduled promotions or future price lists are required |
| Image compression and WebP conversion | Deferred | Requires a controlled upload/storage service; external URLs are never fetched by the API today |
| Debounced direct row writes | Not copied | Explicit transactional saves are used to avoid silent partial updates |
| Browser storage as authoritative configuration | Not copied | Categories, warehouses, and permissions always come from the API/PostgreSQL |

## Milestone 2 delivered boundary

The completed core workflow includes:

- Create, edit, duplicate, draft, publish, archive, search, filter, paginate, and bulk status actions.
- Categories, brand text, descriptions, image gallery URLs, SEO, tax inclusion, featured status, sale units, minimums, and increments.
- Variants, SKUs, barcodes, attributes, weights, variant prices, variant-specific images, and active state.
- Multiple warehouses, stock, reservations, available-to-sell quantities, reorder points, adjustment reasons, and movement history.
- Product and variant wholesale tiers with monotonic-price validation.
- Optimistic version checks, transactions, role authorization, CSRF protection, product history, and global audit events.
- Storefront handling for published products, variants, per-variant availability, minimum quantities, increments, and effective wholesale prices.

Deferred rows remain planned capabilities, not exclusions. They should be implemented in coherent workflows when their business rules and storage requirements are available.

## Change log

- 2026-07-18: Audited the OVM inventory and Tablee ecommerce catalog patterns, recorded adopted/strengthened/deferred decisions, and documented the Milestone 2 delivery boundary.
