import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { Label, Select } from "@/components/ui";

/**
 * Shared "link an existing mahallu member" picker used by the Staff and
 * Committee add/edit dialogs (user report: the staff preview showed the
 * linked member but the form had no way to set it, and a flat member list
 * alone was hard to search in big mahallus).
 *
 * Two selects: an optional FAMILY filter on top, then the member link —
 * picking a family narrows the member list so the right person is found in
 * seconds. Data is loaded fresh every time the parent dialog opens (Dialog
 * unmounts its children when closed), so newly added families/members are
 * always in the list.
 *
 * `onPick` receives the FULL member row (or null when the link is cleared)
 * so each page can auto-fill whatever fields it wants from it.
 */
export function MemberLinkPicker({ value, onPick }: {
  value: number | null;
  onPick: (member: any | null) => void;
}) {
  const { isMalayalam } = useI18n();
  const tx = (en: string, ml: string) => isMalayalam() ? ml : en;

  const [families, setFamilies] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState("");

  useEffect(() => {
    window.mms.families.list({ page: 1, pageSize: 10000 }).then(r => setFamilies(r.rows || [])).catch(() => setFamilies([]));
    window.mms.members.list({ page: 1, pageSize: 10000 }).then(r => setMembers((r.rows || []).filter((m: any) => !m.archive_state))).catch(() => setMembers([]));
  }, []);

  // Members of the chosen family only (all members when no family is picked).
  const filtered = useMemo(() => {
    if (!familyId) return members;
    return members.filter(m => String(m.family_id) === familyId);
  }, [members, familyId]);

  const pick = (v: string) => {
    const m = v ? members.find(x => String(x.id) === v) || null : null;
    onPick(m);
  };

  const changeFamily = (fid: string) => {
    setFamilyId(fid);
    // If the currently linked member is not inside the narrowed list, the
    // select would silently show a blank — clear the link instead so the
    // form never keeps an invisible member_id.
    if (value && !members.some(m => String(m.id) === String(value) && String(m.family_id) === fid)) {
      onPick(null);
    }
  };

  return (
    <>
      <div>
        <Label>{tx("Family", "കുടുംബം")}</Label>
        <Select value={familyId} onChange={e => changeFamily(e.target.value)}>
          <option value="">{tx("All families", "എല്ലാ കുടുംബങ്ങളും")}</option>
          {families.map(f => (
            <option key={f.id} value={String(f.id)}>
              {f.family_number}{f.house_name ? ` · ${f.house_name}` : ""}{f.head_name ? ` — ${f.head_name}` : ""}
            </option>
          ))}
        </Select>
        <div className="text-xs text-muted mt-1.5">{tx("Pick a family first to shorten the member list.", "ആദ്യം കുടുംബം തിരഞ്ഞെടുത്താൽ അംഗ പട്ടിക എളുപ്പത്തിൽ ചുരുങ്ങും.")}</div>
      </div>
      <div>
        <Label>{tx("Link an existing mahallu member — details fill in automatically", "നിലവിലുള്ള അംഗത്തെ ബന്ധിപ്പിക്കുക — വിവരങ്ങൾ സ്വയമേവ ലഭിക്കും")}</Label>
        <Select value={value ? String(value) : ""} onChange={e => pick(e.target.value)}>
          <option value="">{tx("— new entry (no member link)", "— പുതിയ വിവരം (അംഗ ലിങ്ക് ഇല്ല)")}</option>
          {filtered.map(m => <option key={m.id} value={String(m.id)}>{m.name} ({m.member_code})</option>)}
        </Select>
        <div className="text-xs text-muted mt-1.5">{tx("Name, phone and address are taken from the member record; you can still adjust them.", "പേര്, ഫോൺ, വിലാസം എന്നിവ അംഗ രേഖയിൽ നിന്ന് എടുക്കും; ആവശ്യമെങ്കിൽ മാറ്റാവുന്നതാണ്.")}</div>
      </div>
    </>
  );
}
