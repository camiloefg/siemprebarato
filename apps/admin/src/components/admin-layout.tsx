import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, SearchCheck, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "../auth/auth-context";

const navigation = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/catalog", label: "Catálogo", icon: Boxes },
  { to: "/research", label: "Investigación", icon: SearchCheck },
  { to: "/users", label: "Usuarios", icon: Users },
  { to: "/audit", label: "Auditoría", icon: ClipboardList },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-shell">
      <aside className={`sidebar${mobileOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/brand/logo.png" alt="Siempre Barato" />
          <button className="icon-button sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Administración principal">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-security">
          <ShieldCheck size={18} />
          <div><strong>Acceso protegido</strong><span>Google + lista autorizada</span></div>
        </div>
        <button className="sidebar-logout" type="button" onClick={() => void logout()}>
          <LogOut size={18} /> Cerrar sesión
        </button>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
      <div className="admin-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <Menu size={21} />
          </button>
          <div className="topbar-context"><span>Consola</span><strong>Siempre Barato</strong></div>
          <div className="user-chip"><span>{user?.displayName?.charAt(0) || user?.email.charAt(0)}</span><div><strong>{user?.displayName || "Administrador"}</strong><small>{user?.email}</small></div></div>
        </header>
        <main className="page-container"><Outlet /></main>
      </div>
    </div>
  );
}
