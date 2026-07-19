import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ChevronDown, Menu, Minus, Package, Plus, Search, ShoppingCart, Truck } from "lucide-react";
import type { CatalogProduct, CatalogProductVariant, WholesalePriceTier } from "@siemprebarato/shared";
import "./styles.css";

const fallbackProducts: CatalogProduct[] = [
  { id: "1", slug: "arroz-grado-1-1kg", name: "Arroz grado 1 · 1 kg", brand: "Siempre Barato", category: "Despensa", saleUnit: "unidad", unitType: "unit", basePrice: 1590, compareAtPrice: 1890, imageUrl: null, availableQuantity: 100, minimumQuantity: 1, quantityIncrement: 1, wholesaleTiers: [{ minimumQuantity: 6, unitPrice: 1450 }, { minimumQuantity: 12, unitPrice: 1350 }], variants: [] },
  { id: "2", slug: "aceite-vegetal-1l", name: "Aceite vegetal · 1 L", brand: "Siempre Barato", category: "Despensa", saleUnit: "unidad", unitType: "unit", basePrice: 2290, compareAtPrice: null, imageUrl: null, availableQuantity: 100, minimumQuantity: 1, quantityIncrement: 1, wholesaleTiers: [{ minimumQuantity: 6, unitPrice: 2090 }, { minimumQuantity: 12, unitPrice: 1950 }], variants: [] },
  { id: "3", slug: "detergente-liquido-3l", name: "Detergente líquido · 3 L", brand: "Casa Clara", category: "Limpieza", saleUnit: "unidad", unitType: "unit", basePrice: 3990, compareAtPrice: 4490, imageUrl: null, availableQuantity: 100, minimumQuantity: 1, quantityIncrement: 1, wholesaleTiers: [{ minimumQuantity: 4, unitPrice: 3690 }], variants: [] },
  { id: "4", slug: "bebida-cola-3l", name: "Bebida cola · 3 L", brand: "Refresco", category: "Bebidas", saleUnit: "unidad", unitType: "unit", basePrice: 2490, compareAtPrice: null, imageUrl: null, availableQuantity: 100, minimumQuantity: 1, quantityIncrement: 1, wholesaleTiers: [{ minimumQuantity: 6, unitPrice: 2250 }], variants: [] },
  { id: "5", slug: "azucar-granulada-por-kilo", name: "Azúcar granulada · por kg", brand: "Siempre Barato", category: "Despensa", saleUnit: "kg", unitType: "weight", basePrice: 1290, compareAtPrice: null, imageUrl: null, availableQuantity: 100, minimumQuantity: .5, quantityIncrement: .5, wholesaleTiers: [{ minimumQuantity: 10, unitPrice: 1150 }], variants: [] },
  { id: "6", slug: "papel-higienico-12-rollos", name: "Papel higiénico · 12 rollos", brand: "Casa Clara", category: "Limpieza", saleUnit: "pack", unitType: "unit", basePrice: 4990, compareAtPrice: 5490, imageUrl: null, availableQuantity: 100, minimumQuantity: 1, quantityIncrement: 1, wholesaleTiers: [{ minimumQuantity: 4, unitPrice: 4590 }], variants: [] },
];

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

type CartLine = { productId: string; variantId: string | null; quantity: number };

function pricingFor(product: CatalogProduct, variant: CatalogProductVariant | null): { basePrice: number; tiers: WholesalePriceTier[]; available: number } {
  return {
    basePrice: variant?.price ?? product.basePrice,
    tiers: variant?.wholesaleTiers.length ? variant.wholesaleTiers : product.wholesaleTiers,
    available: variant?.availableQuantity ?? product.availableQuantity,
  };
}

function priceForQuantity(product: CatalogProduct, variant: CatalogProductVariant | null, quantity: number): number {
  const pricing = pricingFor(product, variant);
  return pricing.tiers.reduce((price, tier) => quantity >= tier.minimumQuantity ? tier.unitPrice : price, pricing.basePrice);
}

function Storefront() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [source, setSource] = useState<"api" | "sample">("api");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/public/catalog/products")
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((response: { products: CatalogProduct[] }) => setProducts(response.products))
      .catch(() => { setProducts(fallbackProducts); setSource("sample"); });
  }, []);

  const categories = useMemo(() => ["Todos", ...new Set(products.map((product) => product.category).filter(Boolean) as string[])], [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "Todos" || product.category === category;
    const haystack = `${product.name} ${product.brand || ""} ${product.category || ""}`.toLowerCase();
    return matchesCategory && haystack.includes(search.trim().toLowerCase());
  }), [products, category, search]);
  const cartCount = Object.values(cart).reduce((total, line) => total + line.quantity, 0);
  const cartTotal = Object.values(cart).reduce((total, line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return total;
    const variant = product.variants.find((item) => item.id === line.variantId) || null;
    return total + priceForQuantity(product, variant, line.quantity) * line.quantity;
  }, 0);

  function changeQuantity(product: CatalogProduct, variantId: string | null, delta: number) {
    const variant = product.variants.find((item) => item.id === variantId) || null;
    const available = pricingFor(product, variant).available;
    const key = `${product.id}::${variantId || "product"}`;
    setCart((current) => {
      const currentQuantity = current[key]?.quantity || 0;
      const candidate = currentQuantity === 0 && delta > 0
        ? product.minimumQuantity
        : currentQuantity + delta * product.quantityIncrement;
      const next = Math.min(available, Math.max(0, Number(candidate.toFixed(3))));
      if (next < product.minimumQuantity) { const copy = { ...current }; delete copy[key]; return copy; }
      return { ...current, [key]: { productId: product.id, variantId, quantity: next } };
    });
  }

  return <div className="storefront">
    <div className="announcement"><Truck size={16} /><span>Despacho en Santiago · Precios por volumen para todos</span></div>
    <header className="site-header"><button className="mobile-nav" aria-label="Abrir menú"><Menu /></button><a href="#inicio"><img src="/brand/logo.png" alt="Siempre Barato" /></a><nav><a href="#catalogo">Catálogo</a><a href="#mayorista">Precios mayoristas</a><a href="#despacho">Despacho</a></nav><button className="cart-button" type="button"><ShoppingCart size={19} /><span>Carro</span><strong>{cartCount.toLocaleString("es-CL")}</strong></button></header>
    <main>
      <section className="hero" id="inicio"><div className="hero-copy"><span className="hero-tag">Compra inteligente</span><h1>Más cantidad.<br /><em>Mejor precio.</em></h1><p>Productos esenciales para tu hogar o negocio, con descuentos mayoristas que se aplican automáticamente.</p><a href="#catalogo">Ver catálogo <ArrowRight size={18} /></a></div><div className="hero-graphic" aria-hidden="true"><span className="hero-ticket">sb</span><div className="price-bubble"><small>Desde</small><strong>$1.150</strong><span>por unidad mayorista</span></div></div></section>
      <section className="catalog-section" id="catalogo"><header className="section-heading"><div><span className="section-kicker">Catálogo</span><h2>Lo que necesitas, al precio justo</h2><p>Agrega más unidades para desbloquear automáticamente el mejor precio.</p></div>{source === "sample" && <span className="sample-pill">Vista local</span>}</header>
        <div className="catalog-toolbar"><label className="store-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar productos" /></label><div className="category-pills">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="sort-button">Ordenar <ChevronDown size={16} /></button></div>
        <div className="product-grid">{filtered.length ? filtered.map((product, index) => {
          const variantId = selectedVariants[product.id] || product.variants[0]?.id || null;
          const key = `${product.id}::${variantId || "product"}`;
          return <ProductCard key={product.id} product={product} variantId={variantId} quantity={cart[key]?.quantity || 0} index={index} onSelectVariant={(nextVariantId) => setSelectedVariants((current) => ({ ...current, [product.id]: nextVariantId }))} onChange={changeQuantity} />;
        }) : <div className="catalog-empty"><Package size={28} /><strong>No encontramos productos</strong><span>Prueba otra búsqueda o categoría.</span></div>}</div>
      </section>
      <section className="wholesale-strip" id="mayorista"><div><span>Precios mayoristas transparentes</span><h2>El descuento está a la vista.</h2><p>Cada producto muestra sus tramos. Al alcanzar la cantidad, el carro ajusta el precio unitario sin cupones ni solicitudes.</p></div><div className="tier-example"><span>1–5 unidades <strong>$1.590 c/u</strong></span><span>6–11 unidades <strong>$1.450 c/u</strong></span><span className="best">12+ unidades <strong>$1.350 c/u</strong></span></div></section>
    </main>
    {cartCount > 0 && <aside className="cart-dock"><div><span>{cartCount.toLocaleString("es-CL")} productos</span><strong>{money.format(cartTotal)}</strong></div><button>Ver carro <ArrowRight size={17} /></button></aside>}
  </div>;
}

function ProductCard({ product, variantId, quantity, index, onSelectVariant, onChange }: { product: CatalogProduct; variantId: string | null; quantity: number; index: number; onSelectVariant: (variantId: string) => void; onChange: (product: CatalogProduct, variantId: string | null, delta: number) => void }) {
  const variant = product.variants.find((item) => item.id === variantId) || null;
  const pricing = pricingFor(product, variant);
  const currentPrice = priceForQuantity(product, variant, quantity);
  const nextTier = pricing.tiers.find((tier) => tier.minimumQuantity > quantity);
  const hasDiscount = currentPrice < pricing.basePrice;
  return <article className="product-card">
    <div className={`product-visual product-visual--${index % 4}`}>{product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <><Package size={35} /><span>{product.category}</span></>}{product.compareAtPrice && <span className="discount-badge">Oferta</span>}</div>
    <div className="product-body"><span className="product-brand">{product.brand}</span><h3>{product.name}</h3>{product.variants.length > 0 && <select className="variant-select" aria-label={`Variante de ${product.name}`} value={variantId || ""} onChange={(event) => onSelectVariant(event.target.value)}>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<div className="product-price"><strong>{money.format(currentPrice)}</strong><span>/{product.saleUnit}</span>{product.compareAtPrice && !hasDiscount && <s>{money.format(product.compareAtPrice)}</s>}</div>
      {pricing.tiers.length > 0 && <div className="wholesale-mini"><span>Precio por cantidad</span>{pricing.tiers.slice(0, 2).map((tier) => <small key={tier.minimumQuantity} className={quantity >= tier.minimumQuantity ? "reached" : ""}><b>{tier.minimumQuantity}+</b>{money.format(tier.unitPrice)} c/u</small>)}</div>}
      <div className="product-action">{quantity === 0 ? <button className="add-button" disabled={pricing.available < product.minimumQuantity} onClick={() => onChange(product, variantId, 1)}>{pricing.available < product.minimumQuantity ? "Sin stock" : <>Agregar <Plus size={17} /></>}</button> : <div className="quantity-control"><button aria-label="Quitar" onClick={() => onChange(product, variantId, -1)}><Minus size={16} /></button><strong>{quantity.toLocaleString("es-CL")} {product.unitType === "weight" ? product.saleUnit : ""}</strong><button aria-label="Agregar" disabled={quantity + product.quantityIncrement > pricing.available} onClick={() => onChange(product, variantId, 1)}><Plus size={16} /></button></div>}</div>
      {quantity > 0 && nextTier && <p className="next-tier">Agrega {(nextTier.minimumQuantity - quantity).toLocaleString("es-CL")} más para pagar {money.format(nextTier.unitPrice)} c/u</p>}
    </div>
  </article>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Storefront /></StrictMode>);
