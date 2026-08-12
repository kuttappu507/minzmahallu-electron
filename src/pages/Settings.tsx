import { useState, useEffect } from "react";
import { Building2, Wallet, Palette, Database, Save } from "lucide-react";
import { useI18n } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { Card, CardContent, Button, Input, Label, Select, Textarea, Switch, SectionLabel } from "@/components/ui";
import { toast } from "@/lib/toast";

interface Settings {
  mahallu_name: string;
  phone: string;
  email: string;
  address: string;
  financial_year_start: string;
  currency_symbol: string;
  receipt_prefix: string;
  language: string;
  auto_backup: boolean;
  backup_interval_hours: number;
}

const emptySettings: Settings = {
  mahallu_name: "",
  phone: "",
  email: "",
  address: "",
  financial_year_start: "04-01",
  currency_symbol: "₹",
  receipt_prefix: "RCP",
  language: "en",
  auto_backup: false,
  backup_interval_hours: 24,
};

export function Settings() {
  const { t, setLang, lang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.mms.settings.load().then((s) => {
      if (s) {
        // Sync the settings DB language field with the current i18n store
        // language — but do NOT override the i18n store (which the user
        // may have changed via the topbar toggle). The i18n store is the
        // source of truth for the current session's language.
        setSettings({ ...emptySettings, ...s, language: lang });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.mms.settings.save(settings);
      toast.success(t("ui_save_changes"));
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (value: string) => {
    setTheme(value as "light" | "dark");
    setSettings({ ...settings, language: settings.language });
  };

  const handleLangChange = (value: string) => {
    setLang(value as "en" | "ml");
    setSettings({ ...settings, language: value });
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-text-tertiary">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-text-primary">{t("set_title")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("set_subtitle")}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : t("ui_save_changes")}
        </Button>
      </div>

      {/* Organization */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <SectionLabel className="mb-0">{t("set_org_section")}</SectionLabel>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("set_mahallu_name")}</Label>
              <Input value={settings.mahallu_name} onChange={(e) => setSettings({ ...settings, mahallu_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("set_phone")}</Label>
              <Input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("set_email")}</Label>
              <Input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>{t("family_address")}</Label>
              <Textarea rows={2} value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <SectionLabel className="mb-0">{t("set_financial_section")}</SectionLabel>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>{t("set_financial_year_start")}</Label>
              <Input value={settings.financial_year_start} placeholder="MM-DD" onChange={(e) => setSettings({ ...settings, financial_year_start: e.target.value })} />
            </div>
            <div>
              <Label>{t("set_currency_symbol")}</Label>
              <Input value={settings.currency_symbol} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} />
            </div>
            <div>
              <Label>{t("set_receipt_prefix")}</Label>
              <Input value={settings.receipt_prefix} onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <SectionLabel className="mb-0">{t("set_appearance_section")}</SectionLabel>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("set_theme")}</Label>
              <Select value={theme} onChange={(e) => handleThemeChange(e.target.value)}>
                <option value="light">{t("set_theme_light")}</option>
                <option value="dark">{t("set_theme_dark")}</option>
              </Select>
            </div>
            <div>
              <Label>{t("set_language")}</Label>
              <Select value={lang} onChange={(e) => handleLangChange(e.target.value)}>
                <option value="en">{t("set_lang_english")}</option>
                <option value="ml">{t("set_lang_malayalam")}</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <SectionLabel className="mb-0">{t("set_backup_section")}</SectionLabel>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="mb-0">{t("set_auto_backup")}</Label>
                <p className="text-xs text-text-tertiary mt-1">Automatically create database backups</p>
              </div>
              <Switch checked={settings.auto_backup} onCheckedChange={(v) => setSettings({ ...settings, auto_backup: v })} />
            </div>
            <div className="w-48">
              <Label>{t("set_backup_interval")}</Label>
              <Input type="number" value={settings.backup_interval_hours} onChange={(e) => setSettings({ ...settings, backup_interval_hours: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : t("ui_save_changes")}
        </Button>
      </div>
    </div>
  );
}
