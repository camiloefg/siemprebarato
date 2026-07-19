import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { apiFetch } from "../lib/api";

type AuditEvent = { id: number; action: string; entityType: string; entityId: string | null; details: Record<string, unknown>; actorEmail: string | null; actorName: string | null; createdAt: string };
const dateFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<{ events: AuditEvent[] }>("/api/admin/audit").then((response) => setEvents(response.events)).catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la auditoría.")).finally(() => setLoading(false)); }, []);
  return <div className="page-stack"><section className="page-heading"><div><span className="eyebrow">Trazabilidad</span><h1>Registro de auditoría</h1><p>Historial de accesos y cambios sensibles de administración.</p></div></section><section className="content-card audit-card">{error && <div className="form-alert">{error}</div>}{loading ? <div className="table-empty">Cargando actividad…</div> : events.length === 0 ? <div className="empty-state"><ClipboardCheck size={28} /><h2>Sin actividad todavía</h2><p>Los eventos aparecerán cuando se realicen acciones administrativas.</p></div> : <div className="audit-list">{events.map((event) => <article key={event.id}><span className="audit-dot" /><div><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.actorName || event.actorEmail || "Sistema"} · {event.entityType}</small></div><time>{dateFormatter.format(new Date(event.createdAt))}</time></article>)}</div>}</section></div>;
}
