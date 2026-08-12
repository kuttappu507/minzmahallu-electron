import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, Eye, EyeOff, ShieldCheck, AlertTriangle, Database } from "lucide-react";
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
    <div style={{ height: "100vh", display: "flex", background: "var(--bg)", backgroundImage: "var(--dot)" }}>
      {/* ===== Left panel — emerald gradient with logo ===== */}
      <div style={{
        flex: "0 0 45%", position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #0eab7f 0%, #0b916c 40%, #08755a 100%)",
      }}>
        {/* Decorative circles */}
        <div style={{
          position: "absolute", top: -60, left: -60, width: 280, height: 280,
          borderRadius: "50%", background: "rgba(255,255,255,0.08)", filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", bottom: -80, right: -40, width: 320, height: 320,
          borderRadius: "50%", border: "30px solid rgba(255,255,255,0.06)",
        }} />
        <div style={{
          position: "absolute", top: "30%", right: "10%", width: 180, height: 180,
          borderRadius: "50%", background: "rgba(255,255,255,0.05)", filter: "blur(30px)",
        }} />

        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* Content */}
        <div style={{
          position: "relative", zIndex: 10, height: "100%", display: "flex",
          flexDirection: "column", justifyContent: "space-between", padding: "48px 48px",
          color: "#fff",
        }}>
          {/* Logo header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "grid", placeItems: "center",
            }}>
              <span style={{ font: "800 28px 'Space Grotesk'", color: "#fff" }}>M</span>
            </div>
            <div>
              <h1 style={{ font: "800 20px 'Space Grotesk'", letterSpacing: "-0.01em" }}>MMS</h1>
              <p style={{ font: "700 11px Manrope", color: "rgba(255,255,255,0.7)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Minz Mahallu</p>
            </div>
          </div>

          {/* Hero text */}
          <div>
            <h2 style={{ font: "700 32px/1.2 'Space Grotesk'", letterSpacing: "-0.02em", marginBottom: 14 }}>
              Manage your mahallu<br />with clarity.
            </h2>
            <p style={{ font: "600 15px Manrope", color: "rgba(255,255,255,0.75)", maxWidth: 380, lineHeight: 1.6 }}>
              {t("app_subtitle")}. A modern desktop app for families, members, donations, certificates, and more — all in one place.
            </p>
          </div>

          {/* Feature badges */}
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} />
              <span style={{ font: "700 12px Manrope" }}>PBKDF2 secured</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Database size={16} />
              <span style={{ font: "700 12px Manrope" }}>Offline SQLite</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Right panel — login form ===== */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 40, position: "relative",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* Logo for mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, justifyContent: "center" }}
            className="lg:hidden">
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "var(--em)", boxShadow: "0 2px 0 var(--emdd)",
              display: "grid", placeItems: "center",
            }}>
              <span style={{ font: "800 22px 'Space Grotesk'", color: "#fff" }}>M</span>
            </div>
            <div>
              <h1 style={{ font: "800 16px 'Space Grotesk'" }}>MMS</h1>
              <p style={{ font: "700 9px Manrope", color: "var(--fnt)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Minz Mahallu</p>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ font: "700 26px 'Space Grotesk'", letterSpacing: "-0.01em", color: "var(--tx)" }}>
              {t("login_title")}
            </h2>
            <p style={{ font: "600 13px Manrope", color: "var(--mut)", marginTop: 6 }}>
              Welcome back. Sign in to continue to your dashboard.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div style={{
              marginBottom: 16, padding: "12px 14px", borderRadius: 12,
              background: "var(--rose-bg)", border: "1.5px solid var(--rose-line)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <AlertTriangle size={16} style={{ color: "var(--c-rose)", flexShrink: 0, marginTop: 1 }} />
              <p style={{ font: "600 12.5px Manrope", color: "var(--c-rose)", flex: 1 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="lbl" htmlFor="username">{t("login_username")}</label>
              <input
                id="username"
                className="inp"
                style={{ height: 44 }}
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
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  className="inp"
                  style={{ height: 44, paddingRight: 42 }}
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
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: 0, color: "var(--fnt)", cursor: "pointer", padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn bp bblock" style={{ height: 44, fontSize: 14, marginTop: 4 }} disabled={loading}>
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
          <div style={{
            marginTop: 20, padding: "12px 16px", borderRadius: 12,
            background: "var(--selbg)", border: "1px solid var(--line)",
          }}>
            <p style={{ font: "600 12px Manrope", color: "var(--mut)", textAlign: "center" }}>
              <span style={{ fontWeight: 800, color: "var(--em)" }}>{t("login_default_hint")}</span>
            </p>
          </div>

          <p style={{ marginTop: 24, textAlign: "center", font: "700 11px Manrope", color: "var(--fnt)" }}>
            {t("app_name")} · v3.0.0 · React + Electron
          </p>
        </div>
      </div>
    </div>
  );
}
