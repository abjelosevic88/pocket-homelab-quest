// The built-in rules content (SRD 5.1), loaded once per visit and kept.
import { useEffect, useState } from 'react'
import { api, V1 } from './api'
import type { Background, Equipment, Feature, Klass, MagicItem, Monster, MonsterRow, Named, Proficiency, Race, Skill, Spell, Trait } from './types'

const cache = new Map<string, Promise<unknown>>()

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load().catch(e => { cache.delete(key); throw e })
    cache.set(key, p)
  }
  return p
}

export interface Rules {
  classes: Klass[]; races: Race[]; backgrounds: Background[]; traits: Record<string, Trait>; features: Record<string, Feature>
  skills: Skill[]; proficiencies: Record<string, Proficiency>; languages: { key: string; name: string; type: string; script: string }[]
  alignments: { key: string; name: string; abbr: string; desc: string }[]; equipment: Equipment[]; equip_cats: Record<string, { name: string; items: string[] }>
  conditions: Named[]; damage_types: Named[]; weapon_props: Named[]; schools: Named[]; feats: { key: string; name: string; desc: string; prereq: { ability: string; min: number }[] }[]
  equipBy: Record<string, Equipment>; classBy: Record<string, Klass>; raceBy: Record<string, Race>; skillBy: Record<string, Skill>
}

const FILES = ['classes', 'races', 'backgrounds', 'traits', 'features', 'skills', 'proficiencies', 'languages', 'alignments', 'equipment', 'equip_cats', 'conditions', 'damage_types', 'weapon_props', 'schools', 'feats'] as const

/** Everything a character sheet and the builder need. */
export function loadRules(): Promise<Rules> {
  return once('rules', async () => {
    const parts = await Promise.all(FILES.map(f => api.get<unknown>(`${V1}/srd/file/${f}`)))
    const r = Object.fromEntries(FILES.map((f, i) => [f, parts[i]])) as unknown as Rules
    r.equipBy = Object.fromEntries(r.equipment.map(e => [e.key, e]))
    r.classBy = Object.fromEntries(r.classes.map(c => [c.key, c]))
    r.raceBy = Object.fromEntries(r.races.map(c => [c.key, c]))
    r.skillBy = Object.fromEntries(r.skills.map(c => [c.key.replace(/^skill-/, ''), c]))
    return r
  })
}

export function useRules(): Rules | null {
  const [r, setR] = useState<Rules | null>(null)
  useEffect(() => { let live = true; loadRules().then(x => { if (live) setR(x) }).catch(() => {}); return () => { live = false } }, [])
  return r
}

export const loadMonsters = () => once('monsters', () => api.get<{ monsters: MonsterRow[] }>(`${V1}/srd/monsters`).then(r => r.monsters))
export const reloadMonsters = () => { cache.delete('monsters') }
export const loadMonster = (ref: string) => once('m:' + ref, () => api.get<Monster>(`${V1}/srd/monsters/${encodeURIComponent(ref)}`))
export const forgetMonster = (ref: string) => { cache.delete('m:' + ref) }
export const loadSpells = () => once('spells', () => api.get<{ spells: Spell[] }>(`${V1}/srd/spells`).then(r => r.spells))
export const loadSpell = (key: string) => once('s:' + key, () => api.get<Spell>(`${V1}/srd/spells/${key}`))
export const loadMagic = () => once('magic', () => api.get<{ items: MagicItem[] }>(`${V1}/srd/magic-items`).then(r => r.items))
export const loadMagicItem = (key: string) => once('mi:' + key, () => api.get<MagicItem>(`${V1}/srd/magic-items/${key}`))
export const loadRuleSections = () => once('rule-sections', () => api.get<Named[]>(`${V1}/srd/file/rules`))

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => { let live = true; setV(null); fn().then(x => { if (live) setV(x) }).catch(() => {}); return () => { live = false } }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}

// ---- words ----

export function crText(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'
  return n + s
}

export const spellLevel = (l: number) => (l === 0 ? 'Cantrip' : `${ordinal(l)} level`)
export const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
export const keyName = (k: string) => titleCase(k.replace(/-/g, ' '))
export const signed = (n: number) => (n >= 0 ? '+' + n : '−' + Math.abs(n))
export const mod = (score: number) => Math.floor((score - 10) / 2)

export const SCHOOL_COLORS: Record<string, string> = {
  abjuration: '#3d7bd0', conjuration: '#c7871f', divination: '#7c8a99', enchantment: '#c0508a', evocation: '#d0452f', illusion: '#7b56c4', necromancy: '#4f6b3a', transmutation: '#2f8f7a',
}

export const CONDITION_HINTS: Record<string, string> = {
  blinded: 'Fails sight checks; attacks against it have advantage, its attacks have disadvantage.',
  charmed: "Can't attack the charmer; the charmer has advantage on social checks.",
  deafened: 'Fails hearing checks.',
  exhaustion: 'Levels 1–6, each worse than the last.',
  frightened: 'Disadvantage on checks and attacks while the source is in sight; cannot move closer.',
  grappled: 'Speed 0.',
  incapacitated: 'No actions or reactions.',
  invisible: 'Attacks against it have disadvantage, its attacks have advantage.',
  paralyzed: 'Incapacitated, fails Str and Dex saves; hits within 5 ft. are critical.',
  petrified: 'Turned to stone; resistant to all damage.',
  poisoned: 'Disadvantage on attacks and ability checks.',
  prone: 'Disadvantage on attacks; melee attacks against it have advantage, ranged disadvantage.',
  restrained: 'Speed 0; disadvantage on attacks and Dex saves; attacks against it have advantage.',
  stunned: 'Incapacitated, fails Str and Dex saves; attacks against it have advantage.',
  unconscious: 'Drops what it holds, falls prone; hits within 5 ft. are critical.',
}
