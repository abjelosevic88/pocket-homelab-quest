// The rules, built in (SRD 5.1): monsters (and your own), spells,
// equipment, magic items, conditions and the rules text.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { announceChange } from '../lib/data'
import { crText, forgetMonster, keyName, loadMagic, loadMagicItem, loadMonster, loadMonsters, loadRuleSections, loadSpells, reloadMonsters, SCHOOL_COLORS, spellLevel, useLoad, useRules } from '../lib/srd'
import type { Monster, MonsterAction, MonsterRow } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { StatBlock } from '../components/StatBlock'
import { CreatureIcon, CREATURE_TYPES } from '../components/Art'
import { SpellDetail } from '../components/SheetTabs'
import { Markdown } from '../components/Markdown'
import { Icon } from '../components/icons'
import { Confirm, Empty, Field, Loading, Segmented, Tabs, errMsg, useToast } from '../components/ui'
import { Select } from '../components/Select'

type Kind = 'monsters' | 'spells' | 'equipment' | 'magic-items' | 'conditions' | 'rules'
const TABS: { id: Kind; label: string; icon: string }[] = [
  { id: 'monsters', label: 'Monsters', icon: 'skull' }, { id: 'spells', label: 'Spells', icon: 'wand' }, { id: 'equipment', label: 'Equipment', icon: 'bag' },
  { id: 'magic-items', label: 'Magic items', icon: 'sparkles' }, { id: 'conditions', label: 'Conditions', icon: 'aura' }, { id: 'rules', label: 'Rules', icon: 'book-open' },
]

export default function Compendium() {
  const { kind = 'monsters', key } = useParams()
  const navigate = useNavigate()
  const k = kind as Kind
  return (
    <div className="page compendium">
      <div className="page-head"><div className="grow"><h1 className="page-title">Compendium</h1><p className="muted small">The fifth edition System Reference Document 5.1, built in. <a href="#srd-credit">Credits</a></p></div></div>
      <Tabs tabs={TABS} value={k} onChange={t => navigate(`/compendium/${t}`)} />
      {k === 'monsters' && (key === 'new' ? <MonsterEditor /> : key?.endsWith('/edit') ? null : key ? <MonsterPage refKey={key} /> : <Monsters />)}
      {k === 'spells' && (key ? <SpellPage k={key} /> : <Spells />)}
      {k === 'equipment' && <Equipment open={key} />}
      {k === 'magic-items' && (key ? <MagicPage k={key} /> : <Magic />)}
      {k === 'conditions' && <Conditions open={key} />}
      {k === 'rules' && <RulesText open={key} />}
      <p className="srd-credit muted small" id="srd-credit">This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noreferrer">dnd.wizards.com/resources/systems-reference-document</a>, and from the System Reference Document 5.2 (“SRD 5.2”), available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer">dndbeyond.com/srd</a>. Both are licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0 International License</a>. Compatible with fifth edition.</p>
    </div>
  )
}

const CR_STEPS = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30]

function Monsters() {
  const navigate = useNavigate()
  const all = useLoad(loadMonsters)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [lo, setLo] = useState('0')
  const [hi, setHi] = useState('30')
  const [mine, setMine] = useState<'all' | 'mine'>('all')
  const list = useMemo(() => (all || []).filter(m => (!q || m.name.toLowerCase().includes(q.toLowerCase())) && (!type || m.type.includes(type)) && m.cr >= Number(lo) && m.cr <= Number(hi) && (mine === 'all' || m.mine))
    .sort((a, b) => (a.mine === b.mine ? a.cr - b.cr || a.name.localeCompare(b.name) : a.mine ? -1 : 1)), [all, q, type, lo, hi, mine])
  if (!all) return <Loading />
  const crOpts = CR_STEPS.map(c => ({ value: String(c), label: `CR ${crText(c)}` }))
  return (
    <div>
      <div className="toolbar">
        <input className="input" placeholder="Find a monster" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a monster" />
        <Select value={type} onChange={setType} ariaLabel="Type" options={[{ value: '', label: 'Every type' }, ...CREATURE_TYPES.map(t => ({ value: t, label: keyName(t) }))]} />
        <Select value={lo} onChange={setLo} ariaLabel="From CR" options={crOpts} /><span className="muted">to</span><Select value={hi} onChange={setHi} ariaLabel="To CR" options={crOpts} />
        <Segmented size="sm" value={mine} onChange={setMine} label="Whose" options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Yours' }]} />
        <button type="button" className="btn primary" onClick={() => navigate('/compendium/monsters/new')}><Icon name="plus" size={15} />Your own</button>
      </div>
      <p className="muted small">{list.length} monsters</p>
      <ul className="mon-list">{list.map(m => (
        <li key={m.key}><button type="button" className="mon-row" onClick={() => navigate(`/compendium/monsters/${encodeURIComponent(m.key)}`)}>
          <span className="type-ico"><CreatureIcon type={m.type} size={26} /></span>
          <span className="grow"><b>{m.name}</b>{m.mine && <span className="mine-tag">yours</span>}{m.legendary && <span className="badge alt">legendary</span>}<span className="muted small">{m.size} {m.type}{m.sub ? ` (${m.sub})` : ''}{m.align ? ` · ${m.align}` : ''}</span></span>
          <span className="mon-nums hide-sm"><span title="Armour class"><Icon name="shield" size={12} />{m.ac}</span><span title="Hit points"><Icon name="heart" size={12} />{m.hp}</span></span>
          <span className="cr-chip">CR {crText(m.cr)}</span>
          <span className="num muted small xp-col">{m.xp.toLocaleString()} XP</span>
        </button></li>
      ))}</ul>
    </div>
  )
}

function MonsterPage({ refKey }: { refKey: string }) {
  const navigate = useNavigate()
  const ref = decodeURIComponent(refKey).includes(':') ? decodeURIComponent(refKey) : 'srd:' + decodeURIComponent(refKey)
  const m = useLoad(() => loadMonster(ref), [ref])
  const [editing, setEditing] = useState(false)
  const [del, setDel] = useState(false)
  useCrumb(m?.name, '/compendium/monsters')
  if (!m) return <Loading />
  const mine = ref.startsWith('my:')
  if (editing) return <MonsterEditor base={m} id={mine ? Number(ref.slice(3)) : undefined} onDone={() => setEditing(false)} />
  return (
    <div className="mon-page">
      <div className="row wrap">
        <button type="button" className="btn ghost sm" onClick={() => navigate('/compendium/monsters')}><Icon name="chevron-left" size={14} />All monsters</button>
        <span className="spacer" />
        <button type="button" className="btn sm" onClick={() => setEditing(true)}><Icon name={mine ? 'edit' : 'copy'} size={14} />{mine ? 'Edit' : 'Make your own from it'}</button>
        <button type="button" className="btn sm" onClick={async () => {
          const r = await api.post<{ encounter: { id: number } }>(`${V1}/encounters`, { name: `${m.name}${m.name.endsWith('s') ? '' : 's'}`, plan: [{ ref, n: 1 }] })
          announceChange(); navigate(`/encounters/${r.encounter.id}`)
        }}><Icon name="swords" size={14} />New encounter with it</button>
        {mine && <button type="button" className="btn ghost sm danger-text" onClick={() => setDel(true)}><Icon name="trash" size={14} /></button>}
      </div>
      <StatBlock m={m} />
      {del && <Confirm title={`Delete ${m.name}?`} message="Encounters that use it lose it." confirmLabel="Delete" onCancel={() => setDel(false)}
        onConfirm={async () => { await api.del(`${V1}/creatures/${ref.slice(3)}`); reloadMonsters(); forgetMonster(ref); navigate('/compendium/monsters') }} />}
    </div>
  )
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']

function MonsterEditor({ base, id, onDone }: { base?: Monster; id?: number; onDone?: () => void }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  useCrumb(id ? `Edit ${base?.name}` : 'Your own monster', '/compendium/monsters')
  const [m, setM] = useState<Monster>(() => base ? { ...base, name: id ? base.name : `${base.name} (yours)` } : { key: '', name: '', size: 'Medium', type: 'humanoid', align: 'neutral', ac: 12, hp: 11, hd: '2d8+2', speed: '30 ft.', abil: [10, 10, 10, 10, 10, 10], cr: 0.25, xp: 50, traits: [], actions: [{ name: 'Strike', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.' }], senses: 'passive Perception 10', lang: 'Common' })
  const set = <K extends keyof Monster>(k: K, v: Monster[K]) => setM(x => ({ ...x, [k]: v }))
  const acts = (k: 'traits' | 'actions' | 'reactions' | 'legendary', label: string) => (
    <Field label={label} group>
      {(m[k] || []).map((a: MonsterAction, i: number) => (
        <div key={i} className="act-edit">
          <input className="input" value={a.name} onChange={e => set(k, (m[k] || []).map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Name" aria-label="Name" />
          <textarea className="input" rows={2} value={a.desc} onChange={e => set(k, (m[k] || []).map((y, j) => (j === i ? { ...y, desc: e.target.value } : y)))} placeholder="What it does: “Melee Weapon Attack: +5 to hit… Hit: 7 (1d8 + 3) slashing damage.” rolls by itself." aria-label="What it does" />
          <button type="button" className="btn ghost sm icon-only" onClick={() => set(k, (m[k] || []).filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={14} /></button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => set(k, [...(m[k] || []), { name: '', desc: '' }])}><Icon name="plus" size={13} />Add</button>
    </Field>
  )
  const save = async () => {
    try {
      const c = await api[id ? 'put' : 'post']<{ id: number }>(`${V1}/creatures${id ? '/' + id : ''}`, { data: { ...m, xp: 0 } })
      reloadMonsters(); forgetMonster(`my:${c.id}`); announceChange()
      if (onDone && id) { onDone(); navigate(`/compendium/monsters/${encodeURIComponent('my:' + c.id)}`, { replace: true }) } else navigate(`/compendium/monsters/${encodeURIComponent('my:' + c.id)}`)
    } catch (e) { toast(errMsg(e), 'err') }
  }
  const AB = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
  return (
    <div className="mon-edit">
      <div className="form-grid">
        <Field label="Name"><input className="input" value={m.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Size"><Select value={m.size} onChange={v => set('size', v)} ariaLabel="Size" options={SIZES.map(s => ({ value: s, label: s }))} /></Field>
        <Field label="Type"><Select value={m.type} onChange={v => set('type', v)} ariaLabel="Type" options={CREATURE_TYPES.map(t => ({ value: t, label: keyName(t) }))} /></Field>
        <Field label="Alignment"><input className="input" value={m.align || ''} onChange={e => set('align', e.target.value)} /></Field>
        <Field label="Armour class"><input className="input num" inputMode="numeric" value={m.ac} onChange={e => set('ac', Number(e.target.value) || 0)} /></Field>
        <Field label="Armour"><input className="input" value={m.ac_note || ''} onChange={e => set('ac_note', e.target.value)} placeholder="natural armor" /></Field>
        <Field label="Hit points"><input className="input num" inputMode="numeric" value={m.hp} onChange={e => set('hp', Number(e.target.value) || 1)} /></Field>
        <Field label="Hit dice"><input className="input" value={m.hd || ''} onChange={e => set('hd', e.target.value)} placeholder="6d8+12" /></Field>
        <Field label="Speed"><input className="input" value={m.speed || ''} onChange={e => set('speed', e.target.value)} /></Field>
        <Field label="Challenge"><Select value={String(m.cr)} onChange={v => set('cr', Number(v))} ariaLabel="Challenge" options={CR_STEPS.map(c => ({ value: String(c), label: `CR ${crText(c)}` }))} /></Field>
        <Field label="Senses"><input className="input" value={m.senses || ''} onChange={e => set('senses', e.target.value)} /></Field>
        <Field label="Languages"><input className="input" value={m.lang || ''} onChange={e => set('lang', e.target.value)} /></Field>
      </div>
      <div className="score-edit">{AB.map((a, i) => <label key={a} className="score-cell"><span>{a}</span><input className="input num" inputMode="numeric" value={m.abil[i]} onChange={e => set('abil', m.abil.map((v, j) => (j === i ? Math.max(1, Math.min(30, Number(e.target.value) || 1)) : v)))} /></label>)}</div>
      <div className="form-grid">
        <Field label="Resistant to"><input className="input" value={(m.res || []).join(', ')} onChange={e => set('res', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></Field>
        <Field label="Immune to"><input className="input" value={(m.imm || []).join(', ')} onChange={e => set('imm', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></Field>
        <Field label="Immune to conditions"><input className="input" value={(m.cimm || []).join(', ')} onChange={e => set('cimm', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} /></Field>
      </div>
      {acts('traits', 'Traits')}
      {acts('actions', 'Actions')}
      {acts('reactions', 'Reactions')}
      {acts('legendary', 'Legendary actions')}
      <Field label="About it"><textarea className="input" rows={3} value={m.desc || ''} onChange={e => set('desc', e.target.value)} /></Field>
      <div className="row"><span className="spacer" />{onDone && <button type="button" className="btn" onClick={onDone}>Cancel</button>}<button type="button" className="btn primary" disabled={!m.name.trim()} onClick={save}>Save the monster</button></div>
      <h3 className="group-h">How it looks</h3>
      <StatBlock m={{ ...m, xp: m.xp }} />
    </div>
  )
}

function Spells() {
  const navigate = useNavigate()
  const all = useLoad(loadSpells)
  const [q, setQ] = useState('')
  const [lvl, setLvl] = useState('')
  const [cls, setCls] = useState('')
  const [school, setSchool] = useState('')
  if (!all) return <Loading />
  const list = all.filter(s => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && (lvl === '' || s.level === Number(lvl)) && (!cls || s.classes.includes(cls)) && (!school || s.school === school))
  return (
    <div>
      <div className="toolbar">
        <input className="input" placeholder="Find a spell" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a spell" />
        <Select value={lvl} onChange={setLvl} ariaLabel="Level" options={[{ value: '', label: 'Every level' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: spellLevel(i) }))]} />
        <Select value={cls} onChange={setCls} ariaLabel="Class" options={[{ value: '', label: 'Every class' }, ...['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'].map(c => ({ value: c, label: keyName(c) }))]} />
        <Select value={school} onChange={setSchool} ariaLabel="School" options={[{ value: '', label: 'Every school' }, ...Object.keys(SCHOOL_COLORS).map(s => ({ value: s, label: keyName(s) }))]} />
      </div>
      <p className="muted small">{list.length} spells</p>
      <ul className="mon-list">{list.map(s => (
        <li key={s.key}><button type="button" className="mon-row" onClick={() => navigate(`/compendium/spells/${s.key}`)}>
          <span className="school-dot big" style={{ background: SCHOOL_COLORS[s.school] }} />
          <span className="grow"><b>{s.name}</b>{s.conc && <span className="badge">C</span>}{s.ritual && <span className="badge">R</span>}<span className="muted small">{spellLevel(s.level)} {s.school} · {s.classes.map(keyName).join(', ')}</span></span>
          <span className="muted small hide-sm">{s.time} · {s.range}</span>
        </button></li>
      ))}</ul>
    </div>
  )
}

function SpellPage({ k }: { k: string }) {
  const navigate = useNavigate()
  const all = useLoad(loadSpells)
  const sp = all?.find(s => s.key === k)
  useCrumb(sp?.name, '/compendium/spells')
  if (!all) return <Loading />
  if (!sp) return <Empty title="No such spell" />
  return <div className="spell-page"><button type="button" className="btn ghost sm" onClick={() => navigate('/compendium/spells')}><Icon name="chevron-left" size={14} />All spells</button>
    <article className="spell-card"><h2 className="spell-title">{sp.name}</h2><p className="kicker" style={{ color: SCHOOL_COLORS[sp.school] }}>{spellLevel(sp.level)} {sp.school}{sp.ritual ? ' (ritual)' : ''}</p><SpellDetail spell={sp} /></article></div>
}

function Equipment({ open }: { open?: string }) {
  const r = useRules()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  if (!r) return <Loading />
  const sel = open ? r.equipBy[open] : undefined
  const cats = ['weapon', 'armor', 'adventuring-gear', 'tools', 'mounts-and-vehicles']
  const n = q.toLowerCase()
  return (
    <div className="equip-page">
      <div className="toolbar"><input className="input" placeholder="Find equipment" value={q} onChange={e => setQ(e.target.value)} aria-label="Find" /></div>
      {sel && <article className="card-lite equip-detail">
        <div className="sec-head"><h2>{sel.name}</h2><span className="spacer" /><button type="button" className="btn ghost sm icon-only" onClick={() => navigate('/compendium/equipment')} aria-label="Close"><Icon name="x" size={14} /></button></div>
        <p className="muted small">{keyName(sel.cat)}{sel.cost ? ` · ${sel.cost[0]} ${sel.cost[1]}` : ''}{sel.w ? ` · ${sel.w} lb` : ''}</p>
        {sel.weapon && <p>{keyName(sel.weapon.cat)} {sel.weapon.range} weapon · {sel.weapon.dmg} {sel.weapon.type}{sel.weapon.two ? ` (${sel.weapon.two} two-handed)` : ''}{sel.weapon.props.length ? ` · ${sel.weapon.props.map(keyName).join(', ')}` : ''}{sel.weapon.range === 'ranged' && sel.weapon.reach ? ` · ${sel.weapon.reach}/${sel.weapon.long} ft.` : ''}</p>}
        {sel.armor && <p>{keyName(sel.armor.cat)} armour · {sel.armor.cat === 'shield' ? '+2 AC' : `AC ${sel.armor.base}${sel.armor.dex ? (sel.armor.max ? ' + Dex (max 2)' : ' + Dex') : ''}`}{sel.armor.str ? ` · Strength ${sel.armor.str}` : ''}{sel.armor.stealth ? ' · disadvantage on Stealth' : ''}</p>}
        {sel.contents && <p>Holds: {sel.contents.map(([k, c]) => `${c > 1 ? c + ' × ' : ''}${r.equipBy[k]?.name || keyName(k)}`).join(', ')}.</p>}
        {sel.desc && <Markdown text={sel.desc} />}
      </article>}
      {cats.map(c => {
        const items = r.equipment.filter(e => e.cat === c && (!n || e.name.toLowerCase().includes(n)))
        if (!items.length) return null
        return <section key={c}><h2 className="group-h">{keyName(c)}</h2>
          <table className="equip-table"><tbody>{items.map(e => (
            <tr key={e.key} className={open === e.key ? 'sel' : ''} onClick={() => navigate(`/compendium/equipment/${e.key}`)}>
              <td><b>{e.name}</b></td>
              <td className="muted small">{e.weapon ? `${e.weapon.dmg} ${e.weapon.type}` : e.armor ? (e.armor.cat === 'shield' ? '+2' : `AC ${e.armor.base}${e.armor.dex ? (e.armor.max ? '+Dex≤2' : '+Dex') : ''}`) : keyName(e.gear || e.tool || '')}</td>
              <td className="muted small hide-sm">{e.weapon?.props.map(keyName).join(', ')}</td>
              <td className="num muted small">{e.cost ? `${e.cost[0]} ${e.cost[1]}` : ''}</td>
              <td className="num muted small hide-sm">{e.w ? `${e.w} lb` : ''}</td>
            </tr>))}</tbody></table>
        </section>
      })}
    </div>
  )
}

function Magic() {
  const navigate = useNavigate()
  const all = useLoad(loadMagic)
  const [q, setQ] = useState('')
  const [rar, setRar] = useState('')
  if (!all) return <Loading />
  const rarities = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies']
  const list = all.filter(m => (!q || m.name.toLowerCase().includes(q.toLowerCase())) && (!rar || m.rarity === rar))
  return (
    <div>
      <div className="toolbar"><input className="input" placeholder="Find a magic item" value={q} onChange={e => setQ(e.target.value)} aria-label="Find" />
        <Select value={rar} onChange={setRar} ariaLabel="Rarity" options={[{ value: '', label: 'Every rarity' }, ...rarities.map(x => ({ value: x, label: x }))]} /></div>
      <p className="muted small">{list.length} items</p>
      <ul className="mon-list">{list.map(m => (
        <li key={m.key}><button type="button" className="mon-row" onClick={() => navigate(`/compendium/magic-items/${m.key}`)}>
          <Icon name="sparkles" size={18} />
          <span className="grow"><b>{m.name}</b><span className="muted small">{m.cat}{m.attune ? ' · attunement' : ''}</span></span>
          <span className={`rarity ${m.rarity.toLowerCase().replace(/\s+/g, '-')}`}>{m.rarity}</span>
        </button></li>))}</ul>
    </div>
  )
}

function MagicPage({ k }: { k: string }) {
  const navigate = useNavigate()
  const m = useLoad(() => loadMagicItem(k), [k])
  useCrumb(m?.name, '/compendium/magic-items')
  if (!m) return <Loading />
  return <div className="spell-page"><button type="button" className="btn ghost sm" onClick={() => navigate('/compendium/magic-items')}><Icon name="chevron-left" size={14} />All magic items</button>
    <article className="spell-card"><h2 className="spell-title">{m.name}</h2><p className="kicker"><span className={`rarity ${m.rarity.toLowerCase().replace(/\s+/g, '-')}`}>{m.rarity}</span> {m.line}</p><Markdown text={m.desc || ''} /></article></div>
}

function Conditions({ open }: { open?: string }) {
  const r = useRules()
  useEffect(() => { if (open) document.getElementById('cond-' + open)?.scrollIntoView({ block: 'center' }) }, [open, r])
  if (!r) return <Loading />
  return <div className="cond-grid">{r.conditions.map(c => <article key={c.key} id={'cond-' + c.key} className={`card-lite cond-card ${open === c.key ? 'sel' : ''}`}><h2>{c.name}</h2><Markdown text={c.desc || ''} /></article>)}</div>
}

function RulesText({ open }: { open?: string }) {
  const navigate = useNavigate()
  const all = useLoad(loadRuleSections)
  const [q, setQ] = useState('')
  if (!all) return <Loading />
  const sel = all.find(x => x.key === open) || all[0]
  const list = all.filter(x => !q || (x.name + (x.md || '')).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="rules-grid">
      <aside><input className="input" placeholder="Find in the rules" value={q} onChange={e => setQ(e.target.value)} aria-label="Find" />
        <ul className="rules-toc">{list.map(x => <li key={x.key}><button type="button" className={x.key === sel.key ? 'on' : ''} onClick={() => navigate(`/compendium/rules/${x.key}`)}>{x.name}</button></li>)}</ul></aside>
      <article className="rules-text"><h2 className="spell-title">{sel.name}</h2><Markdown text={sel.md || ''} skipFirstHeading /></article>
    </div>
  )
}

export type { MonsterRow }
