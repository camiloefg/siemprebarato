import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Boxes, Check, ChevronDown, CircleDollarSign, Clock3, History,
  ImagePlus, Layers3, PackagePlus, Plus, RefreshCw, Save, Search, Star, Trash2, Warehouse,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { apiFetch } from "../lib/api";
import {
  attributesToText, emptyCatalogProduct, slugify, textToAttributes,
  type CatalogCategory, type CatalogImageDraft, type CatalogInventoryDraft,
  type CatalogProductDraft, type CatalogStatus, type CatalogTierDraft,
  type CatalogVariantDraft, type Warehouse as WarehouseType,
} from "../catalog/catalog-types";

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const statusLabels: Record<CatalogStatus, string> = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

function freshProduct(): CatalogProductDraft {
  return { ...emptyCatalogProduct, images: [], variants: [], priceTiers: [], inventory: [] };
}

function normalizeInventory(product: CatalogProductDraft, warehouses: WarehouseType[]): CatalogInventoryDraft[] {
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
  const scopes = product.variants.length ? product.variants.map((variant) => variant.id) : [null];
  return activeWarehouses.flatMap((warehouse) => scopes.map((variantId) => {
    const current = product.inventory.find((row) => row.warehouseId === warehouse.id && row.variantId === variantId);
    return current || {
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      variantId,
      onHand: 0,
      reorderPoint: 0,
      reason: "",
    };
  }));
}

export function ProductEditorPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !productId;
  const canEdit = ["super_admin", "admin", "catalog_manager"].includes(user?.role || "");
  const [product, setProduct] = useState<CatalogProductDraft>(freshProduct());
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [showCategory, setShowCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", slug: "", description: "" });
  const [categoryBusy, setCategoryBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const metadata = await apiFetch<{ categories: CatalogCategory[]; warehouses: WarehouseType[] }>("/api/admin/catalog/metadata");
      setCategories(metadata.categories);
      setWarehouses(metadata.warehouses);
      if (productId) {
        const response = await apiFetch<{ product: CatalogProductDraft }>(`/api/admin/catalog/products/${productId}`);
        setProduct({ ...response.product, inventory: normalizeInventory(response.product, metadata.warehouses) });
      } else {
        const next = freshProduct();
        setProduct({ ...next, inventory: normalizeInventory(next, metadata.warehouses) });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el producto.");
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const variantsById = useMemo(() => new Map(product.variants.map((variant) => [variant.id, variant])), [product.variants]);

  function setField<K extends keyof CatalogProductDraft>(field: K, value: CatalogProductDraft[K]) {
    setProduct((current) => ({ ...current, [field]: value }));
  }

  function changeName(value: string) {
    setProduct((current) => ({ ...current, name: value, slug: slugTouched ? current.slug : slugify(value) }));
  }

  function addVariant() {
    setProduct((current) => {
      const variant: CatalogVariantDraft = {
        id: crypto.randomUUID(), sku: current.sku ? `${current.sku}-V${current.variants.length + 1}` : `VAR-${current.variants.length + 1}`,
        barcode: null, name: `Variante ${current.variants.length + 1}`, attributes: {}, priceOverride: null,
        weightGrams: null, isActive: true,
      };
      const next = { ...current, variants: [...current.variants, variant] };
      return { ...next, inventory: normalizeInventory(next, warehouses) };
    });
  }

  function updateVariant(id: string, changes: Partial<CatalogVariantDraft>) {
    setProduct((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === id ? { ...variant, ...changes } : variant) }));
  }

  function removeVariant(id: string) {
    setProduct((current) => {
      const next = {
        ...current,
        variants: current.variants.filter((variant) => variant.id !== id),
        priceTiers: current.priceTiers.filter((tier) => tier.variantId !== id),
        images: current.images.map((image) => image.variantId === id ? { ...image, variantId: null } : image),
        inventory: current.inventory.filter((row) => row.variantId !== id),
      };
      return { ...next, inventory: normalizeInventory(next, warehouses) };
    });
  }

  function addImage() {
    const image: CatalogImageDraft = { imageUrl: "", altText: product.name, variantId: null, isPrimary: product.images.length === 0 };
    setField("images", [...product.images, image]);
  }

  function updateImage(index: number, changes: Partial<CatalogImageDraft>) {
    setProduct((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) => imageIndex === index ? { ...image, ...changes } : changes.isPrimary ? { ...image, isPrimary: false } : image),
    }));
  }

  function addTier() {
    setField("priceTiers", [...product.priceTiers, { variantId: null, minimumQuantity: 2, unitPrice: product.basePrice }]);
  }

  function updateTier(index: number, changes: Partial<CatalogTierDraft>) {
    setProduct((current) => ({ ...current, priceTiers: current.priceTiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...changes } : tier) }));
  }

  function updateInventory(index: number, changes: Partial<CatalogInventoryDraft>) {
    setProduct((current) => ({ ...current, inventory: current.inventory.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row) }));
  }

  async function save(status: CatalogStatus) {
    if (!canEdit) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = {
        ...product,
        status,
        sku: product.sku.trim().toUpperCase(),
        brand: product.brand?.trim() || null,
        compareAtPrice: product.compareAtPrice || null,
        variants: product.variants.map((variant) => ({ ...variant, sku: variant.sku.trim().toUpperCase(), barcode: variant.barcode?.trim() || null })),
        images: product.images.map(({ imageUrl, altText, variantId, isPrimary }) => ({ imageUrl, altText, variantId, isPrimary })),
        priceTiers: product.priceTiers.map(({ variantId, minimumQuantity, unitPrice }) => ({ variantId, minimumQuantity, unitPrice })),
        inventory: product.inventory.map(({ warehouseId, variantId, onHand, reorderPoint, reason }) => ({ warehouseId, variantId, onHand, reorderPoint, reason })),
      };
      const response = await apiFetch<{ product: CatalogProductDraft }>(product.id ? `/api/admin/catalog/products/${product.id}` : "/api/admin/catalog/products", {
        method: product.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setProduct({ ...response.product, inventory: normalizeInventory(response.product, warehouses) });
      setNotice(status === "published" ? "Producto publicado y visible en la tienda." : status === "archived" ? "Producto archivado." : "Borrador guardado.");
      if (!product.id && response.product.id) navigate(`/catalog/${response.product.id}`, { replace: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto.");
    } finally { setSaving(false); }
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setCategoryBusy(true); setError("");
    try {
      const response = await apiFetch<{ category: CatalogCategory }>("/api/admin/catalog/categories", {
        method: "POST",
        body: JSON.stringify({ ...categoryDraft, parentId: null, isActive: true }),
      });
      setCategories((current) => [...current, response.category].sort((left, right) => left.name.localeCompare(right.name, "es")));
      setField("categoryId", response.category.id);
      setCategoryDraft({ name: "", slug: "", description: "" });
      setShowCategory(false);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "No se pudo crear la categoría.");
    } finally { setCategoryBusy(false); }
  }

  if (loading) return <div className="editor-loading"><RefreshCw className="spin" /> Cargando editor…</div>;

  return <div className="product-editor page-stack">
    <section className="editor-heading">
      <div className="editor-title"><Link className="icon-button" to="/catalog" aria-label="Volver al catálogo"><ArrowLeft size={18} /></Link><div><span className="eyebrow">{isNew ? "Nuevo producto" : product.sku}</span><h1>{product.name || "Producto sin nombre"}</h1><div className={`catalog-status catalog-status--${product.status}`}>{statusLabels[product.status]}</div></div></div>
      {canEdit && <div className="editor-actions"><button className="button button--secondary" disabled={saving} onClick={() => void save("draft")}><Save size={17} /> Guardar borrador</button><button className="button button--primary" disabled={saving} onClick={() => void save("published")}><Check size={17} /> Publicar</button><label className="status-action" aria-label="Más estados"><ChevronDown size={17} /><select value={product.status} disabled={saving} onChange={(event) => void save(event.target.value as CatalogStatus)}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label></div>}
    </section>
    {error && <p className="form-alert">{error}</p>}
    {notice && <p className="form-notice"><Check size={17} /> {notice}</p>}

    <fieldset className="editor-fieldset" disabled={!canEdit || saving}>
      <div className="editor-grid">
        <div className="editor-main-column">
          <EditorSection icon={Boxes} title="Información general" description="Identidad comercial y contenido visible en la tienda.">
            <div className="form-grid form-grid--two"><FormField label="Nombre del producto" wide><input value={product.name} onChange={(event) => changeName(event.target.value)} required maxLength={200} /></FormField><FormField label="SKU"><input value={product.sku} onChange={(event) => setField("sku", event.target.value.toUpperCase())} required maxLength={100} /></FormField><FormField label="Slug de URL"><input value={product.slug} onChange={(event) => { setSlugTouched(true); setField("slug", slugify(event.target.value)); }} required /></FormField><FormField label="Categoría"><div className="inline-control"><select value={product.categoryId || ""} onChange={(event) => setField("categoryId", event.target.value || null)}><option value="">Sin categoría</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="icon-button" onClick={() => setShowCategory(true)} aria-label="Crear categoría"><Plus size={17} /></button></div></FormField><FormField label="Marca"><input value={product.brand || ""} onChange={(event) => setField("brand", event.target.value)} /></FormField><FormField label="Descripción breve" wide><textarea rows={2} value={product.shortDescription} onChange={(event) => setField("shortDescription", event.target.value)} maxLength={500} /></FormField><FormField label="Descripción completa" wide><textarea rows={6} value={product.description} onChange={(event) => setField("description", event.target.value)} /></FormField></div>
          </EditorSection>

          <EditorSection icon={ImagePlus} title="Imágenes" description="Galería por URL. La imagen principal representa el producto en el catálogo." action={<button type="button" className="button button--secondary button--small" onClick={addImage}><Plus size={16} /> Agregar imagen</button>}>
            {product.images.length === 0 ? <EmptyEditorState icon={ImagePlus} text="Agrega al menos una imagen antes de la publicación final." /> : <div className="image-editor-list">{product.images.map((image, index) => <article className="image-editor-row" key={`${index}-${image.imageUrl}`}><div className="image-preview">{image.imageUrl ? <img src={image.imageUrl} alt="" /> : <ImagePlus size={23} />}</div><div className="image-fields"><input type="url" value={image.imageUrl} onChange={(event) => updateImage(index, { imageUrl: event.target.value })} placeholder="https://…/producto.jpg" /><input value={image.altText} onChange={(event) => updateImage(index, { altText: event.target.value })} placeholder="Texto alternativo" /><select value={image.variantId || ""} onChange={(event) => updateImage(index, { variantId: event.target.value || null })}><option value="">Todo el producto</option>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></div><label className="primary-check"><input type="radio" name="primary-image" checked={image.isPrimary} onChange={() => updateImage(index, { isPrimary: true })} /> Principal</label><button type="button" className="icon-button danger-icon" onClick={() => setField("images", product.images.filter((_, imageIndex) => imageIndex !== index))} aria-label="Eliminar imagen"><Trash2 size={17} /></button></article>)}</div>}
          </EditorSection>

          <EditorSection icon={Layers3} title="Variantes" description="Cada variante mantiene su propio SKU, código de barras, precio opcional e inventario." action={<button type="button" className="button button--secondary button--small" onClick={addVariant}><Plus size={16} /> Agregar variante</button>}>
            {product.variants.length === 0 ? <EmptyEditorState icon={Layers3} text="Sin variantes: el stock se controla directamente a nivel de producto." /> : <div className="variant-list">{product.variants.map((variant) => <article className="variant-card" key={variant.id}><header><strong>{variant.name || "Variante"}</strong><label className="switch-label"><input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(variant.id, { isActive: event.target.checked })} /> Activa</label><button type="button" className="icon-button danger-icon" onClick={() => removeVariant(variant.id)} aria-label={`Eliminar ${variant.name}`}><Trash2 size={16} /></button></header><div className="form-grid form-grid--three"><FormField label="Nombre"><input value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} /></FormField><FormField label="SKU"><input value={variant.sku} onChange={(event) => updateVariant(variant.id, { sku: event.target.value.toUpperCase() })} /></FormField><FormField label="Código de barras"><input value={variant.barcode || ""} onChange={(event) => updateVariant(variant.id, { barcode: event.target.value || null })} /></FormField><FormField label="Atributos" wide><input value={attributesToText(variant.attributes)} onChange={(event) => updateVariant(variant.id, { attributes: textToAttributes(event.target.value) })} placeholder="Color: Azul, Tamaño: Grande" /></FormField><FormField label="Precio especial"><input type="number" min="0" step="1" value={variant.priceOverride ?? ""} onChange={(event) => updateVariant(variant.id, { priceOverride: event.target.value === "" ? null : Number(event.target.value) })} placeholder={money.format(product.basePrice)} /></FormField><FormField label="Peso en gramos"><input type="number" min="1" step="1" value={variant.weightGrams ?? ""} onChange={(event) => updateVariant(variant.id, { weightGrams: event.target.value === "" ? null : Number(event.target.value) })} /></FormField></div></article>)}</div>}
          </EditorSection>

          <EditorSection icon={CircleDollarSign} title="Precios mayoristas" description="El precio efectivo baja automáticamente al alcanzar cada cantidad." action={<button type="button" className="button button--secondary button--small" onClick={addTier}><Plus size={16} /> Agregar tramo</button>}>
            {product.priceTiers.length === 0 ? <EmptyEditorState icon={CircleDollarSign} text="Aún no hay precios por volumen configurados." /> : <div className="tier-editor-list"><div className="tier-editor-head"><span>Alcance</span><span>Desde cantidad</span><span>Precio unitario</span><span /></div>{product.priceTiers.map((tier, index) => <div className="tier-editor-row" key={tier.id || index}><select value={tier.variantId || ""} onChange={(event) => updateTier(index, { variantId: event.target.value || null })}><option value="">Todo el producto</option>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select><input type="number" min="1.001" step={product.unitType === "weight" ? ".001" : "1"} value={tier.minimumQuantity} onChange={(event) => updateTier(index, { minimumQuantity: Number(event.target.value) })} /><input type="number" min="0" step="1" value={tier.unitPrice} onChange={(event) => updateTier(index, { unitPrice: Number(event.target.value) })} /><button type="button" className="icon-button danger-icon" onClick={() => setField("priceTiers", product.priceTiers.filter((_, tierIndex) => tierIndex !== index))} aria-label="Eliminar tramo"><Trash2 size={16} /></button></div>)}</div>}
          </EditorSection>

          <EditorSection icon={Warehouse} title="Inventario" description="Stock físico por bodega y variante. Las reservas son protegidas por el API.">
            <div className="inventory-table"><div className="inventory-head"><span>Bodega</span><span>Variante</span><span>En mano</span><span>Reservado</span><span>Reposición</span><span>Motivo del ajuste</span></div>{product.inventory.map((row, index) => <div className="inventory-row" key={`${row.warehouseId}:${row.variantId || "product"}`}><strong>{row.warehouseCode || warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.code}</strong><span>{row.variantId ? variantsById.get(row.variantId)?.name || "Variante" : "Producto"}</span><input type="number" min={row.reserved || 0} step={product.unitType === "weight" ? ".001" : "1"} value={row.onHand} onChange={(event) => updateInventory(index, { onHand: Number(event.target.value) })} /><span>{(row.reserved || 0).toLocaleString("es-CL")}</span><input type="number" min="0" step={product.unitType === "weight" ? ".001" : "1"} value={row.reorderPoint} onChange={(event) => updateInventory(index, { reorderPoint: Number(event.target.value) })} /><input value={row.reason} onChange={(event) => updateInventory(index, { reason: event.target.value })} placeholder="Ej. conteo físico" /></div>)}</div>
          </EditorSection>
        </div>

        <aside className="editor-side-column">
          <section className="editor-card publish-card"><div className="card-title"><PackagePlus size={18} /><strong>Venta y publicación</strong></div><FormField label="Estado"><select value={product.status} onChange={(event) => setField("status", event.target.value as CatalogStatus)}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></FormField><div className="form-grid form-grid--two"><FormField label="Precio base"><input type="number" min="0" step="1" value={product.basePrice} onChange={(event) => setField("basePrice", Number(event.target.value))} /></FormField><FormField label="Precio comparación"><input type="number" min="0" step="1" value={product.compareAtPrice ?? ""} onChange={(event) => setField("compareAtPrice", event.target.value === "" ? null : Number(event.target.value))} /></FormField><FormField label="Tipo de venta"><select value={product.unitType} onChange={(event) => { const unitType = event.target.value as "unit" | "weight"; setProduct((current) => ({ ...current, unitType, minimumQuantity: unitType === "weight" ? .5 : 1, quantityIncrement: unitType === "weight" ? .5 : 1 })); }}><option value="unit">Por unidad</option><option value="weight">Por peso</option></select></FormField><FormField label="Unidad"><input value={product.saleUnit} onChange={(event) => setField("saleUnit", event.target.value)} /></FormField><FormField label="Cantidad mínima"><input type="number" min=".001" step={product.unitType === "weight" ? ".001" : "1"} value={product.minimumQuantity} onChange={(event) => setField("minimumQuantity", Number(event.target.value))} /></FormField><FormField label="Incremento"><input type="number" min=".001" step={product.unitType === "weight" ? ".001" : "1"} value={product.quantityIncrement} onChange={(event) => setField("quantityIncrement", Number(event.target.value))} /></FormField></div><label className="check-row"><input type="checkbox" checked={product.taxIncluded} onChange={(event) => setField("taxIncluded", event.target.checked)} /><span><strong>IVA incluido</strong><small>El precio mostrado ya contiene impuestos.</small></span></label><label className="check-row"><input type="checkbox" checked={product.isFeatured} onChange={(event) => setField("isFeatured", event.target.checked)} /><span><strong>Producto destacado</strong><small>Aparece primero en el catálogo.</small></span></label></section>

          <section className="editor-card"><div className="card-title"><Search size={18} /><strong>SEO</strong></div><FormField label="Título SEO"><input value={product.seoTitle} onChange={(event) => setField("seoTitle", event.target.value)} maxLength={180} placeholder={product.name || "Título para buscadores"} /></FormField><FormField label="Descripción SEO"><textarea rows={4} value={product.seoDescription} onChange={(event) => setField("seoDescription", event.target.value)} maxLength={320} /></FormField><small className="field-note">Si queda vacío se usará el nombre y la descripción breve.</small></section>

          {!isNew && <section className="editor-card history-card"><div className="card-title"><History size={18} /><strong>Historial reciente</strong></div>{product.events?.length ? <div className="product-history">{product.events.slice(0, 8).map((event) => <div key={event.id}><span /><p><strong>{event.action.replace("catalog_product.", "")}</strong><small>{event.actorName} · {dateTime.format(new Date(event.createdAt))}</small></p></div>)}</div> : <p className="field-note">El historial aparecerá después del primer guardado.</p>}{product.inventoryMovements?.length ? <div className="movement-summary"><Clock3 size={15} /><span>{product.inventoryMovements.length} movimientos de inventario registrados</span></div> : null}</section>}
        </aside>
      </div>
    </fieldset>

    {showCategory && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowCategory(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="category-title"><PackagePlus className="modal-category-icon" /><h2 id="category-title">Nueva categoría</h2><p>Quedará disponible inmediatamente para este producto y el resto del catálogo.</p><form onSubmit={(event) => void createCategory(event)}><label>Nombre<input value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value, slug: slugify(event.target.value) }))} required /></label><label>Slug<input value={categoryDraft.slug} onChange={(event) => setCategoryDraft((current) => ({ ...current, slug: slugify(event.target.value) }))} required /></label><label>Descripción<textarea rows={3} value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} /></label><div className="modal-actions"><button type="button" className="button button--secondary" onClick={() => setShowCategory(false)}>Cancelar</button><button className="button button--primary" disabled={categoryBusy}>{categoryBusy ? "Creando…" : "Crear categoría"}</button></div></form></section></div>}
  </div>;
}

function EditorSection({ icon: Icon, title, description, action, children }: { icon: typeof Boxes; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="editor-card editor-section"><header><div className="section-icon"><Icon size={19} /></div><div><h2>{title}</h2><p>{description}</p></div>{action && <div className="section-action">{action}</div>}</header>{children}</section>;
}

function FormField({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`form-field${wide ? " form-field--wide" : ""}`}><span>{label}</span>{children}</label>;
}

function EmptyEditorState({ icon: Icon, text }: { icon: typeof Boxes; text: string }) {
  return <div className="editor-empty"><Icon size={22} /><span>{text}</span></div>;
}
