import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, Eye, EyeOff, ShieldCheck, Database, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { toast } from "@/lib/toast";

export function LoginPage() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (typeof window === "undefined" || !(window as any).mms) {
      setError("MMS bridge not available. The preload script failed to load.");
      setLoading(false);
      return;
    }

    try {
      const result = await (window as any).mms.auth.login(username, password);
      if (result.success && result.user) {
        setUser(result.user);
        toast.success(`Welcome, ${result.user.fullName}`);
        navigate("/");
      } else {
        const errMsg = result.error || "Login failed. Please check your credentials.";
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || "An unexpected error occurred during login.";
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      {/* ===== Left panel — emerald gradient with logo ===== */}
      <div className="login-left">
        {/* Decorative circles */}
        <div className="login-deco-1" />
        <div className="login-deco-2" />
        <div className="login-deco-3" />

        {/* Grid overlay */}
        <div className="login-grid-overlay" />

        {/* Content */}
        <div className="login-content">
          {/* Logo header */}
          <div className="login-logo-row">
            <div className="login-logo-box">
              <b>M</b>
            </div>
            <div>
              <h1 className="login-brand-name">MMS</h1>
              <p className="login-brand-sub">Minz Mahallu</p>
            </div>
          </div>

          {/* Hero text */}
          <div>
            <h2 className="login-hero-title">
              Manage your mahallu<br />with clarity.
            </h2>
            <p className="login-hero-text">
              {t("app_subtitle")}. A modern desktop app for families, members, donations, certificates, and more — all in one place.
            </p>
          </div>

          {/* Feature badges */}
          <div className="login-feature-row">
            <div className="login-feature">
              <ShieldCheck size={16} />
              <b>PBKDF2 secured</b>
            </div>
            <div className="login-feature">
              <Database size={16} />
              <b>Offline SQLite</b>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Right panel — login form ===== */}
      <div className="login-right">
        <div className="login-form-wrap">
          {/* Logo for mobile */}
          <div className="login-mobile-logo-row lg:hidden">
            <div className="login-logo-box-sm">
              <b>M</b>
            </div>
            <div>
              <h1 className="login-brand-name">MMS</h1>
              <p className="login-brand-sub">Minz Mahallu</p>
            </div>
          </div>

          <div className="mb-4">
            <h2 className="login-form-title">
              {t("login_title")}
            </h2>
            <p className="login-form-sub">
              Welcome back. Sign in to continue to your dashboard.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="login-error">
              <AlertTriangle size={16} className="toast-ic-err flex-shrink-0 mt-1" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div>
              <label className="lbl" htmlFor="username">{t("login_username")}</label>
              <input
                id="username"
                className="inp login-submit"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="lbl" htmlFor="password">{t("login_password")}</label>
              <div className="login-pwd-wrap">
                <input
                  id="password"
                  className="inp login-submit"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin123"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-pwd-toggle"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn bp bblock login-submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  {t("login_button")}
                </>
              )}
            </button>
          </form>

          {/* Default credentials hint */}
          <div className="login-hint">
            <p>
              <b>{t("login_default_hint")}</b>
            </p>
          </div>

          <p className="login-foot">
            {t("app_name")} · v3.0.0 · React + Electron
          </p>
        </div>
      </div>
    </div>
  );
}
