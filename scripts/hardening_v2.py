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
    // Keep the actor resilient if the renderer/session mirror is briefly out of sync.
    const authActor = (globalThis as any).__mmsGetActor?.() as Actor | null | undefined;
    if (authActor) return authActor;
    throw new Error("Authentication is required for this operation");
  };'''
    s = s.replace(old, new, 1)
    s = s.replace('  register("settings:save",(d:any)=>{admin();return data.settings.save(d);});',
                  '  register("settings:save",(d:any)=>{const a=actor();return data.settings.save({...d, updatedBy:a.id});});', 1)
    return s


def token_generation(s):
    # Keep generated tokens random, four characters, and use the database unique index as the final guard.
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


edit("electron/security-ipc.ts", security_ipc)
edit("electron/services/data.service.ts", token_generation)
