import { useEffect, useState } from "react";
import { Building2, Wallet, Palette } from "lucide-react";
import { useI18n } from "@/i18n";
import { Card, CardContent, Input, Label, Textarea, Select, SectionLabel } from "@/components/ui";

export function Settings() {
  const { t, isMalayalam } = useI18n();
  const [settings, setSettings] = useState<any>({});
  const [theme, setTheme] = useState("light");
  useEffect(() => { (async () => { try { const r = await window.mms.settings.get(); setSettings(r || {}); setTheme(r?.theme || "light"); } catch {} })(); }, []);
  const handleThemeChange = (value: string) => { setTheme(value); try { window.mms.settings.update({ ...settings, theme: value }); } catch {} };
  return <div className="view view-enter">
    <div className="vhead"><div><h1>{t("set_title")}</h1><div className="vs">{t("set_subtitle")}</div></div></div>
    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><SectionLabel className="mb-0">{t("set_org_section")}</SectionLabel></div><div className="grid grid-cols-2 gap-4">
      <div><Label>{t("set_mahallu_name")}</Label><Input value={settings.mahallu_name || ""} onChange={(e) => setSettings({ ...settings, mahallu_name: e.target.value })} /></div>
      <div><Label>{t("set_phone")}</Label><Input value={settings.phone || ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></div>
      <div><Label>{t("set_email")}</Label><Input type="email" value={settings.email || ""} onChange={(e) => setSettings({ ...settings, email: e.target.value })} /></div>
      <div className="col-span-2"><Label>{t("family_address")}</Label><Textarea rows={2} value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></div>
    </div></CardContent></Card>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><SectionLabel className="mb-0">{t("set_financial_section")}</SectionLabel></div><div className="grid grid-cols-3 gap-4">
      <div><Label>{t("set_financial_year_start")}</Label><Input value={settings.financial_year_start || ""} onChange={(e) => setSettings({ ...settings, financial_year_start: e.target.value })} /></div>
      <div><Label>{t("set_currency_symbol")}</Label><Input value={settings.currency_symbol || ""} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} /></div>
      <div><Label>{t("set_receipt_prefix")}</Label><Input value={settings.receipt_prefix || ""} onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })} /></div>
    </div></CardContent></Card>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /><SectionLabel className="mb-0">{t("set_appearance_section")}</SectionLabel></div><div className="grid grid-cols-2 gap-4">
      <div><Label>{t("set_theme")}</Label><Select value={theme} onChange={(e) => handleThemeChange(e.target.value)}><option value="light">{t("set_theme_light")}</option><option value="dark">{t("set_theme_dark")}</option></Select></div>
      <div><Label>{t("set_language")}</Label><Select value={isMalayalam() ? "ml" : "en"} onChange={(e) => useI18n.getState().setLang(e.target.value as "en" | "ml")}><option value="en">{t("set_lang_english")}</option><option value="ml">{t("set_lang_malayalam")}</option></Select></div>
    </div></CardContent></Card>
  </div>;
}
