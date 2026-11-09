// A character sheet: the hero card, the numbers at the table (armour, hit
// points, initiative…), the six abilities with their saves and skills, and
// tabs for actions, spells, the inventory, features and the story. Every
// number that can be rolled is a button. Changes save by themselves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { announceChange } from '../lib/data'
import { useRoll } from '../lib/dice'
import { columns, compute, fmtMod, longRest, normalizeSheet, setSpellIndex, shortRest, syncResources, type Derived } from '../lib/rules'
import { CONDITION_HINTS, loadSpells, useRules, type Rules } from '../lib/srd'
import type { Ability, Campaign, Character as Char, Sheet } from '../lib/types'
import { ABILITIES, ABILITY_NAMES } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { CharacterToken, HPBar, Pips, StatBox } from '../components/Game'
import { Icon } from '../components/icons'
import { Confirm, Loading, type MenuItem, MenuButton, Segmented, Tabs, errMsg, useIsMobile, useToast, copyText } from '../components/ui'
import { ActionsTab, FeaturesTab, InventoryTab, SpellsTab, StoryTab } from '../components/SheetTabs'
import { LevelUp } from '../components/LevelUp'
import { CharacterEdit } from '../components/CharacterEdit'

export type SheetTab = 'main' | 'actions' | 'spells' | 'inventory' | 'features' | 'story'
export type Adv = '' | 'adv' | 'dis'

export interface SheetCtx {
  c: Char; s: Sheet; d: Derived; r: Rules
  set: (fn: (s: Sheet) => Sheet) => void
  roll: (expr: string, label: string, kind: string, opts?: { crit?: boolean; noAdv?: boolean }) => void
  readOnly?: boolean
}

export default function Character() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { settings } = useApp()
  const { toast } = useToast()
  const rules = useRules()
  const doRoll = useRoll()
  const mobile = useIsMobile()
  const [c, setC] = useState<Char | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [shareURL, setShareURL] = useState('')
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<SheetTab>(() => (window.innerWidth <= 767 ? 'main' : 'actions'))
  const [adv, setAdv] = useState<Adv>('')
  const [levelUp, setLevelUp] = useState(false)
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [saving, setSaving] = useState<'' | 'saving' | 'saved' | 'error'>('')
  const [, setSpellsReady] = useState(0)
  const [camps, setCamps] = useState<Campaign[]>([])
  useCrumb(c?.name)

  useEffect(() => { loadSpells().then(l => { setSpellIndex(l); setSpellsReady(1) }).catch(() => {}) }, [])
  useEffect(() => {
    let live = true
    api.get<{ character: Char; share_url?: string }>(`${V1}/characters/${id}`).then(r => {
      if (!live) return
      setC(r.character); setSheet(normalizeSheet(r.character.sheet)); setShareURL(r.share_url || '')
    }).catch(e => setErr(errMsg(e)))
    api.get<{ campaigns: Campaign[] }>(`${V1}/campaigns`).then(r => live && setCamps(r.campaigns)).catch(() => {})
    return () => { live = false }
  }, [id])
  useEffect(() => { if (!mobile && tab === 'main') setTab('actions') }, [mobile, tab])

  const d = useMemo(() => (sheet && rules ? compute(sheet, rules, { encumbrance: settings?.encumbrance }) : null), [sheet, rules, settings?.encumbrance])

  // saving: a moment after the last change, the sheet and the numbers lists need
  const pending = useRef<{ sheet: Sheet; meta?: Partial<Char> } | null>(null)
  const timer = useRef(0)
  const flush = useCallback(async () => {
    const p = pending.current
    if (!p || !rules || !c) return
    pending.current = null
    setSaving('saving')
    try {
      const dd = compute(p.sheet, rules, { encumbrance: settings?.encumbrance })
      const body = { ...columns(p.sheet, dd), ...(p.meta || {}), sheet: p.sheet }
      const res = await api.put<{ character: Char; share_url?: string }>(`${V1}/characters/${c.id}`, body)
      setC(x => (x ? { ...res.character, sheet: undefined } : x))
      setShareURL(res.share_url || '')
      setSaving('saved')
      announceChange()
    } catch (e) { setSaving('error'); toast(errMsg(e), 'err') }
  }, [rules, c, settings?.encumbrance, toast])
  const queue = useCallback((s: Sheet, meta?: Partial<Char>) => {
    pending.current = { sheet: s, meta: { ...(pending.current?.meta || {}), ...(meta || {}) } }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 700)
  }, [flush])
  useEffect(() => () => { window.clearTimeout(timer.current); if (pending.current) void flush() }, [flush])
  const set = useCallback((fn: (s: Sheet) => Sheet) => setSheet(s => { if (!s) return s; const n = fn(s); queue(n); return n }), [queue])
  const setMeta = (meta: Partial<Char>) => { setC(x => (x ? { ...x, ...meta } : x)); if (sheet) queue(sheet, meta) }

  if (err) return <div className="page"><p className="error">{err}</p></div>
  if (!c || !sheet || !rules || !d) return <Loading />

  const roll = (expr: string, label: string, kind: string, o: { crit?: boolean; noAdv?: boolean } = {}) => {
    doRoll(expr, { label, kind, character_id: c.id, campaign_id: c.campaign_id, adv: o.noAdv ? '' : adv, crit: o.crit })
  }
  const r20 = (b: number) => `1d20${b >= 0 ? '+' + b : b}`
  const ctx: SheetCtx = { c, s: sheet, d, r: rules, set, roll }
  const xpNeed = d.nextXP
  const xpPrev = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000][d.level - 1] || 0
  const camp = camps.find(x => x.id === c.campaign_id)
  const milestone = camp?.advancement === 'milestone'
  const canLevel = d.level < 20 && (milestone || sheet.classes.length === 0 || sheet.xp >= xpNeed)
  const hpCur = Math.min(sheet.hp.cur, d.hpMax)

  const menu = (): MenuItem[] => [
    { label: 'Edit details, scores and proficiencies', icon: 'edit', onSelect: () => setEdit(true) },
    { label: 'Level up', icon: 'trending-up', onSelect: () => setLevelUp(true), disabled: d.level >= 20 },
    'sep',
    { label: shareURL ? 'Copy the sheet link' : 'Share the sheet (read only)', icon: 'share', onSelect: async () => {
      let u = shareURL
      if (!u) { const r = await api.post<{ share_url: string }>(`${V1}/characters/${c.id}/share`); u = r.share_url; setShareURL(u) }
      toast((await copyText(u)) ? 'Link copied: anyone with it can read this sheet' : u)
    } },
    ...(shareURL ? [{ label: 'Stop sharing', icon: 'lock', onSelect: () => { setShareURL(''); setMeta({ share_on: false }) } }] : []),
    { label: 'Send to the party chat', icon: 'message', onSelect: async () => { try { const r = await api.post<{ text: string }>(`${V1}/apps/chat`, { character_id: c.id }); toast(r.text) } catch (e) { toast(errMsg(e), 'err') } } },
    'sep',
    c.status === 'active' ? { label: 'Retire', icon: 'archive', onSelect: () => setMeta({ status: 'retired' }) } : { label: 'Bring back', icon: 'undo', onSelect: () => setMeta({ status: 'active' }) },
    ...(c.status !== 'dead' ? [{ label: 'Mark as fallen', icon: 'skull', onSelect: () => setMeta({ status: 'dead' }) }] : []),
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDel(true) },
  ]

  const tabs: { id: SheetTab; label: string; icon: string }[] = [
    ...(mobile ? [{ id: 'main' as const, label: 'Abilities', icon: 'user' }] : []),
    { id: 'actions', label: 'Actions', icon: 'swords' },
    ...(d.casting.length || sheet.spells.length ? [{ id: 'spells' as const, label: 'Spells', icon: 'wand' }] : []),
    { id: 'inventory', label: 'Inventory', icon: 'bag' },
    { id: 'features', label: 'Features', icon: 'star' },
    { id: 'story', label: 'Story', icon: 'feather' },
  ]

  return (
    <div className="page sheet-page">
      <header className="hero">
        <button type="button" className="hero-token" onClick={() => setEdit(true)} title="Change the portrait">
          <CharacterToken c={{ ...c, hp_cur: hpCur, hp_max: d.hpMax, level: d.level }} size={mobile ? 84 : 112} showHP />
        </button>
        <div className="hero-body">
          <h1 className="hero-name">{c.name}</h1>
          <div className="hero-line">{[d.speciesName, d.classesText || 'No class yet'].filter(Boolean).join(' · ')}</div>
          <div className="hero-meta">
            {d.backgroundName && <span>{d.backgroundName}</span>}
            {d.alignmentName && <span>{d.alignmentName}</span>}
            {c.player && <span>Played by {c.player}</span>}
            {c.campaign_name && <button type="button" className="linkish" onClick={() => navigate(`/campaigns/${c.campaign_id}`)}><Icon name="castle" size={13} />{c.campaign_name}</button>}
            {c.status !== 'active' && <span className="tag">{c.status === 'dead' ? 'Fallen' : 'Retired'}</span>}
          </div>
          <div className="xp-row">
            {milestone ? <span className="muted small">Levels by milestone</span> : <>
              <span className="xp-bar" aria-label={`${sheet.xp} of ${xpNeed} XP`}><span style={{ width: `${d.level >= 20 ? 100 : Math.min(100, ((sheet.xp - xpPrev) / Math.max(1, xpNeed - xpPrev)) * 100)}%` }} /></span>
              <span className="muted small num">{sheet.xp.toLocaleString()}{d.level < 20 ? ` / ${xpNeed.toLocaleString()} XP` : ' XP'}</span>
            </>}
            <button type="button" className={`btn sm ${canLevel ? 'primary' : ''}`} onClick={() => setLevelUp(true)} disabled={d.level >= 20}><Icon name="trending-up" size={14} />{sheet.classes.length ? 'Level up' : 'Choose a class'}</button>
          </div>
        </div>
        <div className="hero-actions">
          <span className={`save-state ${saving}`} aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : ''}</span>
          <button type="button" className="btn" onClick={() => { set(s => shortRest(s)); toast('Short rest: short-rest uses are back. Spend hit dice from the hit point box.') }} title="Short rest"><Icon name="coffee" size={15} /><span className="hide-sm">Short rest</span></button>
          <button type="button" className="btn" onClick={() => { set(s => longRest(s, d)); toast('Long rest: hit points, spell slots and uses are back') }} title="Long rest"><Icon name="moon" size={15} /><span className="hide-sm">Long rest</span></button>
          <MenuButton label="More" items={menu} align="right" width={260}><Icon name="more" size={18} /></MenuButton>
        </div>
      </header>

      {d.warnings.length > 0 && <div className="notice warn">{d.warnings.map((w, i) => <div key={i}><Icon name="alert" size={14} /> {w}</div>)}</div>}

      <section className="vitals">
        <StatBox shape="shield" label="Armour" value={d.ac} sub={d.acNote} title={`Armour class: ${d.acNote}`} />
        <HitPoints ctx={ctx} />
        <StatBox label="Initiative" value={fmtMod(d.init)} onClick={() => roll(r20(d.init), 'Initiative', 'init')} title="Roll initiative" />
        <StatBox label="Speed" value={<>{d.speed}<small> ft.</small></>} sub={d.speedNote || (d.encumbrance ? d.encumbrance : '')} />
        <StatBox label="Proficiency" value={fmtMod(d.pb)} />
        <StatBox label="Passive Perc." value={d.pp} sub={`Insight ${d.pins} · Inv. ${d.pinv}`} />
        <div className="vital-tools">
          <Segmented size="sm" label="Next rolls" value={adv} onChange={setAdv} options={[{ value: '', label: 'Normal' }, { value: 'adv', label: 'Adv.', title: 'Advantage: roll two d20s, keep the higher' }, { value: 'dis', label: 'Dis.', title: 'Disadvantage: roll two d20s, keep the lower' }]} />
          <button type="button" className={`inspire ${sheet.inspiration ? 'on' : ''}`} onClick={() => set(s => ({ ...s, inspiration: !s.inspiration }))} aria-pressed={sheet.inspiration} title="Inspiration">
            <Icon name="star" size={15} />Inspiration
          </button>
        </div>
      </section>

      <Conditions ctx={ctx} />

      <div className="sheet-grid">
        {(!mobile || tab === 'main') && <aside className="sheet-left">
          <div className="abilities">
            {ABILITIES.map(a => <AbilityBox key={a} a={a} ctx={ctx} />)}
          </div>
          <SkillsList ctx={ctx} />
          <section className="sheet-card profs">
            <h3 className="sheet-h">Proficiencies</h3>
            {d.armor.length > 0 && <p><b>Armour.</b> {d.armor.join(', ')}</p>}
            {d.weapons.length > 0 && <p><b>Weapons.</b> {d.weapons.join(', ')}</p>}
            {d.tools.length > 0 && <p><b>Tools.</b> {d.tools.join(', ')}</p>}
            <p><b>Languages.</b> {d.langs.join(', ') || '—'}</p>
            {d.resist.length > 0 && <p><b>Resistant to</b> {d.resist.join(', ')}.</p>}
            {sheet.profs_extra && <p>{sheet.profs_extra}</p>}
          </section>
        </aside>}
        <div className="sheet-right">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === 'actions' && <ActionsTab ctx={ctx} />}
          {tab === 'spells' && <SpellsTab ctx={ctx} />}
          {tab === 'inventory' && <InventoryTab ctx={ctx} />}
          {tab === 'features' && <FeaturesTab ctx={ctx} />}
          {tab === 'story' && <StoryTab ctx={ctx} />}
        </div>
      </div>

      {levelUp && <LevelUp c={c} s={sheet} r={rules} d={d} onClose={() => setLevelUp(false)} onDone={n => { set(() => ({ ...n, resources: syncResources(n, rules) })); setLevelUp(false); toast('Level up saved') }} />}
      {edit && <CharacterEdit c={c} s={sheet} r={rules} camps={camps} onClose={() => setEdit(false)}
        onSave={(n, meta) => { setC(x => (x ? { ...x, ...meta } : x)); setSheet(n); queue(n, meta); setEdit(false) }} />}
      {del && <Confirm title={`Delete ${c.name}?`} message="The whole sheet goes, and the character leaves any fight they are in. This cannot be undone." confirmLabel="Delete"
        onCancel={() => setDel(false)} onConfirm={async () => { await api.del(`${V1}/characters/${c.id}`); announceChange(); navigate('/characters') }} />}
    </div>
  )
}

function HitPoints({ ctx }: { ctx: SheetCtx }) {
  const { s, d, set, roll, readOnly } = ctx
  const [n, setN] = useState('')
  const cur = Math.min(s.hp.cur, d.hpMax)
  const amount = Math.max(0, Math.floor(Number(n) || 0))
  const apply = (kind: 'dmg' | 'heal' | 'temp') => {
    if (!amount) return
    set(x => {
      let c2 = Math.min(x.hp.cur, d.hpMax), t = x.hp.temp
      if (kind === 'temp') t = Math.max(t, amount)
      else if (kind === 'heal') { c2 = Math.min(d.hpMax, Math.max(0, c2) + amount) }
      else { let dm = amount; const soak = Math.min(t, dm); t -= soak; dm -= soak; c2 = Math.max(0, c2 - dm) }
      return { ...x, hp: { ...x.hp, cur: c2, temp: t }, death: c2 > 0 ? { ok: 0, fail: 0 } : x.death }
    })
    setN('')
  }
  const down = cur <= 0
  return (
    <div className={`hpbox ${down ? 'is-down' : ''}`}>
      <div className="hpbox-top">
        <span className="statbox-k">Hit points</span>
        <span className="hpbox-v"><b>{cur}</b><span className="muted">/{d.hpMax}</span>{s.hp.temp > 0 && <span className="hp-temp" title="Temporary hit points">+{s.hp.temp}</span>}</span>
      </div>
      <HPBar cur={cur} max={d.hpMax} temp={s.hp.temp} />
      {!readOnly && <div className="hpbox-ctl">
        <input className="input num" inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" aria-label="Hit points"
          onKeyDown={e => { if (e.key === 'Enter') apply(e.shiftKey ? 'heal' : 'dmg') }} />
        <button type="button" className="btn sm danger-soft" onClick={() => apply('dmg')} disabled={!amount}>Damage</button>
        <button type="button" className="btn sm ok-soft" onClick={() => apply('heal')} disabled={!amount}>Heal</button>
        <button type="button" className="btn sm" onClick={() => apply('temp')} disabled={!amount} title="Temporary hit points">Temp</button>
      </div>}
      <div className="hitdice">
        {d.hitDice.map(h => (
          <span key={h.die} className="hitdie">
            <span className="muted small">Hit dice d{h.die}</span>
            <Pips max={h.total} used={h.used} label={`d${h.die} hit dice`} size={11} onChange={readOnly ? undefined : u => set(x => ({ ...x, hit_dice_used: { ...x.hit_dice_used, [String(h.die)]: u } }))} />
            {!readOnly && h.used < h.total && <button type="button" className="btn ghost sm" title="Spend one on a short rest: roll it, add your Constitution" onClick={() => {
              roll(`1d${h.die}${d.mods.con >= 0 ? '+' + d.mods.con : d.mods.con}`, `Hit die (d${h.die})`, 'hit_die', { noAdv: true })
              set(x => ({ ...x, hit_dice_used: { ...x.hit_dice_used, [String(h.die)]: h.used + 1 } }))
            }}>Spend</button>}
          </span>
        ))}
      </div>
      {down && <DeathSaves ctx={ctx} />}
    </div>
  )
}

function DeathSaves({ ctx }: { ctx: SheetCtx }) {
  const { s, set, roll, readOnly } = ctx
  const mark = (k: 'ok' | 'fail', v: number) => set(x => ({ ...x, death: { ...x.death, [k]: x.death[k] === v ? v - 1 : v } }))
  return (
    <div className="death">
      <span className="muted small">Death saves</span>
      <span className="death-row ok">{[1, 2, 3].map(i => <button key={i} type="button" disabled={readOnly} className={`dsave ${s.death.ok >= i ? 'on' : ''}`} onClick={() => mark('ok', i)} aria-label={`Success ${i}`} />)}<small>saved</small></span>
      <span className="death-row fail">{[1, 2, 3].map(i => <button key={i} type="button" disabled={readOnly} className={`dsave ${s.death.fail >= i ? 'on' : ''}`} onClick={() => mark('fail', i)} aria-label={`Failure ${i}`} />)}<small>failed</small></span>
      {!readOnly && <button type="button" className="btn sm" onClick={() => roll('1d20', 'Death saving throw', 'death', { noAdv: true })}>Roll</button>}
      {s.death.ok >= 3 && <span className="small accent-ink">Stable</span>}
      {s.death.fail >= 3 && <span className="small danger-ink">Dead</span>}
    </div>
  )
}

function AbilityBox({ a, ctx }: { a: Ability; ctx: SheetCtx }) {
  const { d, roll } = ctx
  const sv = d.saves[a]
  const m = d.mods[a]
  return (
    <div className="ability">
      <button type="button" className="ability-main" onClick={() => roll(`1d20${m >= 0 ? '+' + m : m}`, `${ABILITY_NAMES[a]} check`, 'check')} title={`Roll a ${ABILITY_NAMES[a]} check`}>
        <span className="ability-k">{ABILITY_NAMES[a]}</span>
        <span className="ability-mod">{fmtMod(m)}</span>
        <span className="ability-score">{d.scores[a]}</span>
      </button>
      <button type="button" className={`ability-save ${sv.prof ? 'prof' : ''}`} onClick={() => roll(`1d20${sv.bonus >= 0 ? '+' + sv.bonus : sv.bonus}`, `${ABILITY_NAMES[a]} saving throw`, 'save')} title={`Roll a ${ABILITY_NAMES[a]} saving throw`}>
        <span className="prof-dot" aria-hidden="true" />Save <b>{fmtMod(sv.bonus)}</b>
      </button>
    </div>
  )
}

function SkillsList({ ctx }: { ctx: SheetCtx }) {
  const { d, roll } = ctx
  return (
    <section className="sheet-card skills">
      <h3 className="sheet-h">Skills</h3>
      <ul>
        {d.skills.map(sk => (
          <li key={sk.key}>
            <button type="button" className={`skill ${sk.prof ? 'prof' : ''} ${sk.expert ? 'expert' : ''}`} onClick={() => roll(`1d20${sk.bonus >= 0 ? '+' + sk.bonus : sk.bonus}`, sk.name, 'check')} title={sk.expert ? 'Expertise' : sk.prof ? 'Proficient' : sk.half ? 'Half proficiency' : ''}>
              <span className="prof-dot" aria-hidden="true" />
              <span className="grow">{sk.name}<span className="skill-ab">{sk.ability.toUpperCase()}</span></span>
              <b className="num">{fmtMod(sk.bonus)}</b>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const CONDITIONS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']

function Conditions({ ctx }: { ctx: SheetCtx }) {
  const { s, set, readOnly } = ctx
  const [open, setOpen] = useState(false)
  const on = s.conditions
  if (readOnly && !on.length && !s.exhaustion) return null
  return (
    <section className="conditions">
      {on.map(k => <button key={k} type="button" className="cond on" title={CONDITION_HINTS[k]} disabled={readOnly} onClick={() => set(x => ({ ...x, conditions: x.conditions.filter(y => y !== k) }))}>{k}<Icon name="x" size={12} /></button>)}
      {s.exhaustion > 0 && <span className="cond on exh" title={CONDITION_HINTS.exhaustion}>Exhaustion {s.exhaustion}</span>}
      {!readOnly && <button type="button" className="cond add" onClick={() => setOpen(o => !o)} aria-expanded={open}><Icon name={open ? 'chevron-up' : 'plus'} size={12} />{on.length || s.exhaustion ? 'Conditions' : 'Add a condition'}</button>}
      {open && !readOnly && <div className="cond-all">
        {CONDITIONS.filter(k => !on.includes(k)).map(k => <button key={k} type="button" className="cond" title={CONDITION_HINTS[k]} onClick={() => set(x => ({ ...x, conditions: [...x.conditions, k] }))}>{k}</button>)}
        <span className="stepper small" title={CONDITION_HINTS.exhaustion}>
          Exhaustion
          <button type="button" className="btn ghost sm icon-only" onClick={() => set(x => ({ ...x, exhaustion: Math.max(0, x.exhaustion - 1) }))} aria-label="Less exhaustion"><Icon name="minus" size={12} /></button>
          <b>{s.exhaustion}</b>
          <button type="button" className="btn ghost sm icon-only" onClick={() => set(x => ({ ...x, exhaustion: Math.min(6, x.exhaustion + 1) }))} aria-label="More exhaustion"><Icon name="plus" size={12} /></button>
        </span>
      </div>}
    </section>
  )
}

export { HitPoints, AbilityBox, SkillsList, Conditions }
