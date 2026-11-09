// Choosing from the rules: a spell, a piece of equipment or a magic item, a monster.
import { useMemo, useState } from 'react'
import { crText, loadMagic, loadMonsters, loadSpells, SCHOOL_COLORS, spellLevel, titleCase, useLoad, type Rules } from '../lib/srd'
import type { Equipment, MagicItem, MonsterRow, Spell } from '../lib/types'
import { CreatureIcon } from './Art'
import { Icon } from './icons'
import { Loading, Modal, Segmented } from './ui'

export function SpellPicker({ title, cls, maxLevel, have, onPick, onClose, only }: { title: string; cls?: string; maxLevel: number; have: string[]; onPick: (sp: Spell) => void; onClose: () => void; only?: string[] }) {
  const all = useLoad(loadSpells)
  const [q, setQ] = useState('')
  const [lvl, setLvl] = useState<number | -1>(-1)
  const list = useMemo(() => (all || []).filter(sp => (only ? only.includes(sp.key) : !cls || sp.classes.includes(cls)) && sp.level <= maxLevel && (lvl < 0 || sp.level === lvl)
    && (!q || sp.name.toLowerCase().includes(q.toLowerCase()))), [all, cls, maxLevel, lvl, q, only])
  const levels = Array.from({ length: maxLevel + 1 }, (_, i) => i)
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="picker-bar">
        <input className="input" autoFocus placeholder="Find a spell" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a spell" />
        <Segmented size="sm" label="Level" value={lvl} onChange={setLvl} options={[{ value: -1 as const, label: 'All' }, ...levels.map(l => ({ value: l, label: l === 0 ? 'Cantrips' : String(l) }))]} />
      </div>
      {!all ? <Loading /> : <ul className="pick-list">
        {list.map(sp => {
          const had = have.includes(sp.key)
          return (
            <li key={sp.key}>
              <button type="button" className={`pick-row ${had ? 'had' : ''}`} onClick={() => onPick(sp)} disabled={had}>
                <span className="school-dot" style={{ background: SCHOOL_COLORS[sp.school] }} aria-hidden="true" />
                <span className="grow"><b>{sp.name}</b><span className="muted small"> · {spellLevel(sp.level)} {sp.school}{sp.conc ? ' · concentration' : ''}{sp.ritual ? ' · ritual' : ''}</span></span>
                <span className="muted small">{sp.time}</span>
                {had ? <Icon name="check" size={15} /> : <Icon name="plus" size={15} />}
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="muted pad">No spell matches.</li>}
      </ul>}
    </Modal>
  )
}

export type Picked = { kind: 'equipment'; e: Equipment } | { kind: 'magic'; m: MagicItem } | { kind: 'custom'; name: string }

export function ItemPicker({ rules, onPick, onClose }: { rules: Rules; onPick: (p: Picked) => void; onClose: () => void }) {
  const magic = useLoad(loadMagic)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'weapon' | 'armor' | 'gear' | 'magic'>('weapon')
  const n = q.trim().toLowerCase()
  const eq = rules.equipment.filter(e => (tab === 'gear' ? !['weapon', 'armor'].includes(e.cat) : e.cat === tab) && (!n || e.name.toLowerCase().includes(n)))
  const mg = (magic || []).filter(m => !n || m.name.toLowerCase().includes(n))
  return (
    <Modal title="Add to the inventory" onClose={onClose} size="lg">
      <div className="picker-bar">
        <input className="input" autoFocus placeholder="Find an item" value={q} onChange={e => setQ(e.target.value)} aria-label="Find an item" />
        <Segmented size="sm" label="Kind" value={tab} onChange={setTab} options={[{ value: 'weapon', label: 'Weapons' }, { value: 'armor', label: 'Armour' }, { value: 'gear', label: 'Gear' }, { value: 'magic', label: 'Magic' }]} />
      </div>
      <ul className="pick-list">
        {tab !== 'magic' && eq.map(e => (
          <li key={e.key}><button type="button" className="pick-row" onClick={() => onPick({ kind: 'equipment', e })}>
            <Icon name={e.weapon ? 'swords' : e.armor ? 'shield' : 'bag'} size={15} />
            <span className="grow"><b>{e.name}</b><span className="muted small"> · {e.weapon ? `${e.weapon.dmg} ${e.weapon.type}${e.weapon.props.length ? ', ' + e.weapon.props.join(', ') : ''}` : e.armor ? (e.armor.cat === 'shield' ? '+2 AC' : `AC ${e.armor.base}${e.armor.dex ? (e.armor.max ? ' + Dex (max 2)' : ' + Dex') : ''}`) : titleCase((e.gear || e.tool || e.cat).replace(/-/g, ' '))}</span></span>
            <span className="muted small">{e.cost ? `${e.cost[0]} ${e.cost[1]}` : ''}{e.w ? ` · ${e.w} lb` : ''}</span>
          </button></li>
        ))}
        {tab === 'magic' && (!magic ? <Loading /> : mg.slice(0, 150).map(m => (
          <li key={m.key}><button type="button" className="pick-row" onClick={() => onPick({ kind: 'magic', m })}>
            <Icon name="sparkles" size={15} />
            <span className="grow"><b>{m.name}</b><span className="muted small"> · {m.cat}{m.attune ? ' · attunement' : ''}</span></span>
            <span className={`rarity ${m.rarity.toLowerCase().replace(/\s+/g, '-')}`}>{m.rarity}</span>
          </button></li>
        )))}
        {n && <li><button type="button" className="pick-row" onClick={() => onPick({ kind: 'custom', name: q.trim() })}><Icon name="plus" size={15} /><span className="grow">Add “{q.trim()}” as your own</span></button></li>}
      </ul>
    </Modal>
  )
}

export function MonsterPicker({ onPick, onClose, title = 'Add a monster' }: { onPick: (m: MonsterRow) => void; onClose: () => void; title?: string }) {
  const all = useLoad(loadMonsters)
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const list = (all || []).filter(m => !n || m.name.toLowerCase().includes(n) || m.type.includes(n)).slice(0, 200)
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="picker-bar"><input className="input" autoFocus placeholder="Find a monster (name or type)" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a monster" /></div>
      {!all ? <Loading /> : <ul className="pick-list">
        {list.map(m => (
          <li key={m.key}><button type="button" className="pick-row" onClick={() => onPick(m)}>
            <span className="type-ico"><CreatureIcon type={m.type} size={22} /></span>
            <span className="grow"><b>{m.name}</b>{m.mine && <span className="mine-tag">yours</span>}<span className="muted small"> · {m.size} {m.type}</span></span>
            <span className="cr-chip">CR {crText(m.cr)}</span>
            <span className="muted small num">{m.xp.toLocaleString()} XP</span>
          </button></li>
        ))}
      </ul>}
    </Modal>
  )
}
