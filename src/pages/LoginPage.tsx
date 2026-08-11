import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/i18n";
import { Button, Input, Label, Card, CardContent } from "@/components/ui";
import { toast } from "@/lib/toast";

export function LoginPage() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await window.mms.auth.login(username, password);
      if (result.success) {
        setUser(result.user);
        toast.success(`${t("app_name")} ✓`);
        navigate("/");
      } else {
        toast.error(result.error || "Login failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="w-full h-full" style={{ backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      </div>

      <Card className="w-full max-w-md shadow-2xl backdrop-blur-sm">
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-3xl font-bold mb-4">
              M
            </div>
            <h1 className="text-2xl font-bold text-text-primary">{t("login_title")}</h1>
            <p className="text-sm text-text-secondary mt-1">{t("app_name")}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="username">{t("login_username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                required
              />
            </div>

            <div>
              <Label htmlFor="password">{t("login_password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123"
                required
              />
            </div>

            <Button type="submit" className="w-full h-11" disabled={loading}>
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

          <div className="mt-6 text-center text-xs text-text-tertiary bg-surface-hover rounded-lg py-2 px-3">
            {t("login_default_hint")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
