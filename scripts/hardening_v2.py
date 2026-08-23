from pathlib import Path


def edit(path, fn):
    p = Path(path)
    if not p.exists():
        return
    s = p.read_text(encoding="utf-8")
    n = fn(s)
    if n != s:
        p.write_text(n, encoding="utf-8")


def security_ipc(s):
    old = '  const actor = (): Actor => { const current=getActor(); if(!current) throw new Error("Authentication is required for this operation"); return current; };'
    new = '''  const actor = (): Actor => {
    const current = getActor();
    if (current) return current;
    const authActor = (globalThis as any).__mmsGetActor?.() as Actor | null | undefined;
    if (authActor) return authActor;
    throw new Error("Authentication is required for this operation");
  };'''
    s = s.replace(old, new, 1)
    s = s.replace('  register("settings:save",(d:any)=>{admin();return data.settings.save(d);});',
                  '  register("settings:save",(d:any)=>{const a=actor();return data.settings.save({...d, updatedBy:a.id});});', 1)
    return s


def token_generation(s):
    old = '''function generateTokenCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return code;
}'''
    new = '''function generateTokenCode(): string {
  const bytes = randomBytes(4);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return code;
}'''
    return s.replace(old, new, 1)


def member_archive_filter(s):
    old = '''    if (filter.status && filter.status !== "All") {
      where.push("m.status = ?");
      params.push(filter.status);
    }'''
    new = '''    if (filter.status && filter.status !== "All") {
      if (filter.status === "Archived") {
        where.push("m.archive_state = 1");
      } else {
        where.push("m.archive_state = 0 AND m.status = ?");
        params.push(filter.status);
      }
    }'''
    return s.replace(old, new, 1)


def member_family_filter_ui(s):
    old = 'families.filter(f=>f.status!=="Archived").map(f=><option key={f.id} value={String(f.id)}>{f.house_name} ({f.family_number})</option>)'
    new = 'families.filter(f=>statusFilter==="Archived" ? f.status==="Archived" : f.status!=="Archived").map(f=><option key={f.id} value={String(f.id)}>{f.house_name} ({f.family_number})</option>)'
    return s.replace(old, new, 1)


def unify_logo_assets(s):
    return s.replace('src="./logo.png"', 'src="./logo.svg"')


edit("electron/security-ipc.ts", security_ipc)
edit("electron/services/data.service.ts", token_generation)
edit("electron/services/data.service.ts", member_archive_filter)
edit("src/pages/Members.tsx", member_family_filter_ui)
edit("src/components/layout/Sidebar.tsx", unify_logo_assets)
edit("src/pages/LoginPage.tsx", unify_logo_assets)
edit("src/components/Splash.tsx", unify_logo_assets)
