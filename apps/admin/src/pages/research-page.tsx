import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ExternalLink, Play, RefreshCw, Save, Search, SearchCheck, Settings2, X } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { ConfirmModal } from "../components/confirm-modal";
import { apiFetch } from "../lib/api";

type Settings = {
  siteId: "MLC";
  isEnabled: boolean;
  frequencyHours: number;
  scheduleHourLocal: number;
  timezone: string;
  categoryMode: "all_leaf" | "selected";
  selectedCategoryIds: string[];
  maxCategoriesPerRun: number;
  requestDelayMs: number;
  maxRetries: number;
  enrichDetails: boolean;
  retentionDays: number;
  termsAcknowledgedAt: string | null;
  nextRunAt: string | null;
  lastCompletedAt: string | null;
};
type ResearchRun = {
  id: string;
  triggerType: "scheduled" | "manual";
  status: string;
  categoriesRequested: number;
  categoriesProcessed: number;
  categoriesRanked: number;
  categoriesWithoutRanking: number;
  categoriesFailed: number;
  snapshotsCreated: number;
  errorSummary: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
type Overview = {
  settings: Settings;
  counts: { leafCategories: number; enabledLeafCategories: number; snapshots: number; activeCandidates: number };
  runs: ResearchRun[];
  worker: { status: string; details: Record<string, unknown>; lastSeenAt: string } | null;
  connection: { workerEnabled: boolean; accessTokenConfigured: boolean; ready: boolean };
};
type Ranking = {
  id: number;
  categoryId: string;
  categoryName: string;
  capturedAt: string;
  rankPosition: number;
  entityType: "ITEM" | "PRODUCT" | "USER_PRODUCT";
  entityId: string;
  title: string | null;
  permalink: string | null;
  imageUrl: string | null;
  price: string | null;
  currencyId: string | null;
  brand: string | null;
  detailStatus: string;
  candidateStatus: "unreviewed" | "watchlist" | "candidate" | "dismissed";
  notes: string;
  tags: string[];
};
type ResearchCategory = { categoryId: string; name: string };

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const integerFormatter = new Intl.NumberFormat("es-CL");
const moneyFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const statusLabels: Record<string, string> = { queued: "En cola", running: "En curso", completed: "Completada", partial: "Parcial", failed: "Fallida", cancelled: "Cancelada" };
const candidateLabels = { unreviewed: "Sin revisar", watchlist: "En observación", candidate: "Candidato", dismissed: "Descartado" };

function formatDate(value: string | null | undefined): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "—";
}

export function ResearchPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [categories, setCategories] = useState<ResearchCategory[]>([]);
  const [totalRankings, setTotalRankings] = useState(0);
  const [search, setSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRun, setConfirmRun] = useState(false);
  const [editing, setEditing] = useState<Ranking | null>(null);
  const [candidateDraft, setCandidateDraft] = useState({ status: "unreviewed", notes: "", tags: "" });

  const canConfigure = user?.role === "super_admin" || user?.role === "admin";
  const canReview = canConfigure || user?.role === "catalog_manager";

  const loadOverview = useCallback(async () => {
    const response = await apiFetch<Overview>("/api/admin/research/overview");
    setOverview(response);
    setSettings(response.settings);
  }, []);

  const loadRankings = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (candidateFilter) params.set("candidateStatus", candidateFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const response = await apiFetch<{ rankings: Ranking[]; total: number }>(`/api/admin/research/rankings?${params}`);
    setRankings(response.rankings);
    setTotalRankings(response.total);
  }, [candidateFilter, categoryFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    Promise.all([
      loadOverview(),
      apiFetch<{ categories: ResearchCategory[] }>("/api/admin/research/categories").then((response) => setCategories(response.categories)),
    ])
      .catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la investigación."))
      .finally(() => setLoading(false));
  }, [loadOverview]);
  useEffect(() => {
    void loadRankings().catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar los rankings."));
  }, [loadRankings]);

  const readinessItems = useMemo(() => [
    { label: "Worker habilitado en el entorno", ready: overview?.connection.workerEnabled || false },
    { label: "Access token configurado", ready: overview?.connection.accessTokenConfigured || false },
    { label: "Términos confirmados", ready: Boolean(settings?.termsAcknowledgedAt) },
    { label: "Investigación activada", ready: settings?.isEnabled || false },
  ], [overview, settings]);

  async function saveSettings() {
    if (!settings || !canConfigure) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/api/admin/research/settings", {
        method: "PUT",
        body: JSON.stringify({
          isEnabled: settings.isEnabled,
          frequencyHours: settings.frequencyHours,
          scheduleHourLocal: settings.scheduleHourLocal,
          categoryMode: settings.categoryMode,
          selectedCategoryIds: settings.selectedCategoryIds,
          maxCategoriesPerRun: settings.maxCategoriesPerRun,
          requestDelayMs: settings.requestDelayMs,
          maxRetries: settings.maxRetries,
          enrichDetails: settings.enrichDetails,
          retentionDays: settings.retentionDays,
          termsAcknowledged: Boolean(settings.termsAcknowledgedAt),
        }),
      });
      await loadOverview();
      setNotice("Configuración de investigación guardada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function queueRun() {
    setRunning(true);
    setError("");
    try {
      await apiFetch("/api/admin/research/runs", { method: "POST", body: JSON.stringify({}) });
      setConfirmRun(false);
      setNotice("Ejecución agregada a la cola. El worker la tomará en su próximo ciclo.");
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la ejecución.");
    } finally {
      setRunning(false);
    }
  }

  function openCandidate(ranking: Ranking) {
    setEditing(ranking);
    setCandidateDraft({ status: ranking.candidateStatus, notes: ranking.notes, tags: ranking.tags.join(", ") });
  }

  async function saveCandidate() {
    if (!editing || !canReview) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/admin/research/candidates/${editing.entityType}/${encodeURIComponent(editing.entityId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: candidateDraft.status,
          notes: candidateDraft.notes,
          tags: candidateDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setEditing(null);
      setNotice("Evaluación interna guardada.");
      await Promise.all([loadRankings(), loadOverview()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la evaluación.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !overview || !settings) return <div className="editor-loading"><RefreshCw className="spin" size={19} /> Cargando investigación…</div>;

  return (
    <div className="page-stack research-page">
      <section className="page-heading">
        <div><span className="eyebrow">Inteligencia de surtido</span><h1>Investigación Mercado Libre</h1><p>Rankings privados para detectar candidatos. Nunca se convierten automáticamente en productos.</p></div>
        <button className="button button--primary" type="button" disabled={!canConfigure || !overview.connection.ready || overview.runs.some((run) => ["queued", "running"].includes(run.status))} onClick={() => setConfirmRun(true)}><Play size={17} /> Ejecutar ahora</button>
      </section>
      {error && <div className="form-alert">{error}</div>}
      {notice && <div className="form-notice"><CheckCircle2 size={17} /> {notice}</div>}

      <section className="research-metrics">
        <article><SearchCheck size={20} /><span>Categorías hoja</span><strong>{integerFormatter.format(overview.counts.leafCategories)}</strong><small>{overview.counts.leafCategories ? `${integerFormatter.format(overview.counts.enabledLeafCategories)} habilitadas` : "Se descubren en la primera ejecución"}</small></article>
        <article><Activity size={20} /><span>Snapshots</span><strong>{integerFormatter.format(overview.counts.snapshots)}</strong><small>Registros históricos internos</small></article>
        <article><Search size={20} /><span>Candidatos activos</span><strong>{integerFormatter.format(overview.counts.activeCandidates)}</strong><small>En observación o candidatos</small></article>
        <article><Clock3 size={20} /><span>Próxima ejecución</span><strong className="metric-date">{formatDate(settings.nextRunAt)}</strong><small>{settings.timezone}</small></article>
      </section>

      <section className="research-top-grid">
        <article className="content-card research-readiness">
          <header><div><span className="eyebrow">Conexión segura</span><h2>{overview.connection.ready ? "Lista para investigar" : "Configuración pendiente"}</h2></div>{overview.connection.ready ? <CheckCircle2 className="ready-icon" /> : <AlertTriangle className="warning-icon" />}</header>
          <div className="readiness-list">{readinessItems.map((item) => <div key={item.label}><span className={item.ready ? "ready-dot ready-dot--ok" : "ready-dot"} /><span>{item.label}</span><strong>{item.ready ? "Listo" : "Pendiente"}</strong></div>)}</div>
          <p>Las credenciales se leen desde secretos del entorno y nunca se muestran ni guardan en PostgreSQL.</p>
        </article>

        <article className="content-card research-settings">
          <header><div><span className="eyebrow">Programación</span><h2>Descarga configurable</h2></div><Settings2 size={20} /></header>
          <fieldset disabled={!canConfigure || saving}>
            <div className="research-form-grid">
              <label>Frecuencia<select value={settings.frequencyHours} onChange={(event) => setSettings({ ...settings, frequencyHours: Number(event.target.value) })}><option value={24}>Una vez al día</option><option value={12}>Cada 12 horas</option><option value={6}>Cada 6 horas</option><option value={168}>Una vez por semana</option></select></label>
              <label>Hora local<input type="number" min={0} max={23} value={settings.scheduleHourLocal} onChange={(event) => setSettings({ ...settings, scheduleHourLocal: Number(event.target.value) })} /></label>
              <label>Categorías por ejecución<input type="number" min={1} max={5000} value={settings.maxCategoriesPerRun} onChange={(event) => setSettings({ ...settings, maxCategoriesPerRun: Number(event.target.value) })} /></label>
              <label>Espera entre solicitudes (ms)<input type="number" min={100} max={10000} step={50} value={settings.requestDelayMs} onChange={(event) => setSettings({ ...settings, requestDelayMs: Number(event.target.value) })} /></label>
              <label>Reintentos<input type="number" min={0} max={8} value={settings.maxRetries} onChange={(event) => setSettings({ ...settings, maxRetries: Number(event.target.value) })} /></label>
              <label>Retención (días)<input type="number" min={30} max={3650} value={settings.retentionDays} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} /></label>
              {settings.categoryMode === "selected" && <label className="selected-category-field">IDs de categorías seleccionadas<input value={settings.selectedCategoryIds.join(", ")} onChange={(event) => setSettings({ ...settings, selectedCategoryIds: event.target.value.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean) })} placeholder="MLC123, MLC456" /></label>}
            </div>
            <div className="research-switches">
              <label><input type="checkbox" checked={settings.categoryMode === "all_leaf"} onChange={(event) => setSettings({ ...settings, categoryMode: event.target.checked ? "all_leaf" : "selected" })} /><span><strong>Todas las categorías hoja</strong><small>Las recorre por antigüedad hasta cubrirlas todas.</small></span></label>
              <label><input type="checkbox" checked={settings.enrichDetails} onChange={(event) => setSettings({ ...settings, enrichDetails: event.target.checked })} /><span><strong>Enriquecer detalles</strong><small>Consulta nombre, imagen y precio cuando el endpoint lo permite.</small></span></label>
              <label><input type="checkbox" checked={Boolean(settings.termsAcknowledgedAt)} onChange={(event) => setSettings({ ...settings, termsAcknowledgedAt: event.target.checked ? new Date().toISOString() : null, isEnabled: event.target.checked ? settings.isEnabled : false })} /><span><strong>Confirmo el uso conforme a los términos</strong><small>Uso interno, API oficial y sin scraping. <a href="https://developers.mercadolibre.com.ar/en_us/mercado-libre-developer-terms-and-conditions" target="_blank" rel="noreferrer">Leer términos <ExternalLink size={11} /></a></small></span></label>
              <label><input type="checkbox" checked={settings.isEnabled} onChange={(event) => setSettings({ ...settings, isEnabled: event.target.checked })} /><span><strong>Habilitar investigación</strong><small>Solo habrá solicitudes cuando el worker y el token también estén listos.</small></span></label>
            </div>
            <button className="button button--primary settings-save" type="button" onClick={() => void saveSettings()}><Save size={16} /> {saving ? "Guardando…" : "Guardar configuración"}</button>
          </fieldset>
          {!canConfigure && <small className="permission-note">Tu rol permite consultar, pero no modificar esta configuración.</small>}
        </article>
      </section>

      <section className="content-card research-rankings">
        <header className="research-section-header"><div><span className="eyebrow">Historial capturado</span><h2>Rankings y candidatos</h2></div><span>{integerFormatter.format(totalRankings)} registros</span></header>
        <div className="research-toolbar"><div className="search-control"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por producto o ID" /></div><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}</select><select value={candidateFilter} onChange={(event) => setCandidateFilter(event.target.value)} aria-label="Filtrar por evaluación"><option value="">Todos los estados</option>{Object.entries(candidateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="date-filter">Desde<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="date-filter">Hasta<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label></div>
        {rankings.length === 0 ? <div className="empty-state"><SearchCheck size={30} /><h2>Sin rankings todavía</h2><p>Cuando existan credenciales, la primera ejecución descubrirá categorías y guardará sus rankings.</p></div> : <div className="research-table-wrap"><div className="research-table-head"><span>Pos.</span><span>Producto investigado</span><span>Categoría</span><span>Precio observado</span><span>Estado</span><span>Captura</span></div><div>{rankings.map((ranking) => <button className="research-row" type="button" key={ranking.id} onClick={() => canReview && openCandidate(ranking)}><strong className="rank-number">#{ranking.rankPosition}</strong><span className="research-product">{ranking.imageUrl ? <img src={ranking.imageUrl} alt="" /> : <span className="research-image-placeholder">{ranking.entityType.charAt(0)}</span>}<span><strong>{ranking.title || ranking.entityId}</strong><small>{ranking.entityType} · {ranking.entityId}</small></span></span><span><strong>{ranking.categoryName}</strong><small>{ranking.categoryId}</small></span><span>{ranking.price && ranking.currencyId === "CLP" ? moneyFormatter.format(Number(ranking.price)) : "—"}</span><span className={`candidate-chip candidate-chip--${ranking.candidateStatus}`}>{candidateLabels[ranking.candidateStatus]}</span><time>{formatDate(ranking.capturedAt)}</time></button>)}</div></div>}
      </section>

      <section className="content-card research-runs">
        <header className="research-section-header"><div><span className="eyebrow">Operación</span><h2>Últimas ejecuciones</h2></div><span>Worker: {overview.worker?.status || "sin iniciar"}</span></header>
        {overview.runs.length === 0 ? <div className="table-empty">Todavía no hay ejecuciones.</div> : <div className="run-list">{overview.runs.map((run) => <article key={run.id}><span className={`run-status run-status--${run.status}`}>{statusLabels[run.status] || run.status}</span><div><strong>{run.triggerType === "manual" ? "Ejecución manual" : "Ejecución programada"}</strong><small>{run.categoriesProcessed}/{run.categoriesRequested} categorías · {run.snapshotsCreated} snapshots{run.errorSummary ? ` · ${run.errorSummary}` : ""}</small></div><time>{formatDate(run.startedAt || run.createdAt)}</time></article>)}</div>}
      </section>

      <ConfirmModal open={confirmRun} title="Ejecutar investigación ahora" message={`Se consultarán hasta ${settings.maxCategoriesPerRun} categorías hoja mediante la API oficial. La información permanecerá interna.`} confirmLabel="Agregar a la cola" busy={running} onClose={() => setConfirmRun(false)} onConfirm={() => void queueRun()} />
      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}><section className="modal-card candidate-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-title"><button className="icon-button modal-close" type="button" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18} /></button><div className="modal-category-icon"><SearchCheck size={22} /></div><h2 id="candidate-title">Evaluar candidato</h2><p>{editing.title || editing.entityId}</p><form onSubmit={(event) => { event.preventDefault(); void saveCandidate(); }}><label>Estado<select value={candidateDraft.status} onChange={(event) => setCandidateDraft({ ...candidateDraft, status: event.target.value })}>{Object.entries(candidateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Etiquetas<input value={candidateDraft.tags} onChange={(event) => setCandidateDraft({ ...candidateDraft, tags: event.target.value })} placeholder="hogar, precio atractivo" /></label><label>Notas internas<textarea rows={5} value={candidateDraft.notes} onChange={(event) => setCandidateDraft({ ...candidateDraft, notes: event.target.value })} placeholder="Razones para investigar este candidato…" /></label><div className="modal-actions"><button className="button button--secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar evaluación"}</button></div></form></section></div>}
    </div>
  );
}
