import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/auth-context";

const errorMessages: Record<string, string> = {
  google_not_configured: "Google OAuth aún no está configurado. Usa el acceso local mientras desarrollamos.",
  google_login_failed: "Google no pudo completar el acceso o esta cuenta no está autorizada.",
};

export function LoginPage() {
  const { user, config, loading, developmentLogin } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const queryError = new URLSearchParams(location.search).get("error") || "";

  useEffect(() => { document.title = "Ingresar · Siempre Barato"; }, []);
  if (!loading && user) return <Navigate to="/" replace />;

  async function handleDevelopmentLogin() {
    setBusy(true);
    setLocalError("");
    try { await developmentLogin(); } catch (error) { setLocalError(error instanceof Error ? error.message : "No se pudo ingresar."); } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <img className="login-logo" src="/brand/logo.png" alt="Siempre Barato" />
        <div className="login-message">
          <span className="eyebrow eyebrow--yellow">Administración segura</span>
          <h1>Todo el negocio,<br />en un solo lugar.</h1>
          <p>Gestiona catálogo, precios mayoristas, inventario, pedidos e investigación desde una consola diseñada para operar con claridad.</p>
          <div className="security-note"><ShieldCheck size={22} /><span>Solo cuentas de Google invitadas previamente.</span></div>
        </div>
      </div>
      <main className="login-form-panel">
        <section className="login-card">
          <div className="login-lock"><LockKeyhole size={23} /></div>
          <span className="eyebrow">Consola privada</span>
          <h2>Bienvenido</h2>
          <p>Ingresa con la cuenta de Google autorizada para Siempre Barato.</p>
          {(queryError || localError) && <div className="form-alert" role="alert">{localError || errorMessages[queryError] || "No se pudo completar el acceso."}</div>}
          <a className={`google-button${!config?.googleConfigured ? " google-button--disabled" : ""}`} href="/api/auth/google/start?returnTo=/">
            <span className="google-mark">G</span>
            Continuar con Google
            <ArrowRight size={18} />
          </a>
          {!config?.googleConfigured && <small className="field-hint">El cliente OAuth se conectará desde el proyecto dedicado de Google Cloud.</small>}
          {config?.developmentLoginEnabled && (
            <button className="button button--local" type="button" onClick={() => void handleDevelopmentLogin()} disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar en modo local"}
            </button>
          )}
          <div className="login-footer"><ShieldCheck size={16} /><span>La identidad de Google se verifica en el servidor.</span></div>
        </section>
      </main>
    </div>
  );
}
