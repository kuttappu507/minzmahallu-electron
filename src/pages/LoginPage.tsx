import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Button, Input, Label } from "@/components/ui";
import { toast } from "@/lib/toast";
import { motion } from "framer-motion";

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
      setError(
        "MMS bridge not available. The preload script failed to load. This usually means the app was not installed correctly. Please reinstall the app or contact support."
      );
      setLoading(false);
      return;
    }

    try {
      const result = await (window as any).mms.auth.login(username, password);
      if (result.success && result.user) {
        setUser(result.user);
        toast.success(`${t("app_name")} ✓`);
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
      console.error("[Login] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-canvas">
      {/* ===== Left panel — animated gradient mesh ===== */}
      <div className="hidden lg:flex relative w-1/2 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-accent-900">
        {/* Animated gradient blobs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-brand-400 to-accent-400 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full bg-gradient-to-tl from-accent-500 to-brand-500 blur-3xl"
        />
        <motion.div
          animate={{
            rotate: [0, 180, 360],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 blur-3xl"
        />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20">
              <span className="text-2xl font-bold">M</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">MMS</h1>
              <p className="text-xs text-white/70 font-medium">Minz Mahallu Management</p>
            </div>
          </div>

          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl font-bold tracking-tight mb-4 text-balance"
            >
              Manage your mahallu with{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 to-purple-300">
                clarity.
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg text-white/70 max-w-md leading-relaxed"
            >
              {t("app_subtitle")}. A modern desktop app for families, members, donations,
              certificates, and more — all in one place.
            </motion.p>
          </div>

          <div className="flex items-center gap-6 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>PBKDF2-SHA256 secured</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Offline-first SQLite</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Right panel — form ===== */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-mesh-light opacity-50 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-brand shadow-glow">
              <span className="text-2xl font-bold text-white">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MMS</h1>
              <p className="text-xs text-text-tertiary">{t("app_name")}</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-text-primary">
              {t("login_title")}
            </h2>
            <p className="text-sm text-text-secondary mt-2">
              Welcome back. Sign in to continue to your dashboard.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 flex items-start gap-2"
            >
              <AlertTriangle className="h-4 w-4 text-danger mt-0.5 flex-shrink-0" />
              <p className="text-sm text-danger flex-1">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <Label htmlFor="username">{t("login_username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                autoComplete="username"
                className="h-11"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">{t("login_password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin123"
                  autoComplete="current-password"
                  className="h-11 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t("login_button")}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 px-4 py-3 rounded-lg bg-primary-subtle border border-primary/20">
            <p className="text-xs text-text-secondary text-center">
              <span className="font-semibold text-primary">{t("login_default_hint")}</span>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-text-muted">
            {t("app_name")} · v2.0.0 · React + Electron
          </p>
        </motion.div>
      </div>
    </div>
  );
}
