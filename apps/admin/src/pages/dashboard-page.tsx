import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowUpRight, Boxes, FilePenLine, SearchCheck, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { apiFetch } from "../lib/api";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0 });
  const [research, setResearch] = useState({ snapshots: 0, ready: false });
  useEffect(() => {
    void apiFetch<{ stats: { total: number; published: number; draft: number } }>("/api/admin/catalog/products?pageSize=1")
      .then((response) => setStats(response.stats))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void apiFetch<{ counts: { snapshots: number }; connection: { ready: boolean } }>("/api/admin/research/overview")
      .then((response) => setResearch({ snapshots: response.counts.snapshots, ready: response.connection.ready }))
      .catch(() => undefined);
  }, []);
  const cards = [
    { label: "Productos activos", value: String(stats.total), detail: "Incluye borradores y publicados", icon: Boxes },
    { label: "Publicados", value: String(stats.published), detail: "Visibles en la tienda", icon: ShieldCheck },
    { label: "Borradores", value: String(stats.draft), detail: "Pendientes de publicación", icon: FilePenLine },
    { label: "Investigación", value: String(research.snapshots), detail: research.ready ? "Servicio listo" : "Credenciales pendientes", icon: SearchCheck },
  ];
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Resumen</span><h1>Hola, {user?.displayName?.split(" ")[0] || "Camilo"}</h1><p>La base local está lista para construir y probar cada módulo de Siempre Barato.</p></div>
        <span className="status-pill"><span /> Entorno local</span>
      </section>
      <section className="metric-grid">
        {cards.map(({ label, value, detail, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={21} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
      </section>
      <section className="dashboard-grid">
        <article className="content-card content-card--wide">
          <header><div><span className="eyebrow">Estado de la plataforma</span><h2>Tercer hito</h2></div><Activity size={20} /></header>
          <div className="milestone-list">
            <div className="milestone-item milestone-item--done"><ShieldCheck size={18} /><div><strong>Autenticación y sesiones</strong><span>Google-only, lista autorizada, CSRF y auditoría.</span></div><span>Listo</span></div>
            <div className="milestone-item milestone-item--done"><Boxes size={18} /><div><strong>Catálogo y precios</strong><span>Variantes, bodegas, reservas y tramos mayoristas.</span></div><span>Listo</span></div>
            <div className="milestone-item milestone-item--done"><SearchCheck size={18} /><div><strong>Investigación Mercado Libre</strong><span>Worker, configuración, snapshots y candidatos internos.</span></div><span>Listo</span></div>
          </div>
        </article>
        <article className="content-card next-card"><span className="eyebrow eyebrow--yellow">Investigación</span><h2>Explorar rankings</h2><p>Revisa la configuración, las ejecuciones y los candidatos de surtido en un espacio estrictamente interno.</p><button className="text-link" type="button" onClick={() => navigate("/research")}>Abrir investigación <ArrowUpRight size={16} /></button></article>
      </section>
    </div>
  );
}
