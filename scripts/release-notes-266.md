# MMS v2.6.6 — Faster Splash & Smoother Login / വേഗതയേറിയ സ്പ്ലാഷ്, സുഗമമായ ലോഗിൻ

## English

**Startup & Login performance fixes (office feedback: "double click takes seconds to show splash" + "one time freeze when inputing login details")**

- **Splash appears faster than ever** — the splash window is now created and shown with *zero* work before it: no file reads, no HTML building. The brand logo loads in a beat after the splash is already on screen (the letter mark paints first), so nothing can stand between the double-click and the first teal pixel.
- **Fixed the one-time freeze while typing login details** — Chromium's spellchecking service used to start on the very first keystroke of the login form (a one-time stall of up to ~2 seconds on some machines). Spellcheck is now disabled app-wide: every input in MMS is a username, password, name or amount — it was pure cost.
- **Full priority for background windows** — the hidden window that loads during the splash (and the print window) no longer run at Chromium's reduced "background" priority, so the app reaches the login screen and its first frames sooner on slower CPUs.
- **Cheaper login-page painting** — the soft decorative glows on the login page no longer use blur filters (the most expensive paint operation on software rendering); they use gradients that look the same and paint in a fraction of the time.

Upgrade is recommended for every machine. Install over the existing version — data, backups and WhatsApp pairing are untouched.

## മലയാളം

**സ്റ്റാർട്ടപ്പ് & ലോഗിൻ പ്രവർത്തന തിരുത്തലുകൾ (ഓഫീസ് റിപ്പോർട്ട്: "ഡബിൾ ക്ലിക്കിന് ശേഷം സ്പ്ലാഷ് വരാൻ നേരം എടുക്കുന്നു", "ലോഗിൻ വിവരങ്ങൾ ടൈപ്പ് ചെയ്യുമ്പോൾ ഒരിക്കൽ ഫ്രീസ് ആകുന്നു")**

- **സ്പ്ലാഷ് ഇതിനേക്കാൾ വേഗത്തിൽ** — സ്പ്ലാഷ് വിൻഡോ ഇപ്പോൾ യാതൊരു ജോലിയും ചെയ്യാതെ ഉടനടി തന്നെ സ്ക്രീനിൽ വരുന്നു. ലോഗോ അതിനുശേഷം ഒരു നിമിഷം കൊണ്ട് വരും; ഡബിൾ ക്ലിക്കും ആദ്യ പിക്സലും ഇടയിൽ ഒന്നും തന്നെ ഇല്ല.
- **ലോഗിൻ ടൈപ്പ് ചെയ്യുമ്പോഴുണ്ടാകുന്ന ഒറ്റത്തവണ ഫ്രീസ് പരിഹരിച്ചു** — ലോഗിൻ ഫോമിലെ ആദ്യ അക്ഷരം ടൈപ്പ് ചെയ്യുമ്പോൾ Chromium-ന്റെ സ്പെൽചെക്ക് സർവീസ് ആരംഭിക്കുന്നതായിരുന്നു കാരണം (ചില സിസ്റ്റങ്ങളിൽ ~2 സെക്കൻഡ് വരെ നിർത്തും). MMS-ൽ എല്ലാ ഇൻപുട്ടുകളും യൂസർനെയിം/പാസ്വേഡ്/പേര്/തുക ആയതിനാൽ സ്പെൽചെക്ക് പൂർണ്ണമായി ഓഫ് ആക്കി.
- **പശ്ചാത്തല വിൻഡോകൾക്ക് പൂർണ്ണ പ്രിയോരിറ്റി** — സ്പ്ലാഷ് സമയത്ത് ലോഡ് ആകുന്ന മറഞ്ഞിരിക്കുന്ന വിൻഡോയ്ക്കും പ്രിന്റ് വിൻഡോയ്ക്കും കുറഞ്ഞ പ്രിയോരിറ്റി ഇനി നൽകില്ല; പതിഞ്ഞ സിസ്റ്റങ്ങളിൽ ലോഗിൻ സ്ക്രീൻ വേഗത്തിൽ എത്തും.
- **ലോഗിൻ പേജിന്റെ പെയിന്റിംഗ് ചെലവ് കുറച്ചു** — ലോഗിൻ പേജിലെ അലങ്കാര ഗ്ലോകൾ ഇനി blur ഫിൽട്ടർ ഉപയോഗിക്കുന്നില്ല; ഒരേ രൂപത്തിൽ വളരെ വേഗം വരയ്ക്കുന്ന gradient ആണ് ഉപയോഗിക്കുന്നത്.

എല്ലാ സിസ്റ്റങ്ങളിലും അപ്ഡേറ്റ് ചെയ്യാൻ ശുപാർശ ചെയ്യുന്നു. നിലവിലുള്ള പതിപ്പിന് മുകളിൽ ഇൻസ്റ്റാൾ ചെയ്യുക — ഡാറ്റ, ബാക്കപ്പ്, WhatsApp പെയറിംഗ് എന്നിവ മാറ്റമില്ലാതെ സൂക്ഷിക്കപ്പെടും.
