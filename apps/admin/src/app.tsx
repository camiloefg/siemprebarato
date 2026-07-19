import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/auth-context";
import { AdminLayout } from "./components/admin-layout";
import { AuditPage } from "./pages/audit-page";
import { DashboardPage } from "./pages/dashboard-page";
import { LoginPage } from "./pages/login-page";
import { UsersPage } from "./pages/users-page";
import { CatalogPage } from "./pages/catalog-page";
import { ProductEditorPage } from "./pages/product-editor-page";
import { ResearchPage } from "./pages/research-page";

function ProtectedArea() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><img src="/brand/favicon-192.png" alt="" /><span>Cargando consola…</span></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedArea />}><Route element={<AdminLayout />}><Route index element={<DashboardPage />} /><Route path="catalog" element={<CatalogPage />} /><Route path="catalog/new" element={<ProductEditorPage />} /><Route path="catalog/:productId" element={<ProductEditorPage />} /><Route path="research" element={<ResearchPage />} /><Route path="users" element={<UsersPage />} /><Route path="audit" element={<AuditPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
