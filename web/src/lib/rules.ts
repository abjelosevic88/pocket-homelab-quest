// The character rules (SRD 5.1): everything a sheet shows is worked out
// here from what the player chose (the Sheet) and the rules content.
import type { Rules } from './srd'
import { mod } from './srd'
import type { Ability, Character, ClassLevel, Equipment, Feature, InvItem, Klass, Resource, Sheet, Spell } from './types'
import { ABILITIES } from './types'

export const LEVEL_XP = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]
export const levelForXP = (xp: number) => LEVEL_XP.reduce((lv, need, i) => (xp >= need ? i + 1 : lv), 1)
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
export const avgHitDie = (die: number) => die / 2 + 1

export const POINT_BUY: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
export const FULL_CASTERS = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']
export const HALF_CASTERS = ['paladin', 'ranger']
export const PREPARES = ['cleric', 'druid', 'wizard', 'paladin'] // the rest know their spells
export const SUBCLASS_FEATURES = ['primal-path', 'bard-college', 'divine-domain', 'druid-circle', 'martial-archetype', 'monastic-tradition', 'sacred-oath', 'ranger-archetype', 'roguish-archetype', 'sorcerous-origin', 'otherworldly-patron', 'arcane-tradition']

export function newSheet(): Sheet {
  return {
    v: 1, species: '', subspecies: '', background: '', background_name: '', alignment: '', classes: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    bonus_choice: [], asi: [], skills: [], expertise: [], save_profs: [], langs: ['common'], tools: [], profs_extra: '',
    hp: { cur: 1, temp: 0, bonus: 0 }, hit_dice_used: {}, death: { ok: 0, fail: 0 }, conditions: [], exhaustion: 0, inspiration: false, xp: 0,
    ac_bonus: 0, ac_override: 0, speed_bonus: 0, init_bonus: 0, inventory: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, spells: [],
    slots_used: [0, 0, 0, 0, 0, 0, 0, 0, 0], pact_used: 0, resources: [], feats: [], features_extra: [], attacks_extra: [], choices: {}, traits: {}, bio: {},
  }
}

/** A sheet as saved can miss fields (older, hand-made, imported): fill them. */
export function normalizeSheet(s: Partial<Sheet> | undefined): Sheet {
  const base = newSheet()
  const out = { ...base, ...(s || {}) } as Sheet
  out.abilities = { ...base.abilities, ...(s?.abilities || {}) }
  out.hp = { ...base.hp, ...(s?.hp || {}) }
  out.death = { ...base.death, ...(s?.death || {}) }
  out.coins = { ...base.coins, ...(s?.coins || {}) }
  for (const k of ['classes', 'bonus_choice', 'asi', 'skills', 'expertise', 'save_profs', 'langs', 'tools', 'conditions', 'inventory', 'spells', 'resources', 'feats', 'features_extra', 'attacks_extra'] as const) {
    if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = []
  }
  if (!Array.isArray(out.slots_used) || out.slots_used.length !== 9) out.slots_used = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  out.choices = out.choices || {}
  out.traits = out.traits || {}
  out.bio = out.bio || {}
  out.hit_dice_used = out.hit_dice_used || {}
  return out
}

export const totalLevel = (s: Sheet) => Math.max(1, s.classes.reduce((n, c) => n + c.level, 0))
export const classLevel = (s: Sheet, key: string) => s.classes.find(c => c.key === key)?.level || 0
const hasSub = (s: Sheet, sub: string) => s.classes.some(c => c.sub === sub)
const chose = (s: Sheet, suffix: string) => Object.values(s.choices).some(l => l.some(k => k.endsWith(suffix)))

// ---- ability scores ----

export function scores(s: Sheet, r: Rules): Record<Ability, number> {
  const out = { ...s.abilities }
  const race = r.raceBy[s.species]
  const sub = race?.subraces.find(x => x.key === s.subspecies)
  for (const a of ABILITIES) out[a] += (race?.bonus[a] || 0) + (sub?.bonus[a] || 0)
  for (const a of s.bonus_choice) out[a] += 1
  for (const x of s.asi) {
    if (x.feat) continue
    if (x.a) out[x.a] += x.a === x.b ? 2 : 1
    if (x.b && x.b !== x.a) out[x.b] += 1
  }
  for (const a of ABILITIES) out[a] = Math.min(out[a], 20)
  // belts and headbands of giant strength / amulet of health set a score
  for (const it of s.inventory) {
    if (!it.magic || !(it.attuned || !needsAttune(it.magic))) continue
    const set = { 'amulet-of-health': ['con', 19], 'headband-of-intellect': ['int', 19], 'gauntlets-of-ogre-power': ['str', 19], 'belt-of-hill-giant-strength': ['str', 21],
      'belt-of-stone-giant-strength': ['str', 23], 'belt-of-frost-giant-strength': ['str', 23], 'belt-of-fire-giant-strength': ['str', 25], 'belt-of-cloud-giant-strength': ['str', 27], 'belt-of-storm-giant-strength': ['str', 29] }[it.magic] as [Ability, number] | undefined
    if (set && out[set[0]] < set[1]) out[set[0]] = set[1]
  }
  return out
}
const needsAttune = (_key: string) => true

// ---- proficiencies ----

/** The species' and subspecies' traits. */
export function raceTraits(s: Sheet, r: Rules): string[] {
  const race = r.raceBy[s.species]
  const sub = race?.subraces.find(x => x.key === s.subspecies)
  return [...(race?.traits || []), ...(sub?.traits || [])]
}

export function profKeys(s: Sheet, r: Rules): Set<string> {
  const out = new Set<string>()
  s.classes.forEach((c, i) => {
    const k = r.classBy[c.key]
    if (!k) return
    for (const p of i === 0 ? k.profs : k.mc_profs) out.add(p)
  })
  for (const t of raceTraits(s, r)) {
    const tr = r.traits[t]
    for (const p of tr?.profs || []) out.add(p)
    if (tr?.prof_choice) for (const p of s.choices[t] || []) out.add(p)
  }
  if (hasSub(s, 'life')) out.add('heavy-armor')
  for (const t of s.tools) out.add(t)
  return out
}

const normName = (n: string) => n.toLowerCase().replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.replace(/s$/, '')).sort().join(' ')

export function weaponProficient(eq: Equipment | undefined, profs: Set<string>, r: Rules): boolean {
  if (!eq?.weapon) return true
  if (profs.has(eq.weapon.cat + '-weapons')) return true
  const n = normName(eq.name)
  for (const p of profs) {
    const pr = r.proficiencies[p]
    if (pr && normName(pr.name) === n) return true
  }
  return false
}

export function armorProficient(eq: Equipment | undefined, profs: Set<string>): boolean {
  if (!eq?.armor) return true
  if (profs.has('all-armor') && eq.armor.cat !== 'shield') return true
  if (eq.armor.cat === 'shield') return profs.has('shields')
  return profs.has(eq.armor.cat + '-armor')
}

// ---- the whole sheet ----

export interface SkillLine { key: string; name: string; ability: Ability; bonus: number; prof: boolean; expert: boolean; half: boolean }
export interface Attack { name: string; bonus: number | null; dmg: string; type: string; notes: string; save?: string; crit: number; kind: 'weapon' | 'spell' | 'extra' | 'unarmed'; spell?: string; item?: string }
export interface Casting { cls: string; name: string; ability: Ability; mod: number; dc: number; attack: number; prepares: boolean; prepared: number; known: number; cantrips: number; maxLevel: number }
export interface FeatureLine { key: string; name: string; level: number; from: string; desc: string; choose?: { n: number; from: string[] } }
export interface Derived {
  level: number; pb: number; scores: Record<Ability, number>; mods: Record<Ability, number>
  saves: Record<Ability, { bonus: number; prof: boolean }>
  skills: SkillLine[]; pp: number; pinv: number; pins: number
  ac: number; acNote: string; hpMax: number; init: number; speed: number; speedNote: string
  hitDice: { die: number; total: number; used: number }[]
  classesText: string; speciesName: string; backgroundName: string; alignmentName: string
  casting: Casting[]; slots: number[]; pact: { level: number; count: number } | null
  attacks: Attack[]; features: FeatureLine[]
  armor: string[]; weapons: string[]; tools: string[]; langs: string[]
  carried: number; capacity: number; encumbrance: '' | 'encumbered' | 'heavily'
  resist: string[]; nextXP: number; xpLevel: number; warnings: string[]
}

export function compute(raw: Sheet, r: Rules, opts: { encumbrance?: boolean } = {}): Derived {
  const s = normalizeSheet(raw)
  const level = totalLevel(s)
  const pb = profBonus(level)
  const sc = scores(s, r)
  const mods = Object.fromEntries(ABILITIES.map(a => [a, mod(sc[a])])) as Record<Ability, number>
  const profs = profKeys(s, r)
  const first = r.classBy[s.classes[0]?.key]
  const race = r.raceBy[s.species]
  const sub = race?.subraces.find(x => x.key === s.subspecies)
  const warnings: string[] = []

  // saving throws
  const saveSet = new Set<Ability>([...(first?.saves || []), ...(s.save_profs || [])])
  const saveBonus = s.inventory.some(i => i.attuned && (i.magic === 'ring-of-protection' || i.magic === 'cloak-of-protection')) ? 1 : 0
  const auraOfProtection = classLevel(s, 'paladin') >= 6 ? Math.max(1, mods.cha) : 0
  const saves = Object.fromEntries(ABILITIES.map(a => [a, { prof: saveSet.has(a), bonus: mods[a] + (saveSet.has(a) ? pb : 0) + saveBonus + auraOfProtection }])) as Derived['saves']

  // skills
  const jack = classLevel(s, 'bard') >= 2
  const athlete = hasSub(s, 'champion') && classLevel(s, 'fighter') >= 7
  const skills: SkillLine[] = r.skills.map(sk => {
    const key = sk.key.replace(/^skill-/, '')
    const prof = s.skills.includes(key) || profs.has('skill-' + key)
    const expert = prof && s.expertise.includes(key)
    const half = !prof && (jack || (athlete && ['str', 'dex', 'con'].includes(sk.ability)))
    const bonus = mods[sk.ability] + (expert ? 2 * pb : prof ? pb : half ? (athlete && !jack ? Math.ceil(pb / 2) : Math.floor(pb / 2)) : 0)
    return { key, name: sk.name, ability: sk.ability, bonus, prof, expert, half }
  })
  const sk = (k: string) => skills.find(x => x.key === k)?.bonus || 0

  // armour class
  const eqOf = (it: InvItem) => (it.key ? r.equipBy[it.key] : undefined)
  const worn = s.inventory.find(i => i.equipped && i.kind === 'armor' && (eqOf(i)?.armor || i.ac))
  const shield = s.inventory.find(i => i.equipped && i.kind === 'shield')
  let ac = 10 + mods.dex
  let acNote = 'unarmoured'
  const wornEq = worn ? eqOf(worn) : undefined
  if (worn) {
    const a = wornEq?.armor
    if (a) {
      ac = a.base + (a.dex ? (a.max != null ? Math.min(mods.dex, a.max) : mods.dex) : 0) + (worn.bonus || 0)
      if (!armorProficient(wornEq, profs)) warnings.push(`Not proficient with ${wornEq!.name.toLowerCase()}: disadvantage on Strength and Dexterity rolls, and no spellcasting.`)
    } else ac = (worn.ac || 10) + (worn.bonus || 0)
    acNote = worn.name.toLowerCase()
  } else {
    const opts: [number, string][] = [[10 + mods.dex, 'unarmoured']]
    if (classLevel(s, 'barbarian')) opts.push([10 + mods.dex + mods.con, 'unarmoured defence'])
    if (classLevel(s, 'monk') && !shield) opts.push([10 + mods.dex + mods.wis, 'unarmoured defence'])
    if (hasSub(s, 'draconic')) opts.push([13 + mods.dex, 'draconic resilience'])
    opts.sort((x, y) => y[0] - x[0])
    ;[ac, acNote] = opts[0]
  }
  if (shield) {
    ac += 2 + (shield.bonus || 0)
    acNote += ', shield'
  }
  if (worn && chose(s, 'fighting-style-defense')) { ac += 1; acNote += ', defence' }
  ac += saveBonus + (s.ac_bonus || 0)
  if (s.ac_override > 0) { ac = s.ac_override; acNote = 'set by hand' }

  // hit points
  const con = mods.con
  let hpMax = 0
  s.classes.forEach((c, i) => {
    const hd = r.classBy[c.key]?.hd || 8
    for (let lv = 1; lv <= c.level; lv++) {
      const gain = i === 0 && lv === 1 ? hd : (c.hp[i === 0 ? lv - 2 : lv - 1] ?? avgHitDie(hd))
      hpMax += Math.max(1, gain + con)
    }
  })
  if (s.subspecies === 'hill-dwarf') hpMax += level
  if (hasSub(s, 'draconic')) hpMax += classLevel(s, 'sorcerer')
  hpMax = Math.max(1, hpMax + (s.hp.bonus || 0))

  // hit dice by size
  const dice = new Map<number, number>()
  for (const c of s.classes) { const hd = r.classBy[c.key]?.hd || 8; dice.set(hd, (dice.get(hd) || 0) + c.level) }
  const hitDice = [...dice.entries()].sort((a, b) => b[0] - a[0]).map(([die, total]) => ({ die, total, used: Math.min(total, s.hit_dice_used[String(die)] || 0) }))

  // speed and what is carried
  const carried = Math.round((s.inventory.reduce((n, i) => n + (i.w || 0) * (i.qty || 1), 0) + (s.coins.cp + s.coins.sp + s.coins.ep + s.coins.gp + s.coins.pp) / 50) * 10) / 10
  const capacity = sc.str * 15
  let speed = race?.speed || 30
  let speedNote = ''
  const heavy = wornEq?.armor?.cat === 'heavy'
  if (heavy && wornEq!.armor!.str > sc.str && s.species !== 'dwarf') { speed -= 10; speedNote = 'heavy armour without the Strength' }
  const monk = classLevel(s, 'monk')
  if (monk >= 2 && !worn && !shield) {
    const row = r.classBy.monk?.levels[monk - 1]
    speed += Number(row?.extra?.unarmored_movement || 0)
  }
  if (classLevel(s, 'barbarian') >= 5 && !heavy) speed += 10
  let encumbrance: Derived['encumbrance'] = ''
  if (opts.encumbrance) {
    if (carried > sc.str * 10) { encumbrance = 'heavily'; speed -= 20 } else if (carried > sc.str * 5) { encumbrance = 'encumbered'; speed -= 10 }
  } else if (carried > capacity) warnings.push(`Carrying ${carried} lb, more than ${capacity} lb.`)
  if (s.exhaustion >= 5) speed = 0
  else if (s.exhaustion >= 2) speed = Math.floor(speed / 2)
  speed = Math.max(0, speed + (s.speed_bonus || 0))

  // spellcasting
  const casting: Casting[] = []
  for (const c of s.classes) {
    const k = r.classBy[c.key]
    if (!k?.casting) continue
    if (c.level < (k.casting.level || 1)) continue
    const row = k.levels[c.level - 1]
    const ab = k.casting.ability
    const prepares = PREPARES.includes(c.key)
    let prepared = 0
    if (c.key === 'paladin') prepared = Math.max(1, mods[ab] + Math.floor(c.level / 2))
    else if (prepares) prepared = Math.max(1, mods[ab] + c.level)
    const slots = row?.slots || []
    const maxLevel = slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0)
    casting.push({ cls: c.key, name: k.name, ability: ab, mod: mods[ab], dc: 8 + pb + mods[ab], attack: pb + mods[ab], prepares, prepared, known: row?.known || 0, cantrips: row?.cantrips || 0, maxLevel })
  }
  // spell slots: one caster class uses its own table; several add up their caster levels (SRD multiclassing)
  let slots = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const slotters = s.classes.filter(c => FULL_CASTERS.includes(c.key) || (HALF_CASTERS.includes(c.key) && c.level >= 2))
  if (slotters.length === 1) slots = [...(r.classBy[slotters[0].key]?.levels[slotters[0].level - 1]?.slots || slots)]
  else if (slotters.length > 1) {
    const casterLevel = slotters.reduce((n, c) => n + (FULL_CASTERS.includes(c.key) ? c.level : Math.floor(c.level / 2)), 0)
    if (casterLevel > 0) slots = [...(r.classBy.wizard?.levels[Math.min(20, casterLevel) - 1]?.slots || slots)]
  }
  let pact: Derived['pact'] = null
  const wl = classLevel(s, 'warlock')
  if (wl) {
    const ws = r.classBy.warlock?.levels[wl - 1]?.slots || []
    const lvl = ws.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0)
    if (lvl) pact = { level: lvl, count: ws[lvl - 1] }
  }

  // attacks
  const attacks: Attack[] = []
  const crit = hasSub(s, 'champion') ? (classLevel(s, 'fighter') >= 15 ? 18 : classLevel(s, 'fighter') >= 3 ? 19 : 20) : 20
  const martialDie = monk ? Number((r.classBy.monk?.levels[monk - 1]?.extra?.martial_arts as { dice_value?: number } | undefined)?.dice_value || 4) : 0
  const rage = classLevel(s, 'barbarian') ? Number(r.classBy.barbarian?.levels[classLevel(s, 'barbarian') - 1]?.extra?.rage_damage_bonus || 2) : 0
  const meleeWeapons = s.inventory.filter(i => i.kind === 'weapon' && i.equipped && eqOf(i)?.weapon?.range === 'melee')
  for (const it of s.inventory.filter(i => i.kind === 'weapon' || (i.kind === 'magic' && i.dmg))) {
    const eq = eqOf(it)
    const w = eq?.weapon
    const props = w?.props || it.props || []
    const ranged = w?.range === 'ranged'
    const finesse = props.includes('finesse')
    const monkWeapon = monk > 0 && w && (it.key === 'shortsword' || (w.cat === 'simple' && w.range === 'melee' && !props.includes('two-handed') && !props.includes('heavy')))
    let ab: Ability = ranged ? 'dex' : 'str'
    if ((finesse || monkWeapon) && mods.dex > mods.str) ab = 'dex'
    const prof = weaponProficient(eq, profs, r)
    let bonus = mods[ab] + (prof ? pb : 0) + (it.bonus || 0)
    if (ranged && chose(s, 'fighting-style-archery')) bonus += 2
    let die = w?.dmg || it.dmg || '1d4'
    if (monkWeapon && martialDie && Number(die.split('d')[1] || 0) < martialDie) die = `1d${martialDie}`
    let dmgMod = mods[ab] + (it.bonus || 0)
    const notes: string[] = []
    if (!ranged && chose(s, 'fighting-style-dueling') && !props.includes('two-handed') && meleeWeapons.length <= 1) { dmgMod += 2; notes.push('dueling') }
    if (props.includes('versatile') && w?.two) notes.push(`${w.two} two-handed`)
    if (props.includes('light')) notes.push('light')
    if (props.includes('thrown') && w?.throw) notes.push(`thrown ${w.throw[0]}/${w.throw[1]} ft.`)
    else if (ranged && w?.reach) notes.push(`${w.reach}/${w.long} ft.`)
    else if (props.includes('reach')) notes.push('reach 10 ft.')
    if (rage && !ranged) notes.push(`+${rage} raging`)
    if (!prof) notes.push('not proficient')
    if (chose(s, 'fighting-style-great-weapon-fighting') && (props.includes('two-handed') || props.includes('versatile'))) notes.push('reroll 1s and 2s')
    attacks.push({ name: it.name, bonus, dmg: dmgMod ? `${die}${dmgMod > 0 ? '+' : '−'}${Math.abs(dmgMod)}` : die, type: w?.type || it.dmg_type || '', notes: notes.join(', '), crit, kind: 'weapon', item: it.id })
  }
  // unarmed strike
  const ua = monk ? Math.max(mods.str, mods.dex) : mods.str
  attacks.push({ name: 'Unarmed strike', bonus: ua + pb, dmg: monk ? `1d${martialDie}${ua ? (ua > 0 ? '+' : '−') + Math.abs(ua) : ''}` : String(Math.max(1, 1 + mods.str)), type: 'bludgeoning', notes: monk ? 'martial arts' : '', crit, kind: 'unarmed' })
  // sneak attack
  const rogue = classLevel(s, 'rogue')
  if (rogue) {
    const sa = r.classBy.rogue?.levels[rogue - 1]?.extra?.sneak_attack as { dice_count?: number; dice_value?: number } | undefined
    if (sa) attacks.push({ name: 'Sneak Attack', bonus: null, dmg: `${sa.dice_count}d${sa.dice_value}`, type: '', notes: 'once a turn, with advantage or an ally next to the target; finesse or ranged weapon', crit: 20, kind: 'extra' })
  }
  for (const x of s.attacks_extra) attacks.push({ name: x.name, bonus: x.bonus, dmg: x.dmg, type: x.type, notes: x.notes || '', crit, kind: 'extra' })

  // features
  const features: FeatureLine[] = []
  const seen = new Map<string, number>()
  const add = (key: string, from: string, f: Feature | undefined) => {
    if (!f) return
    const base = f.name.replace(/\s*\(.*\)\s*$/, '').trim()
    const line: FeatureLine = { key, name: f.name, level: f.level, from, desc: f.desc, choose: f.choose }
    const at = seen.get(base)
    if (at !== undefined && base !== 'Ability Score Improvement') features[at] = line
    else { seen.set(base, features.length); features.push(line) }
    for (const pick of s.choices[key] || []) {
      const pf = r.features[pick]
      if (pf) features.push({ key: pick, name: '· ' + pf.name.replace(/^.*?:\s*/, ''), level: f.level, from, desc: pf.desc })
    }
  }
  for (const c of s.classes) {
    const k = r.classBy[c.key]
    if (!k) continue
    for (const row of k.levels.slice(0, c.level)) for (const f of row.features) {
      if (/ability-score-improvement/.test(f)) continue
      add(f, k.name, r.features[f])
    }
    const sc2 = k.subclasses.find(x => x.key === c.sub)
    if (sc2) for (const row of sc2.levels) if (row.level <= c.level) for (const f of row.features) add(f, sc2.name, r.features[f])
  }
  for (const t of [...(race?.traits || []), ...(sub?.traits || [])]) {
    const tr = r.traits[t]
    if (!tr) continue
    features.push({ key: t, name: tr.name, level: 0, from: sub && sub.traits.includes(t) ? sub.name : race!.name, desc: tr.desc, choose: tr.choose ? { n: 1, from: tr.choose } : undefined })
    for (const pick of s.choices[t] || []) { const p = r.traits[pick]; if (p) features.push({ key: pick, name: '· ' + p.name.replace(/^.*\((.*)\)$/, '$1'), level: 0, from: race!.name, desc: p.desc }) }
  }
  const bg = r.backgrounds.find(b => b.key === s.background)
  if (bg) features.push({ key: 'bg', name: bg.feature.name, level: 0, from: bg.name, desc: bg.feature.desc })
  for (const f of s.feats) { const ft = r.feats.find(x => x.key === f); if (ft) features.push({ key: f, name: ft.name, level: 0, from: 'Feat', desc: ft.desc }) }
  for (const f of s.features_extra) features.push({ key: 'x-' + f.name, name: f.name, level: 0, from: 'Your own', desc: f.desc })

  // proficiency lists in words
  const armor: string[] = [], weapons: string[] = [], tools: string[] = []
  for (const p of profs) {
    const pr = r.proficiencies[p]
    if (!pr) { if (p) tools.push(p.replace(/-/g, ' ')); continue }
    if (pr.type === 'Armor') armor.push(pr.name)
    else if (pr.type === 'Weapons') weapons.push(pr.name)
    else if (!p.startsWith('skill-') && pr.type !== 'Skills' && pr.type !== 'Saving Throws') tools.push(pr.name)
  }
  const langs = s.langs.map(l => r.languages.find(x => x.key === l)?.name || l.replace(/-/g, ' '))

  // resistances
  const resist: string[] = []
  const anc = (s.choices['draconic-ancestry'] || [])[0]
  if (anc && r.traits[anc]?.damage) resist.push(r.traits[anc].damage!)
  if (s.species === 'tiefling') resist.push('fire')
  if (s.species === 'dwarf') resist.push('poison')

  const xpLevel = levelForXP(s.xp)
  const species = sub?.name || race?.name || ''
  const classesText = s.classes.map(c => {
    const k = r.classBy[c.key]
    const sc2 = k?.subclasses.find(x => x.key === c.sub)
    return `${k?.name || c.key} ${c.level}${sc2 ? ` (${sc2.name})` : ''}`
  }).join(' · ')
  return {
    level, pb, scores: sc, mods, saves, skills, pp: 10 + sk('perception'), pinv: 10 + sk('investigation'), pins: 10 + sk('insight'),
    ac, acNote, hpMax, init: mods.dex + (jack ? Math.floor(pb / 2) : athlete ? Math.ceil(pb / 2) : 0) + (s.init_bonus || 0), speed, speedNote, hitDice,
    classesText, speciesName: species, backgroundName: bg?.name || s.background_name || '', alignmentName: r.alignments.find(a => a.key === s.alignment)?.name || '',
    casting, slots, pact, attacks: [...attacks, ...spellAttacks(s, casting, level)], features, armor, weapons, tools, langs,
    carried, capacity, encumbrance, resist, nextXP: level < 20 ? LEVEL_XP[level] : 0, xpLevel, warnings,
  }
}

// cantrips and spells that hit or force a save, as attack lines (filled in when spells are loaded)
let spellIndex: Record<string, Spell> = {}
export function setSpellIndex(list: Spell[]) { spellIndex = Object.fromEntries(list.map(s => [s.key, s])) }

function spellAttacks(s: Sheet, casting: Casting[], level: number): Attack[] {
  const out: Attack[] = []
  for (const ref of s.spells) {
    const sp = spellIndex[ref.key]
    if (!sp || sp.level !== 0 || (!sp.attack && !sp.save)) continue
    const c = casting.find(x => x.cls === ref.cls) || casting[0]
    // racial cantrips use their own ability (high elf INT, tiefling CHA)
    const dmg = sp.dmg_char ? Object.entries(sp.dmg_char).filter(([lv]) => Number(lv) <= level).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1] || '' : ''
    if (!dmg) continue
    let d = dmg
    let note = sp.range
    if (sp.key === 'eldritch-blast') {
      const beams = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1
      const agon = c && Object.values(s.choices).some(l => l.includes('eldritch-invocation-agonizing-blast')) ? c.mod : 0
      d = agon ? `1d10+${agon}` : '1d10'
      note = `${beams} ${beams === 1 ? 'beam' : 'beams'}, each its own attack · ${sp.range}`
    }
    out.push({ name: sp.name, bonus: sp.attack && c ? c.attack : null, save: sp.save && c ? `DC ${c.dc} ${sp.save.toUpperCase()}` : undefined, dmg: d, type: sp.dmg_type || '', notes: note, crit: 20, kind: 'spell', spell: sp.key })
  }
  return out
}

// ---- class resources ----

export function expectedResources(s: Sheet, r: Rules): Resource[] {
  const sc = scores(s, r)
  const m = (a: Ability) => mod(sc[a])
  const out: Resource[] = []
  const row = (k: string) => r.classBy[k]?.levels[classLevel(s, k) - 1]
  const lv = (k: string) => classLevel(s, k)
  if (lv('barbarian')) out.push({ id: 'rage', name: 'Rage', max: lv('barbarian') >= 20 ? 99 : Number(row('barbarian')?.extra?.rage_count || 2), used: 0, reset: 'long' })
  if (lv('bard')) out.push({ id: 'bi', name: 'Bardic Inspiration', max: Math.max(1, m('cha')), used: 0, reset: lv('bard') >= 5 ? 'short' : 'long' })
  if (lv('cleric') >= 2) out.push({ id: 'cd', name: 'Channel Divinity', max: Number(row('cleric')?.extra?.channel_divinity_charges || 1), used: 0, reset: 'short' })
  if (lv('druid') >= 2) out.push({ id: 'ws', name: 'Wild Shape', max: 2, used: 0, reset: 'short' })
  if (lv('fighter')) out.push({ id: 'sw', name: 'Second Wind', max: 1, used: 0, reset: 'short' })
  if (lv('fighter') >= 2) out.push({ id: 'as', name: 'Action Surge', max: Number(row('fighter')?.extra?.action_surges || 1), used: 0, reset: 'short' })
  if (lv('fighter') >= 9) out.push({ id: 'ind', name: 'Indomitable', max: Number(row('fighter')?.extra?.indomitable_uses || 1), used: 0, reset: 'long' })
  if (lv('monk') >= 2) out.push({ id: 'ki', name: 'Ki', max: Number(row('monk')?.extra?.ki_points || lv('monk')), used: 0, reset: 'short' })
  if (lv('paladin')) {
    out.push({ id: 'ds', name: 'Divine Sense', max: 1 + Math.max(0, m('cha')), used: 0, reset: 'long' })
    out.push({ id: 'loh', name: 'Lay on Hands (hit points)', max: 5 * lv('paladin'), used: 0, reset: 'long' })
  }
  if (lv('paladin') >= 3) out.push({ id: 'cd', name: 'Channel Divinity', max: 1, used: 0, reset: 'short' })
  if (lv('sorcerer') >= 2) out.push({ id: 'sp', name: 'Sorcery Points', max: Number(row('sorcerer')?.extra?.sorcery_points || lv('sorcerer')), used: 0, reset: 'long' })
  if (lv('wizard')) out.push({ id: 'ar', name: 'Arcane Recovery', max: 1, used: 0, reset: 'long' })
  if (s.species === 'dragonborn') out.push({ id: 'bw', name: 'Breath Weapon', max: 1, used: 0, reset: 'short' })
  if (s.species === 'half-orc') out.push({ id: 're', name: 'Relentless Endurance', max: 1, used: 0, reset: 'long' })
  if (s.species === 'halfling') { /* Lucky has no uses */ }
  const byId = new Map<string, Resource>()
  for (const x of out) if (!byId.has(x.id)) byId.set(x.id, x)
  return [...byId.values()]
}

/** Bring a sheet's resources up to date: the class ones get their new maximum, the person's own stay. */
export function syncResources(s: Sheet, r: Rules): Resource[] {
  const want = expectedResources(s, r)
  const ids = new Set(want.map(w => w.id))
  const mine = s.resources.filter(x => !ids.has(x.id) && !KNOWN_IDS.includes(x.id))
  return [...want.map(w => { const had = s.resources.find(x => x.id === w.id); return { ...w, used: Math.min(had?.used || 0, w.max) } }), ...mine]
}
const KNOWN_IDS = ['rage', 'bi', 'cd', 'ws', 'sw', 'as', 'ind', 'ki', 'ds', 'loh', 'sp', 'ar', 'bw', 're']

// ---- rests ----

export function shortRest(s: Sheet): Sheet {
  return { ...s, pact_used: 0, resources: s.resources.map(x => (x.reset === 'short' ? { ...x, used: 0 } : x)) }
}

export function longRest(s: Sheet, d: Derived): Sheet {
  const used: Record<string, number> = {}
  // regain spent hit dice up to half your total (at least one)
  let regain = Math.max(1, Math.floor(d.level / 2))
  for (const h of d.hitDice) {
    const back = Math.min(h.used, regain)
    regain -= back
    used[String(h.die)] = h.used - back
  }
  return {
    ...s, hp: { ...s.hp, cur: d.hpMax, temp: 0 }, hit_dice_used: used, death: { ok: 0, fail: 0 }, slots_used: [0, 0, 0, 0, 0, 0, 0, 0, 0], pact_used: 0,
    exhaustion: Math.max(0, s.exhaustion - 1), resources: s.resources.map(x => ({ ...x, used: 0 })),
  }
}

// ---- levelling up ----

export function meetsMulticlass(k: Klass, sc: Record<Ability, number>): boolean {
  return k.mc_prereq.every(any => any.some(([a, min]) => sc[a] >= min))
}

export function subclassLevel(k: Klass): number {
  for (const row of k.levels) if (row.features.some(f => SUBCLASS_FEATURES.includes(f))) return row.level
  return 3
}

export function isASILevel(k: Klass, level: number): boolean {
  return !!k.levels[level - 1]?.features.some(f => /ability-score-improvement/.test(f))
}

/** The features a class gives at one of its levels (subclass ones included). */
export function featuresAt(k: Klass, sub: string, level: number, r: Rules): { key: string; f: Feature }[] {
  const out: { key: string; f: Feature }[] = []
  for (const f of k.levels[level - 1]?.features || []) if (r.features[f] && !/ability-score-improvement/.test(f)) out.push({ key: f, f: r.features[f] })
  const sc = k.subclasses.find(x => x.key === sub)
  for (const row of sc?.levels || []) if (row.level === level) for (const f of row.features) if (r.features[f]) out.push({ key: f, f: r.features[f] })
  return out
}

/** Add a level of a class to a sheet (hp = what this level adds before CON). */
export function addLevel(s: Sheet, cls: string, hp: number, sub?: string): Sheet {
  const classes: ClassLevel[] = s.classes.map(c => ({ ...c, hp: [...c.hp] }))
  const at = classes.find(c => c.key === cls)
  if (at) { at.level++; at.hp.push(hp); if (sub) at.sub = sub }
  else classes.push({ key: cls, level: 1, sub: sub || '', hp: classes.length === 0 ? [] : [hp] })
  return { ...s, classes }
}

// ---- spells ----

export function spellsFor(cls: string, list: Spell[]): Spell[] {
  return list.filter(sp => sp.classes.includes(cls))
}

/** The subclass's always-prepared spells up to a class level (Life domain, Devotion oath…). */
export function subclassSpells(k: Klass | undefined, sub: string, level: number): string[] {
  const sc = k?.subclasses.find(x => x.key === sub)
  if (!sc) return []
  return sc.spells.filter(([lv]) => { const n = Number(String(lv).replace(/\D/g, '')); return !n || n <= level }).map(([, key]) => key)
}

// ---- the columns a character list needs, from the sheet ----

export function columns(s: Sheet, d: Derived): Partial<Character> {
  const first = s.classes[0]
  return {
    level: d.level, classes: d.classesText, class_key: first?.key || '', species: d.speciesName, ac: d.ac, hp_max: d.hpMax,
    hp_cur: Math.min(s.hp.cur, d.hpMax), hp_temp: s.hp.temp, init: d.init, pp: d.pp, speed: d.speed, xp: s.xp,
  }
}

export const sumCoins = (c: Sheet['coins']) => c.cp / 100 + c.sp / 10 + c.ep / 2 + c.gp + c.pp * 10
export const newId = () => Math.random().toString(36).slice(2, 9)
export const fmtMod = (n: number) => (n >= 0 ? '+' + n : '−' + Math.abs(n))
