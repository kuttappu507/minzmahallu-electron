/* Offline Malayalam phonetic transliteration. No network/API/model required. */
const vowels: Record<string,string> = {
  aa:'ആ', a:'അ', ii:'ഈ', ee:'ഈ', i:'ഇ', uu:'ഊ', oo:'ഓ', u:'ഉ', e:'എ', ai:'ഐ', o:'ഒ', au:'ഔ',
};
const consonants: Record<string,string> = {
  kh:'ഖ', gh:'ഘ', chh:'ഛ', ch:'ച', jh:'ഝ', j:'ജ', thh:'ഠ', dhh:'ഢ', th:'ത', dh:'ദ', ph:'ഫ', bh:'ഭ',
  shh:'ഷ', sh:'ശ', zh:'ഴ', ng:'ങ', nj:'ഞ', ny:'ഞ', tt:'ട്ട', dd:'ഡ', nn:'ണ', n:'ന', m:'മ', y:'യ', r:'ര', l:'ല', v:'വ', w:'വ',
  s:'സ', h:'ഹ', k:'ക', g:'ഗ', c:'ക', q:'ഖ', x:'ക്സ', z:'സ്', p:'പ', b:'ബ', t:'ട', d:'ഡ', f:'ഫ',
};
const signs: Record<string,string> = { a:'', aa:'ാ', i:'ി', ii:'ീ', u:'ു', uu:'ൂ', e:'െ', ee:'േ', ai:'ൈ', o:'ൊ', oo:'ോ', au:'ൌ' };
const common: Record<string,string> = {
  malayalam:'മലയാളം', mahallu:'മഹല്ല്', mahall:'മഹല്ല്', muslimeen:'മുസ്ലിം', muslim:'മുസ്ലിം',
  muhammed:'മുഹമ്മദ്', muhammad:'മുഹമ്മദ്', mohammed:'മുഹമ്മദ്', abdul:'അബ്ദുൽ', rahman:'റഹ്മാൻ', rahmaan:'റഹ്മാൻ',
  hidayath:'ഹിദായത്ത്', hidayathul:'ഹിദായത്തുൽ', islam:'ഇസ്‌ലാം', masjid:'മസ്ജിദ്', madrasa:'മദ്റസ',
  qaswa:'ഖസ്വ', eid:'ഈദ്', ramadan:'റമദാൻ', dua:'ദുആ', janaza:'ജനാസ', nikah:'നികാഹ്', qazi:'ഖാസി',
  family:'കുടുംബം', house:'വീട്', ward:'വാർഡ്', venue:'വേദി', jamaath:'ജമാഅത്ത്', jamaat:'ജമാഅത്ത്',
};

function transliterateWord(input: string): string {
  const key = input.toLowerCase();
  if (common[key]) return common[key];
  let out = '', i = 0, pending = false;
  const ordered = Object.keys(consonants).sort((a,b)=>b.length-a.length);
  while (i < key.length) {
    if (/[^a-z']/i.test(key[i])) { out += key[i]; i++; continue; }
    let c = ordered.find(x => key.startsWith(x, i));
    if (c) {
      out += consonants[c]; i += c.length; pending = true;
      const v = ['aa','ii','ee','uu','oo','ai','au','a','i','u','e','o'].find(x => key.startsWith(x, i));
      if (v) { out += signs[v]; i += v.length; pending = false; }
      else if (i < key.length && /[a-z]/.test(key[i])) { out += '്'; }
      continue;
    }
    const v = ['aa','ii','ee','uu','oo','ai','au','a','i','u','e','o'].find(x => key.startsWith(x, i));
    if (v) { out += vowels[v]; i += v.length; pending = false; continue; }
    out += key[i]; i++;
  }
  return out;
}

export function transliterateMalayalam(value: string): string {
  return value.split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : transliterateWord(part)).join('');
}

export function transliterateIfLatin(value: string): string {
  return /[A-Za-z]/.test(value) && !/[\u0D00-\u0D7F]/.test(value) ? transliterateMalayalam(value) : value;
}