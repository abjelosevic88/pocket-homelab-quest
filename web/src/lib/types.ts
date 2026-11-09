export interface User { id: number; email: string; name: string; role: 'admin' | 'member'; created_at: string }
export interface APIToken { id: number; user_id: number; name: string; prefix: string; last_used_at: string | null; created_at: string }

export type ConnMode = 'core' | 'direct' | 'off'
export type ConnVia = '' | 'core' | 'direct'
export type AppSlug = 'calendar' | 'notes' | 'chat' | 'tasks'

type ConnFields = { [K in AppSlug as `${K}_mode`]: ConnMode } & { [K in AppSlug as `${K}_via`]: ConnVia } & { [K in AppSlug as `${K}_detail` | `${K}_url` | `${K}_token` | `${K}_public_url` | `${K}_open_url`]: string } & { [K in AppSlug as `${K}_configured`]: boolean }

export type Settings = ConnFields & {
  core_configured: boolean
  core_registered?: boolean
  title: string; date_format: string; time_format: string; week_start: number
  campaign: number; dice_motion: boolean; crit_rule: 'double' | 'max'; hp_on_level: 'average' | 'roll'; encumbrance: boolean; show_secrets: boolean
  player_monster: 'words' | 'hidden' | 'numbers'
  calendar_id: number; auto_calendar: boolean; chat_to: string; notes_folder: string; ai_help: boolean
  notify_sessions: boolean; notify_hour: number; notify_level: boolean
  notify_url: string; notify_format: string; notify_configured: boolean
  ai_provider: 'auto' | 'pocket' | 'openai'; ai_pocket_model: string; openai_api_key: string; openai_model: string; openai_base_url: string
  setup_complete: boolean; base_url: string; demo: boolean
}

export type AppStateName = 'on' | 'partly' | 'off' | 'link_off' | 'missing' | 'old' | 'no_core' | 'not_set_up' | 'error'
export interface AppState { slug: AppSlug; name: string; reason: string; mode: ConnMode; via: ConnVia; state: AppStateName; detail: string; fix: string; on: string[]; open_url: string }

// ---- the game ----

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export const ABILITY_NAMES: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }

export interface Campaign {
  id: number; name: string; tagline: string; world: string; status: 'active' | 'paused' | 'done'; emblem: string; color: string; photo_id: number | null
  summary: string; secrets: string; house_rules: string; advancement: 'xp' | 'milestone'; schedule: string; place: string
  share_token: string; share_on: boolean; created_at: string; updated_at: string
  party: number; party_level: number; sessions: number; next_session: string; open_quests: number; photo_url: string
}

export interface Token { color?: string; emblem?: string; frame?: '' | 'gold' | 'silver' | 'bronze' | 'iron' }

export interface Character {
  id: number; campaign_id: number | null; name: string; player: string; kind: 'pc' | 'companion'; level: number; classes: string; class_key: string; species: string
  ac: number; hp_max: number; hp_cur: number; hp_temp: number; init: number; pp: number; speed: number; xp: number
  sheet?: Sheet; token: Token; photo_id: number | null; status: 'active' | 'retired' | 'dead'; share_token: string; share_on: boolean
  created_at: string; updated_at: string; campaign_name: string; photo_url: string; thumb_url: string
}

export interface ClassLevel { key: string; level: number; sub: string; hp: number[] }
export interface ASI { class: string; level: number; a?: Ability; b?: Ability; feat?: string }
export type ItemKind = 'weapon' | 'armor' | 'shield' | 'gear' | 'tool' | 'magic' | 'treasure'
export interface InvItem {
  id: string; key?: string; magic?: string; name: string; kind: ItemKind; qty: number; w: number; equipped?: boolean; attuned?: boolean; bonus?: number; notes?: string
  // for something of your own
  dmg?: string; dmg_type?: string; props?: string[]; ac?: number
}
export interface SpellRef { key: string; cls: string; prepared: boolean; always?: boolean }
export interface Resource { id: string; name: string; max: number; used: number; reset: 'short' | 'long' }
export interface ExtraAttack { name: string; bonus: number; dmg: string; type: string; notes?: string }
export interface Sheet {
  v: number
  species: string; subspecies: string; background: string; background_name?: string; alignment: string
  classes: ClassLevel[]
  abilities: Record<Ability, number>
  bonus_choice: Ability[]
  asi: ASI[]
  skills: string[]; expertise: string[]; save_profs?: Ability[]
  langs: string[]; tools: string[]; profs_extra: string
  hp: { cur: number; temp: number; bonus: number }
  hit_dice_used: Record<string, number>
  death: { ok: number; fail: number }
  conditions: string[]; exhaustion: number; inspiration: boolean
  xp: number
  ac_bonus: number; ac_override: number; speed_bonus: number; init_bonus: number
  inventory: InvItem[]
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
  spells: SpellRef[]
  slots_used: number[]; pact_used: number
  resources: Resource[]
  feats: string[]
  features_extra: { name: string; desc: string }[]
  attacks_extra: ExtraAttack[]
  choices: Record<string, string[]>
  traits: { personality?: string; ideals?: string; bonds?: string; flaws?: string }
  bio: { age?: string; height?: string; weight?: string; eyes?: string; hair?: string; skin?: string; faith?: string; appearance?: string; backstory?: string; allies?: string; notes?: string }
}

export interface Session {
  id: number; campaign_id: number; number: number; title: string; date: string; time: string; minutes: number; status: 'planned' | 'played' | 'cancelled'
  plan: string; recap: string; notes: string; xp: number; loot: string; attendance: number[]; calendar_ref: string; calendar_url: string; source: string
  created_at: string; updated_at: string; campaign_name: string; encounters: number
}

export type EntryKind = 'npc' | 'place' | 'faction' | 'item' | 'lore' | 'handout'
export interface Entry {
  id: number; campaign_id: number; kind: EntryKind; name: string; subtitle: string; body: string; secret: string; status: '' | 'alive' | 'dead' | 'missing'
  attitude: '' | 'friendly' | 'neutral' | 'hostile'; place_id: number | null; monster: string; photo_id: number | null; revealed: boolean; pinned: boolean; tags: string[]
  source: string; created_at: string; updated_at: string; place_name: string; photo_url: string; thumb_url: string
}

export interface Objective { text: string; done: boolean }
export interface Quest {
  id: number; campaign_id: number; title: string; status: 'rumour' | 'active' | 'done' | 'failed'; giver_id: number | null; place_id: number | null
  summary: string; secret: string; reward: string; objectives: Objective[]; revealed: boolean; sort: number; done_on: string; source: string
  created_at: string; updated_at: string; giver_name: string; place_name: string
}

export interface PlanLine { ref: string; n: number; name?: string }
export interface Combatant {
  id: string; kind: 'pc' | 'monster' | 'npc'; ref: string; name: string; init: number; init_bonus: number; ac: number; hp_max: number; hp: number; temp: number
  conditions: string[]; conc: boolean; hidden: boolean; note: string; color?: string; legendary?: number; saves: [number, number]; out: boolean
}
export interface LogLine { round: number; text: string; at: string }
export interface Fight { round: number; turn: number; started?: string; combatants: Combatant[]; log: LogLine[] }
export interface Encounter {
  id: number; campaign_id: number | null; session_id: number | null; name: string; place: string; readaloud: string; notes: string; status: 'plan' | 'running' | 'done'
  plan: PlanLine[]; state: Fight; xp: number; finished_at: string; created_at: string; updated_at: string; campaign_name: string
  rating?: Rating; monsters?: number
}
export type Rating = '' | 'trivial' | 'low' | 'moderate' | 'high' | 'beyond'
export interface Difficulty { low: number; moderate: number; high: number; xp: number; rating: Rating; party: number }
export interface PlanCost { ref: string; name: string; n: number; xp: number; cr: number }

export interface Roll {
  id: number; campaign_id: number | null; character_id: number | null; label: string; expr: string; total: number; detail: RollResult; kind: string; created_at: string; character_name: string
}
export interface Die { sides: number; value: number; kept: boolean }
export interface Term { sign: number; text: string; dice?: Die[]; value: number }
export interface RollResult { expr: string; terms: Term[]; total: number; natural?: number; crit?: boolean; fumble?: boolean }

export interface Creature { id: number; name: string; data: Monster; photo_id: number | null; created_at: string; updated_at: string; photo_url: string }

// ---- the rules content (SRD 5.1) ----

export interface MonsterAction { name: string; desc: string; hit?: number; dmg?: [string, string][]; dc?: [string, number]; use?: string }
export interface Monster {
  key: string; name: string; size: string; type: string; sub?: string; align?: string; ac: number; ac_note?: string; hp: number; hd?: string; speed?: string; walk?: number
  abil: number[]; saves?: Record<string, number>; skills?: Record<string, number>; vuln?: string[]; res?: string[]; imm?: string[]; cimm?: string[]
  senses?: string; pp?: number; lang?: string; cr: number; xp: number; pb?: number
  traits: MonsterAction[]; actions: MonsterAction[]; reactions?: MonsterAction[]; legendary?: MonsterAction[]; desc?: string
}
export interface MonsterRow { key: string; name: string; size: string; type: string; sub?: string; align?: string; ac: number; hp: number; cr: number; xp: number; legendary?: boolean; fly?: boolean; swim?: boolean; mine?: boolean }

export interface Spell {
  key: string; name: string; level: number; school: string; time: string; range: string; comp: string; mat?: string; dur: string; conc: boolean; ritual: boolean
  classes: string[]; subclasses?: string[]; desc?: string; higher?: string; dmg_type?: string; dmg_slot?: Record<string, string>; dmg_char?: Record<string, string>
  heal_slot?: Record<string, string>; save?: string; save_ok?: string; attack?: string; area?: [string, number]
}
export interface MagicItem { key: string; name: string; cat: string; rarity: string; attune: boolean; line: string; desc?: string }
export interface Equipment {
  key: string; name: string; cat: string; w: number; cost?: [number, string]; desc?: string; gear?: string; tool?: string; vehicle?: string; qty?: number
  contents?: [string, number][]
  weapon?: { cat: 'simple' | 'martial'; range: 'melee' | 'ranged'; dmg: string; type: string; props: string[]; reach?: number; long?: number; two?: string; throw?: [number, number] }
  armor?: { cat: 'light' | 'medium' | 'heavy' | 'shield'; base: number; dex: boolean; max?: number | null; str: number; stealth: boolean }
}
export interface Named { key: string; name: string; desc?: string; md?: string }
export interface Skill { key: string; name: string; ability: Ability; desc: string }
export interface Trait { name: string; desc: string; damage?: string; breath?: { area: [string, number]; save: string }; choose?: string[]; profs?: string[]; prof_choice?: { n: number; from: string[] }; spells?: { n: number; from: string[] }; langs?: number }
export interface Choice { choose: number; from: string[]; any: boolean }
export interface Subrace { key: string; name: string; desc: string; bonus: Partial<Record<Ability, number>>; traits: string[]; profs: string[] }
export interface Race {
  key: string; name: string; speed: number; size: string; bonus: Partial<Record<Ability, number>>; bonus_choice: Choice | null
  langs: string[]; lang_choice: Choice | null; lang_desc: string; profs: string[]; prof_choice: Choice | null; traits: string[]
  age: string; align: string; size_desc: string; subraces: Subrace[]
}
export interface Feature { name: string; class: string; level: number; desc: string; sub?: string; parent?: string; choose?: { n: number; from: string[] }; expertise?: number }
export interface LevelRow {
  level: number; features: string[]; pb?: number; asi?: number; cantrips?: number; known?: number; slots?: number[]
  extra?: Record<string, unknown>; sub_extra?: Record<string, unknown>
}
export type EquipOption = [('item' | 'any'), string, number][]
export interface Subclass { key: string; name: string; flavor: string; desc: string; spells: [string, string][]; levels: LevelRow[] }
export interface Klass {
  key: string; name: string; hd: number; saves: Ability[]; profs: string[]; prof_choices: { n: number; desc: string; from: string[] }[]
  equipment: [string, number][]; equip_choices: { desc: string; n: number; options: EquipOption[] }[]
  casting: { ability: Ability; level: number; info: { name: string; desc: string }[] } | null
  mc_prereq: [Ability, number][][]; mc_profs: string[]; levels: LevelRow[]; subclasses: Subclass[]
}
export interface Background {
  key: string; name: string; skills: string[]; langs: number; equipment: [string, number][]; equip_any: string[]; gold: number
  feature: { name: string; desc: string }; traits: string[]; ideals: string[]; bonds: string[]; flaws: string[]
}
export interface Proficiency { name: string; type: string }
