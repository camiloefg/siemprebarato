import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Boxes, CheckCircle2, ChevronLeft, ChevronRight, Copy, Edit3, Eye, FilePenLine, PackagePlus, RefreshCw, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { apiFetch } from "../lib/api";
import { ConfirmModal } from "../components/confirm-modal";
import type { AdminCatalogSummary, CatalogCategory, CatalogStatus } from "../catalog/catalog-types";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
const statusLabels: Record<CatalogStatus, string> = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

type CatalogStats = { total: number; published: number; draft: number; archived: number };

export function CatalogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<AdminCatalogSummary[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [stats, setStats] = useState<CatalogStats>({ total: 0, published: 0, draft: 0, archived: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CatalogStatus>("all");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageCount: 1, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<CatalogStatus | null>(null);
  const canEdit = ["super_admin", "admin", "catalog_manager"].includes(user?.role || "");

  const loadMetadata = useCallback(async () => {
    const response = await apiFetch<{ categories: CatalogCategory[] }>("/api/admin/catalog/metadata");
    setCategories(response.categories);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ status, page: String(page), pageSize: "25" });
    if (search.trim()) params.set("q", search.trim());
    if (categoryId) params.set("categoryId", categoryId);
    try {
      const response = await apiFetch<{ products: AdminCatalogSummary[]; stats: CatalogStats; pagination: { page: number; pageCount: number; total: number } }>(`/api/admin/catalog/products?${params}`);
      setProducts(response.products);
      setStats(response.stats);
      setPagination(response.pagination);
      setSelected(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el catálogo.");
    } finally { setLoading(false); }
  }, [search, status, categoryId, page]);

  useEffect(() => { void loadMetadata().catch(() => setError("No se pudieron cargar las categorías.")); }, [loadMetadata]);
  useEffect(() => { const timer = window.setTimeout(() => void loadProducts(), 220); return () => window.clearTimeout(timer); }, [loadProducts]);

  const allSelected = useMemo(() => products.length > 0 && products.every((product) => selected.has(product.id)), [products, selected]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulkStatus() {
    if (!confirmStatus || selected.size === 0) return;
    setBusy(true); setError("");
    try {
      await apiFetch("/api/admin/catalog/products/bulk-status", {
        method: "POST",
        body: JSON.stringify({ productIds: [...selected], status: confirmStatus }),
      });
      await loadProducts();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "No se pudo actualizar la selección.");
    } finally { setBusy(false); setConfirmStatus(null); }
  }

  async function duplicateProduct(id: string) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch<{ product: { id: string } }>(`/api/admin/catalog/products/${id}/duplicate`, { method: "POST" });
      navigate(`/catalog/${response.product.id}`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "No se pudo duplicar el producto.");
    } finally { setBusy(false); }
  }

  return <div className="page-stack">
    <section className="page-heading">
      <div><span className="eyebrow">Catálogo e inventario</span><h1>Productos</h1><p>Publica productos, administra stock y define precios mayoristas por cantidad.</p></div>
      {canEdit && <Link className="button button--primary" to="/catalog/new"><PackagePlus size={18} /> Nuevo producto</Link>}
    </section>

    <section className="catalog-metrics" aria-label="Estado del catálogo">
      <button className={status === "all" ? "active" : ""} onClick={() => { setStatus("all"); setPage(1); }}><Boxes size={18} /><span>Activos</span><strong>{stats.total}</strong></button>
      <button className={status === "published" ? "active" : ""} onClick={() => { setStatus("published"); setPage(1); }}><CheckCircle2 size={18} /><span>Publicados</span><strong>{stats.published}</strong></button>
      <button className={status === "draft" ? "active" : ""} onClick={() => { setStatus("draft"); setPage(1); }}><FilePenLine size={18} /><span>Borradores</span><strong>{stats.draft}</strong></button>
      <button className={status === "archived" ? "active" : ""} onClick={() => { setStatus("archived"); setPage(1); }}><Archive size={18} /><span>Archivados</span><strong>{stats.archived}</strong></button>
    </section>

    <section className="content-card catalog-list-card">
      <div className="catalog-list-toolbar">
        <label className="search-control"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nombre, SKU o marca" /></label>
        <select aria-label="Filtrar por categoría" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <button className="icon-button" type="button" onClick={() => void loadProducts()} disabled={loading} aria-label="Actualizar"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
      </div>
      {selected.size > 0 && canEdit && <div className="bulk-toolbar"><strong>{selected.size} seleccionados</strong><button onClick={() => setConfirmStatus("published")}><Eye size={16} /> Publicar</button><button onClick={() => setConfirmStatus("draft")}><FilePenLine size={16} /> Pasar a borrador</button><button className="danger-link" onClick={() => setConfirmStatus("archived")}><Archive size={16} /> Archivar</button></div>}
      {error && <p className="form-alert">{error}</p>}
      <div className="catalog-table">
        <div className="catalog-table-head"><input type="checkbox" aria-label="Seleccionar todos" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(products.map((product) => product.id)))} /><span>Producto</span><span>Estado</span><span>Precio</span><span>Disponible</span><span>Actualizado</span><span /></div>
        {loading ? <div className="table-empty"><RefreshCw className="spin" /> Cargando productos…</div> : products.length === 0 ? <div className="table-empty">No hay productos para estos filtros.</div> : products.map((product) => <article className="catalog-row" key={product.id}>
          <input type="checkbox" aria-label={`Seleccionar ${product.name}`} checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
          <div className="catalog-product-cell"><div className="catalog-thumbnail">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Boxes size={21} />}</div><div><strong>{product.name}</strong><small>{product.sku} · {product.category || "Sin categoría"}{product.variantCount ? ` · ${product.variantCount} variantes` : ""}</small></div></div>
          <span className={`catalog-status catalog-status--${product.status}`}>{statusLabels[product.status]}</span>
          <strong className="catalog-price">{money.format(product.basePrice)}</strong>
          <span className={product.availableQuantity <= 0 ? "stock-low" : ""}>{product.availableQuantity.toLocaleString("es-CL")}</span>
          <time>{date.format(new Date(product.updatedAt))}</time>
          <div className="catalog-row-actions">{canEdit && <button className="icon-button" type="button" disabled={busy} onClick={() => void duplicateProduct(product.id)} aria-label={`Duplicar ${product.name}`}><Copy size={16} /></button>}<Link className="icon-button" to={`/catalog/${product.id}`} aria-label={`Editar ${product.name}`}><Edit3 size={17} /></Link></div>
        </article>)}
      </div>
      {pagination.pageCount > 1 && <div className="catalog-pagination"><span>{pagination.total} productos · página {pagination.page} de {pagination.pageCount}</span><div><button className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} aria-label="Página anterior"><ChevronLeft size={17} /></button><button className="icon-button" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((current) => current + 1)} aria-label="Página siguiente"><ChevronRight size={17} /></button></div></div>}
    </section>
    <ConfirmModal open={Boolean(confirmStatus)} title={`${statusLabels[confirmStatus || "draft"]} productos`} message={`Se actualizarán ${selected.size} productos. Esta acción quedará registrada en auditoría.`} confirmLabel={statusLabels[confirmStatus || "draft"]} busy={busy} onClose={() => setConfirmStatus(null)} onConfirm={() => void applyBulkStatus()} />
  </div>;
}
