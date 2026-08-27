import { useState, useEffect } from "react";
import { Building2, Wallet, Palette, Database, Save, Tags, Plus, Pencil, Trash2, Power, Award, MapPin } from "lucide-react";
import { useI18n } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { Card, CardContent, Button, Input, Label, Select, Textarea, Switch, SectionLabel } from "@/components/ui";
import { MalayalamInput } from "@/components/MalayalamInput";
import { toast } from "@/lib/toast";

interface Settings {
  mahallu_name:string; phone:string; email:string; address:string; financial_year_start:string;
  currency_symbol:string; receipt_prefix:string; language:string; theme:string; auto_backup:boolean;
  backup_interval_hours:number; subscription_monthly_amount:number; subscription_frequency:"Monthly"|"Quarterly";
  affiliation_number:string; committee_term_start:string; committee_term_end:string;
  wakf_reg_no:string; society_reg_no:string;
  village:string; panchayath:string; taluk:string; district:string; pincode:string; state:string;
}
interface Category { id:number; name:string; description?:string; is_active:number; donation_count:number; }
const emptySettings: Settings = {
  mahallu_name:"", phone:"", email:"", address:"", financial_year_start:"04-01", currency_symbol:"₹",
  receipt_prefix:"RCP", language:"en", theme:"light", auto_backup:false, backup_interval_hours:24,
  subscription_monthly_amount:100, subscription_frequency:"Monthly",
  affiliation_number:"", committee_term_start:"", committee_term_end:"",
  wakf_reg_no:"", society_reg_no:"", village:"", panchayath:"", taluk:"", district:"", pincode:"", state:"",
};

export function Settings(){
  const {t,setLang,lang}=useI18n();
  const {theme,setTheme}=useTheme();
  const [settings,setSettings]=useState<Settings>(emptySettings);
  const [categories,setCategories]=useState<Category[]>([]);
  const [categoryName,setCategoryName]=useState("");
  const [categoryDescription,setCategoryDescription]=useState("");
  const [editingCategory,setEditingCategory]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const loadCategories=async()=>{try{setCategories(await window.mms.donations.categoriesAll()||[]);}catch{setCategories([]);}};
  useEffect(()=>{
    Promise.all([window.mms.settings.load(),window.mms.donations.categoriesAll()]).then(([s,c])=>{
      if(s)setSettings({...emptySettings,...s,language:s.language||lang,theme:s.theme||theme,subscription_monthly_amount:Number(s.subscription_monthly_amount??100),subscription_frequency:(s.subscription_frequency==="Quarterly"?"Quarterly":"Monthly")});
      setCategories(c||[]);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  const handleSave=async()=>{
    setSaving(true);
    try{
      await window.mms.settings.save({
        mahalluName:settings.mahallu_name,address:settings.address,phone:settings.phone,email:settings.email,
        financialYearStart:settings.financial_year_start,currencySymbol:settings.currency_symbol,
        subscriptionMonthlyAmount:Number(settings.subscription_monthly_amount||0),subscriptionFrequency:settings.subscription_frequency,
        theme:settings.theme,language:settings.language,autoBackup:settings.auto_backup,backupIntervalHours:settings.backup_interval_hours,
        receiptPrefix:settings.receipt_prefix,
        affiliationNumber:settings.affiliation_number, committeeTermStart:settings.committee_term_start, committeeTermEnd:settings.committee_term_end,
        wakfRegNo:settings.wakf_reg_no, societyRegNo:settings.society_reg_no,
        village:settings.village, panchayath:settings.panchayath, taluk:settings.taluk,
        district:settings.district, pincode:settings.pincode, state:settings.state
      });
      toast.success(t("ui_save_changes"));
    }catch(err:any){toast.error(err.message||t("ui_failed_save"));}
    finally{setSaving(false);}
  };
  const saveCategory=async()=>{
    if(!categoryName.trim())return toast.error("Category name is required");
    try{
      if(editingCategory) await window.mms.donations.updateCategory(editingCategory,categoryName.trim(),categoryDescription.trim());
      else await window.mms.donations.createCategory(categoryName.trim(),categoryDescription.trim());
      setCategoryName("");setCategoryDescription("");setEditingCategory(null);await loadCategories();toast.success(editingCategory?"Category updated":"Category added");
    }catch(err:any){toast.error(err.message||"Unable to save category");}
  };
  const editCategory=(c:Category)=>{setEditingCategory(c.id);setCategoryName(c.name);setCategoryDescription(c.description||"");};
  const toggleCategory=async(c:Category)=>{try{await window.mms.donations.setCategoryActive(c.id,!c.is_active);await loadCategories();}catch(err:any){toast.error(err.message);}};
  const deleteCategory=async(c:Category)=>{
    if(c.donation_count>0)return toast.error("This category has donations and cannot be deleted. Deactivate it instead.");
    if(!window.confirm(`Delete category \"${c.name}\"?`))return;
    try{await window.mms.donations.removeCategory(c.id);await loadCategories();toast.success("Category deleted");}catch(err:any){toast.error(err.message);}
  };
  const handleThemeChange=(value:string)=>{setTheme(value as "light"|"dark");setSettings({...settings,theme:value});};
  const handleLangChange=(value:string)=>{setLang(value as "en"|"ml");setSettings({...settings,language:value});};
  if(loading)return <div className="p-6"><p className="text-sm text-text-tertiary">{t("ui_loading_settings")}</p></div>;
  return <div className="p-6 max-w-5xl space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-medium text-text-primary">{t("set_title")}</h1><p className="text-sm text-text-secondary mt-1">{t("set_subtitle")}</p></div><Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4"/>{saving?t("ui_saving"):t("ui_save_changes")}</Button></div>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary"/><SectionLabel className="mb-0">{t("set_org_section")}</SectionLabel></div><div className="grid grid-cols-2 gap-4"><div><Label>{t("set_mahallu_name")}</Label><MalayalamInput value={settings.mahallu_name} onChange={value=>setSettings({...settings,mahallu_name:value})}/></div><div><Label>{t("set_phone")}</Label><Input value={settings.phone} onChange={e=>setSettings({...settings,phone:e.target.value})}/></div><div><Label>{t("set_email")}</Label><Input type="email" value={settings.email} onChange={e=>setSettings({...settings,email:e.target.value})}/></div><div><Label>{t("set_committee_term_start")}</Label><Input type="date" value={settings.committee_term_start} onChange={e=>setSettings({...settings,committee_term_start:e.target.value})}/></div><div><Label>{t("set_committee_term_end")}</Label><Input type="date" value={settings.committee_term_end} onChange={e=>setSettings({...settings,committee_term_end:e.target.value})}/></div><div className="col-span-2"><Label>{t("family_address")}</Label><Textarea rows={2} value={settings.address} onChange={e=>setSettings({...settings,address:e.target.value})}/></div></div>
    <div className="pt-2 border-t border-border"><div className="flex items-center gap-2 mb-3"><Award className="h-4 w-4 text-primary"/><SectionLabel className="mb-0">{t("set_reg_section")}</SectionLabel></div><p className="text-xs text-text-tertiary mb-3">{t("set_reg_hint")}</p><div className="grid grid-cols-3 gap-4"><div><Label>{t("set_smf_reg_no")}</Label><Input value={settings.affiliation_number} onChange={e=>setSettings({...settings,affiliation_number:e.target.value})} placeholder="SMF / Registration No."/></div><div><Label>{t("set_wakf_reg_no")}</Label><Input value={settings.wakf_reg_no} onChange={e=>setSettings({...settings,wakf_reg_no:e.target.value})} placeholder="Wakf Board Reg. No."/></div><div><Label>{t("set_society_reg_no")}</Label><Input value={settings.society_reg_no} onChange={e=>setSettings({...settings,society_reg_no:e.target.value})} placeholder="Societies Reg. No."/></div></div></div>
    <div className="pt-2 border-t border-border"><div className="flex items-center gap-2 mb-3"><MapPin className="h-4 w-4 text-primary"/><SectionLabel className="mb-0">{t("set_location_section")}</SectionLabel></div><p className="text-xs text-text-tertiary mb-3">{t("set_location_hint")}</p><div className="grid grid-cols-3 gap-4"><div><Label>{t("set_village")}</Label><Input value={settings.village} onChange={e=>setSettings({...settings,village:e.target.value})}/></div><div><Label>{t("set_panchayath")}</Label><Input value={settings.panchayath} onChange={e=>setSettings({...settings,panchayath:e.target.value})}/></div><div><Label>{t("set_taluk")}</Label><Input value={settings.taluk} onChange={e=>setSettings({...settings,taluk:e.target.value})}/></div><div><Label>{t("set_district")}</Label><Input value={settings.district} onChange={e=>setSettings({...settings,district:e.target.value})}/></div><div><Label>{t("set_pincode")}</Label><Input value={settings.pincode} onChange={e=>setSettings({...settings,pincode:e.target.value})}/></div><div><Label>{t("set_state")}</Label><Input value={settings.state} onChange={e=>setSettings({...settings,state:e.target.value})}/></div></div></div></CardContent></Card>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary"/><SectionLabel className="mb-0">Financial & Subscription</SectionLabel></div><div className="grid grid-cols-4 gap-4"><div><Label>{t("set_financial_year_start")}</Label><Input value={settings.financial_year_start} onChange={e=>setSettings({...settings,financial_year_start:e.target.value})}/></div><div><Label>{t("set_currency_symbol")}</Label><Input value={settings.currency_symbol} onChange={e=>setSettings({...settings,currency_symbol:e.target.value})}/></div><div><Label>{t("set_receipt_prefix")}</Label><Input value={settings.receipt_prefix} onChange={e=>setSettings({...settings,receipt_prefix:e.target.value})}/></div><div><Label>Subscription frequency</Label><Select value={settings.subscription_frequency} onChange={e=>setSettings({...settings,subscription_frequency:e.target.value as "Monthly"|"Quarterly"})}><option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option></Select></div><div><Label>{settings.subscription_frequency === "Quarterly" ? "Quarterly Subscription Amount" : "Monthly Subscription Amount"}</Label><Input type="number" min="0" value={settings.subscription_monthly_amount} onChange={e=>setSettings({...settings,subscription_monthly_amount:Number(e.target.value)})}/></div></div><p className="text-xs text-text-tertiary">The selected frequency controls automatic pending subscriptions. Every active family gets one pending subscription for each due period. Monthly creates one per calendar month; Quarterly creates one for Jan–Mar, Apr–Jun, Jul–Sep and Oct–Dec. Existing paid/pending records are never duplicated.</p></CardContent></Card>

    <Card><CardContent className="p-6 space-y-5"><div className="flex items-center gap-2"><Tags className="h-5 w-5 text-primary"/><SectionLabel className="mb-0">Donation Categories</SectionLabel></div><div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end"><div><Label>Category name</Label><Input value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="e.g. Masjid Maintenance"/></div><div><Label>Description</Label><Input value={categoryDescription} onChange={e=>setCategoryDescription(e.target.value)} placeholder="Optional"/></div><div className="flex gap-2"><Button onClick={saveCategory}><Plus className="h-4 w-4"/>{editingCategory?"Update":"Add"}</Button>{editingCategory&&<Button variant="secondary" onClick={()=>{setEditingCategory(null);setCategoryName("");setCategoryDescription("");}}>Cancel</Button>}</div></div><div className="border border-border rounded-lg overflow-hidden"><div className="grid grid-cols-[1fr_1fr_110px_120px] px-4 py-2 text-xs text-text-tertiary bg-surface-muted"><span>Category</span><span>Description</span><span>Status</span><span className="text-right">Actions</span></div>{categories.map(c=><div key={c.id} className="grid grid-cols-[1fr_1fr_110px_120px] px-4 py-3 border-t border-border items-center text-sm"><span className="font-medium">{c.name}</span><span className="text-text-secondary">{c.description||"—"}</span><span className={c.is_active?"text-success":"text-text-tertiary"}>{c.is_active?"Active":"Inactive"}</span><div className="flex justify-end gap-1"><button className="act-btn act-edit" title="Edit" onClick={()=>editCategory(c)}><Pencil className="h-4 w-4"/></button><button className="act-btn" title={c.is_active?"Deactivate":"Activate"} onClick={()=>toggleCategory(c)}><Power className="h-4 w-4"/></button><button className="act-btn act-del" title={c.donation_count>0?"Cannot delete: donations exist":"Delete"} disabled={c.donation_count>0} onClick={()=>deleteCategory(c)}><Trash2 className="h-4 w-4"/></button></div></div>)}</div><p className="text-xs text-text-tertiary">A category with at least one donation can never be deleted. It can only be renamed or deactivated, preserving the financial history.</p></CardContent></Card>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary"/><SectionLabel className="mb-0">{t("set_appearance_section")}</SectionLabel></div><div className="grid grid-cols-2 gap-4"><div><Label>{t("set_theme")}</Label><Select value={settings.theme} onChange={e=>handleThemeChange(e.target.value)}><option value="light">{t("set_theme_light")}</option><option value="dark">{t("set_theme_dark")}</option></Select></div><div><Label>{t("set_language")}</Label><Select value={lang} onChange={e=>handleLangChange(e.target.value)}><option value="en">{t("set_lang_english")}</option><option value="ml">{t("set_lang_malayalam")}</option></Select></div></div></CardContent></Card>

    <Card><CardContent className="p-6 space-y-4"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary"/><SectionLabel className="mb-0">{t("set_backup_section")}</SectionLabel></div><div className="space-y-4"><div className="flex items-center justify-between"><div><Label className="mb-0">{t("set_auto_backup")}</Label><p className="text-xs text-text-tertiary mt-1">{t("ui_auto_backup_desc")}</p></div><Switch checked={settings.auto_backup} onCheckedChange={v=>setSettings({...settings,auto_backup:v})}/></div><div className="w-48"><Label>{t("set_backup_interval")}</Label><Input type="number" value={settings.backup_interval_hours} onChange={e=>setSettings({...settings,backup_interval_hours:Number(e.target.value)})}/></div></div></CardContent></Card>
    <div className="flex justify-end"><Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4"/>{saving?t("ui_saving"):t("ui_save_changes")}</Button></div>
  </div>;
}
