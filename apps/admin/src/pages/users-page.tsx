import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, RefreshCw, Search, Shield, UserCheck, UserX, X } from "lucide-react";
import { ADMIN_ROLE_LABELS, ADMIN_ROLES, type AdminRole, type AdminUser } from "@siemprebarato/shared";
import { useAuth } from "../auth/auth-context";
import { apiFetch } from "../lib/api";
import { ConfirmModal } from "../components/confirm-modal";

type ConfirmAction = { type: "toggle" | "revoke"; user: AdminUser } | null;
const dateFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

export function UsersPage() {
  const { user: sessionUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const canManage = sessionUser?.role === "super_admin";

  const loadUsers = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await apiFetch<{ users: AdminUser[] }>("/api/admin/users"); setUsers(response.users); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => void loadUsers(), [loadUsers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? users.filter((user) => `${user.displayName} ${user.email} ${ADMIN_ROLE_LABELS[user.role]}`.toLowerCase().includes(query)) : users;
  }, [users, search]);

  async function updateUser(id: string, changes: Partial<Pick<AdminUser, "displayName" | "role" | "isActive">>) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setUsers((current) => current.map((user) => user.id === id ? response.user : user));
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar."); }
    finally { setBusy(false); setConfirmAction(null); }
  }

  async function revokeSessions(id: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/api/admin/users/${id}/revoke-sessions`, { method: "POST" }); }
    catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : "No se pudieron cerrar las sesiones."); }
    finally { setBusy(false); setConfirmAction(null); }
  }

  return (
    <div className="page-stack">
      <section className="page-heading"><div><span className="eyebrow">Acceso y seguridad</span><h1>Usuarios administradores</h1><p>Solo las cuentas de Google agregadas aquí pueden ingresar a la consola.</p></div>{canManage && <button className="button button--primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Agregar usuario</button>}</section>
      <section className="content-card users-card">
        <header className="table-toolbar"><div className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, correo o rol" aria-label="Buscar usuarios" /></div><button className="icon-button" type="button" onClick={() => void loadUsers()} aria-label="Actualizar" disabled={loading}><RefreshCw size={18} className={loading ? "spin" : ""} /></button></header>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <div className="users-table" role="table" aria-label="Usuarios administradores">
          <div className="users-table__head" role="row"><span>Usuario</span><span>Rol</span><span>Google</span><span>Último acceso</span><span>Estado y acciones</span></div>
          {loading ? <div className="table-empty">Cargando usuarios…</div> : filtered.length === 0 ? <div className="table-empty">No encontramos usuarios para esta búsqueda.</div> : filtered.map((admin) => (
            <div className="user-row" role="row" key={admin.id}>
              <div className="user-identity"><span className="avatar">{admin.displayName.charAt(0) || admin.email.charAt(0)}</span><div><strong>{admin.displayName}</strong><small>{admin.email}</small></div></div>
              <div>{canManage && admin.id !== sessionUser?.id ? <select value={admin.role} onChange={(event) => void updateUser(admin.id, { role: event.target.value as AdminRole })} disabled={busy} aria-label={`Rol de ${admin.displayName}`}>{ADMIN_ROLES.map((role) => <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>)}</select> : <span className="role-pill"><Shield size={14} />{ADMIN_ROLE_LABELS[admin.role]}</span>}</div>
              <div><span className={`connection-pill ${admin.googleLinked ? "connection-pill--linked" : ""}`}>{admin.googleLinked ? <UserCheck size={15} /> : <KeyRound size={15} />}{admin.googleLinked ? "Vinculado" : "Pendiente"}</span></div>
              <div className="date-cell">{admin.lastLoginAt ? dateFormatter.format(new Date(admin.lastLoginAt)) : "Nunca"}</div>
              <div className="user-actions"><span className={`status-chip ${admin.isActive ? "status-chip--active" : ""}`}><span />{admin.isActive ? "Activo" : "Suspendido"}</span>{canManage && admin.id !== sessionUser?.id && <><button className="icon-button" type="button" onClick={() => setConfirmAction({ type: "toggle", user: admin })} aria-label={admin.isActive ? `Suspender a ${admin.displayName}` : `Activar a ${admin.displayName}`}>{admin.isActive ? <UserX size={17} /> : <UserCheck size={17} />}</button><button className="icon-button" type="button" onClick={() => setConfirmAction({ type: "revoke", user: admin })} aria-label={`Cerrar sesiones de ${admin.displayName}`}><KeyRound size={17} /></button></>}</div>
            </div>
          ))}
        </div>
      </section>
      {showAdd && <AddUserModal busy={busy} onClose={() => setShowAdd(false)} onCreated={(created) => { setUsers((current) => [...current, created]); setShowAdd(false); }} onBusy={setBusy} onError={setError} />}
      <ConfirmModal open={Boolean(confirmAction)} title={confirmAction?.type === "revoke" ? "Cerrar sesiones activas" : confirmAction?.user.isActive ? "Suspender acceso" : "Reactivar acceso"} message={confirmAction?.type === "revoke" ? `Se cerrarán todas las sesiones de ${confirmAction.user.displayName}.` : confirmAction?.user.isActive ? `${confirmAction?.user.displayName} ya no podrá entrar y sus sesiones se cerrarán.` : `${confirmAction?.user.displayName} podrá volver a ingresar con Google.`} confirmLabel={confirmAction?.type === "revoke" ? "Cerrar sesiones" : confirmAction?.user.isActive ? "Suspender" : "Reactivar"} busy={busy} onClose={() => setConfirmAction(null)} onConfirm={() => { if (!confirmAction) return; if (confirmAction.type === "revoke") void revokeSessions(confirmAction.user.id); else void updateUser(confirmAction.user.id, { isActive: !confirmAction.user.isActive }); }} />
    </div>
  );
}

function AddUserModal({ busy, onClose, onCreated, onBusy, onError }: { busy: boolean; onClose: () => void; onCreated: (user: AdminUser) => void; onBusy: (busy: boolean) => void; onError: (error: string) => void }) {
  const [form, setForm] = useState({ displayName: "", email: "", role: "viewer" as AdminRole });
  async function submit(event: React.FormEvent) {
    event.preventDefault(); onBusy(true); onError("");
    try { const response = await apiFetch<{ user: AdminUser }>("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); onCreated(response.user); }
    catch (error) { onError(error instanceof Error ? error.message : "No se pudo agregar el usuario."); }
    finally { onBusy(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card modal-card--form" role="dialog" aria-modal="true" aria-labelledby="add-user-title"><button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button><span className="eyebrow">Nuevo acceso</span><h2 id="add-user-title">Agregar usuario</h2><p>La persona deberá ingresar con esta misma dirección de Google.</p><form onSubmit={(event) => void submit(event)}><label>Nombre completo<input required maxLength={160} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label><label>Correo de Google<input required type="email" maxLength={320} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="persona@gmail.com" /></label><label>Rol<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AdminRole })}>{ADMIN_ROLES.map((role) => <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>)}</select></label><div className="modal-actions"><button className="button button--secondary" type="button" onClick={onClose}>Cancelar</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Agregando…" : "Agregar usuario"}</button></div></form></section></div>;
}
