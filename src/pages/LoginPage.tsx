import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, Eye, EyeOff, ShieldCheck, Database, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { toast } from "@/lib/toast";

export function LoginPage() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ml = lang === "ml";
  const copy = {
    bridge: ml ? "MMS ബ്രിഡ്ജ് ലഭ്യമല്ല. പ്രീലോഡ് സ്ക്രിപ്റ്റ് ലോഡ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു." : "MMS bridge not available. The preload script failed to load.",
    loginFailed: ml ? "ലോഗിൻ പരാജയപ്പെട്ടു. നിങ്ങളുടെ വിവരങ്ങൾ പരിശോധിക്കുക." : "Login failed. Please check your credentials.",
    unexpected: ml ? "ലോഗിൻ ചെയ്യുന്നതിനിടെ അപ്രതീക്ഷിത പിശക് സംഭവിച്ചു." : "An unexpected error occurred during login.",
    welcome: ml ? "സ്വാഗതം" : "Welcome",
    manageTitle: ml ? "നിങ്ങളുടെ മഹല്ല്\nവ്യക്തതയോടെ നിയന്ത്രിക്കുക." : "Manage your mahallu\nwith clarity.",
    manageText: ml ? "കുടുംബങ്ങൾ, അംഗങ്ങൾ, സംഭാവനകൾ, സർട്ടിഫിക്കറ്റുകൾ എന്നിവയും മറ്റും ഒരിടത്ത് കൈകാര്യം ചെയ്യാനുള്ള ആധുനിക ഡെസ്ക്ടോപ്പ് ആപ്പ്." : "A modern desktop app for families, members, donations, certificates, and more — all in one place.",
    secured: ml ? "PBKDF2 സുരക്ഷിതം" : "PBKDF2 secured",
    offline: ml ? "ഓഫ്‌ലൈൻ SQLite" : "Offline SQLite",
    back: ml ? "വീണ്ടും സ്വാഗതം. ഡാഷ്ബോർഡിലേക്ക് തുടരാൻ സൈൻ ഇൻ ചെയ്യുക." : "Welcome back. Sign in to continue to your dashboard.",
    signing: ml ? "സൈൻ ഇൻ ചെയ്യുന്നു..." : "Signing in...",
    minimize: ml ? "ചുരുക്കുക" : "Minimize",
    maximize: ml ? "വലുതാക്കുക" : "Maximize",
    close: ml ? "അടയ്ക്കുക" : "Close",
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    if (typeof window === "undefined" || !(window as any).mms) { setError(copy.bridge); setLoading(false); return; }
    try {
      const result = await (window as any).mms.auth.login(username, password);
      if (result.success && result.user) { setUser(result.user); toast.success(`${copy.welcome}, ${result.user.fullName}`); navigate("/"); }
      else { const errMsg = result.error || copy.loginFailed; setError(errMsg); toast.error(errMsg); }
    } catch (err: any) { const errMsg = err?.message || copy.unexpected; setError(errMsg); toast.error(errMsg); }
    finally { setLoading(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-win-controls">
        <button className="win-btn" onClick={() => window.mms.win.minimize()} title={copy.minimize}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14"/></svg></button>
        <button className="win-btn" onClick={() => window.mms.win.maximize()} title={copy.maximize}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button>
        <button className="win-btn win-close" onClick={() => window.mms.win.close()} title={copy.close}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>

      <div className="login-left"><div className="login-deco-1" /><div className="login-deco-2" /><div className="login-deco-3" /><div className="login-grid-overlay" /><div className="login-content">
        <div className="login-logo-row"><div className="login-logo-box"><b>M</b></div><div><h1 className="login-brand-name">MMS</h1><p className="login-brand-sub">Minz Mahallu</p></div></div>
        <div><h2 className="login-hero-title">{copy.manageTitle.split("\n").map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</h2><p className="login-hero-text">{t("app_subtitle")}. {copy.manageText}</p></div>
        <div className="login-feature-row"><div className="login-feature"><ShieldCheck size={16} /><b>{copy.secured}</b></div><div className="login-feature"><Database size={16} /><b>{copy.offline}</b></div></div>
      </div></div>

      <div className="login-right"><div className="login-form-wrap">
        <div className="login-mobile-logo-row lg:hidden"><div className="login-logo-box-sm"><b>M</b></div><div><h1 className="login-brand-name">MMS</h1><p className="login-brand-sub">Minz Mahallu</p></div></div>
        <div className="mb-4"><h2 className="login-form-title">{t("login_title")}</h2><p className="login-form-sub">{copy.back}</p></div>
        {error && <div className="login-error"><AlertTriangle size={16} className="toast-ic-err flex-shrink-0 mt-1" /><p>{error}</p></div>}
        <form onSubmit={handleLogin} className="login-form">
          <div><label className="lbl" htmlFor="username">{t("login_username")}</label><input id="username" className="inp login-submit" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus autoComplete="username" required /></div>
          <div><label className="lbl" htmlFor="password">{t("login_password")}</label><div className="login-pwd-wrap"><input id="password" className="inp login-submit" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="admin123" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} className="login-pwd-toggle">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
          <button type="submit" className="btn bp bblock login-submit" disabled={loading}>{loading ? <><Loader2 size={16} className="animate-spin" />{copy.signing}</> : <><LogIn size={16} />{t("login_button")}</>}</button>
        </form>
        <div className="login-hint"><p><b>{t("login_default_hint")}</b></p></div>
        <p className="login-foot">{t("app_name")} · v3.0.0 · React + Electron</p>
      </div></div>
    </div>
  );
}
