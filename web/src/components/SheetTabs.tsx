// The tabs of a character sheet.
import { useState } from 'react'
import { api, V1 } from '../lib/api'
import { fmtMod, newId, PREPARES, subclassSpells, sumCoins } from '../lib/rules'
import { keyName, loadMagicItem, loadSpell, loadSpells, ordinal, SCHOOL_COLORS, spellLevel, useLoad } from '../lib/srd'
import type { InvItem, ItemKind, Sheet, Spell } from '../lib/types'
import type { SheetCtx } from '../pages/Character'
import { Markdown } from './Markdown'
import { Pips } from './Game'
import { ItemPicker, SpellPicker, type Picked } from './Pickers'
import { Icon } from './icons'
import { Empty, errMsg, useToast } from './ui'

const ACTIONS: [string, string][] = [
  ['Attack', 'Make one weapon attack (more with Extra Attack).'], ['Cast a Spell', 'A spell with a casting time of 1 action.'],
  ['Dash', 'Move again, up to your speed.'], ['Disengage', 'Your movement does not provoke opportunity attacks this turn.'],
  ['Dodge', 'Attacks against you have disadvantage; you have advantage on Dexterity saves.'], ['Help', 'An ally gets advantage on their next check or attack.'],
  ['Hide', 'Make a Dexterity (Stealth) check.'], ['Ready', 'Choose a trigger and a reaction to it.'], ['Search', 'Make a Wisdom (Perception) or Intelligence (Investigation) check.'],
  ['Use an Object', 'Interact with a second object, or use one that needs an action.'],
]

export function ActionsTab({ ctx }: { ctx: SheetCtx }) {
  const { s, d, set, roll, readOnly } = ctx
  return (
    <div className="tab-body">
      <section className="sheet-card">
        <h3 className="sheet-h">Attacks</h3>
        <table className="attacks">
          <thead><tr><th>Name</th><th>Hit</th><th>Damage</th><th className="notes-col">Notes</th></tr></thead>
          <tbody>
            {d.attacks.map((a, i) => {
              const dmgExpr = a.dmg.split(' ')[0].replace('−', '-')
              const rollable = /\d*d\d+/.test(dmgExpr) || /^\d+$/.test(dmgExpr)
              return (
                <tr key={i}>
                  <td><b>{a.name}</b>{a.type && <span className="muted small"> {a.type}</span>}</td>
                  <td>{a.bonus != null ? <button type="button" className="roll-bit big" onClick={() => roll(`1d20${a.bonus! >= 0 ? '+' + a.bonus : a.bonus}`, `${a.name}: attack`, a.kind === 'spell' ? 'spell' : 'attack')}>{fmtMod(a.bonus)}</button>
                    : a.save ? <span className="save-dc">{a.save}</span> : <span className="muted">—</span>}
                    {a.crit < 20 && <span className="muted small" title="Critical hit range"> {a.crit}–20</span>}</td>
                  <td>
                    {rollable ? <button type="button" className="roll-bit big" onClick={() => roll(dmgExpr, `${a.name}: damage`, 'damage', { noAdv: true })}>{a.dmg}</button> : a.dmg}
                    {rollable && /d/.test(dmgExpr) && <button type="button" className="crit-btn" onClick={() => roll(dmgExpr, `${a.name}: damage`, 'damage', { noAdv: true, crit: true })} title="Critical hit damage">×2</button>}
                  </td>
                  <td className="notes-col muted small">{a.notes}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {s.resources.length > 0 && <section className="sheet-card">
        <h3 className="sheet-h">Uses</h3>
        <ul className="resources">
          {s.resources.map(x => (
            <li key={x.id}>
              <span className="grow">{x.name}<span className="muted small"> · back after a {x.reset} rest</span></span>
              <Pips max={x.max} used={x.used} label={x.name} onChange={readOnly ? undefined : u => set(y => ({ ...y, resources: y.resources.map(z => (z.id === x.id ? { ...z, used: Math.max(0, Math.min(z.max, u)) } : z)) }))} />
            </li>
          ))}
        </ul>
      </section>}

      <section className="sheet-card">
        <h3 className="sheet-h">In combat</h3>
        <div className="action-chips">
          {ACTIONS.map(([n, h]) => <span key={n} className="action-chip" title={h}>{n}</span>)}
        </div>
        <p className="muted small">On your turn: move up to your speed and take one action; a bonus action if something gives you one; one reaction a round (an opportunity attack, a spell like <i>shield</i>).</p>
      </section>
    </div>
  )
}

// ---- spells ----

export function SpellsTab({ ctx }: { ctx: SheetCtx }) {
  const { s, d, r, set, roll, readOnly } = ctx
  const all = useLoad(loadSpells)
  const [picker, setPicker] = useState<{ cls: string; max: number; only?: string[] } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const byKey = Object.fromEntries((all || []).map(x => [x.key, x])) as Record<string, Spell>
  const always = new Set<string>()
  for (const c of s.classes) for (const k of subclassSpells(r.classBy[c.key], c.sub, c.level)) always.add(k)
  const rows = s.spells.map(ref => ({ ref, sp: byKey[ref.key] })).filter(x => x.sp)
  const levels = [...new Set(rows.map(x => x.sp.level))].sort((a, b) => a - b)
  const cast = (sp: Spell) => {
    if (sp.level === 0) return
    const lvl = s.slots_used.findIndex((u, i) => i + 1 >= sp.level && d.slots[i] - u > 0)
    if (lvl >= 0) set(x => ({ ...x, slots_used: x.slots_used.map((u, i) => (i === lvl ? u + 1 : u)) }))
    else if (d.pact && d.pact.level >= sp.level && s.pact_used < d.pact.count) set(x => ({ ...x, pact_used: x.pact_used + 1 }))
  }
  const remove = (key: string, cls: string) => set(x => ({ ...x, spells: x.spells.filter(y => !(y.key === key && y.cls === cls)) }))
  const togglePrep = (key: string, cls: string) => set(x => ({ ...x, spells: x.spells.map(y => (y.key === key && y.cls === cls ? { ...y, prepared: !y.prepared } : y)) }))
  return (
    <div className="tab-body">
      {d.casting.length > 0 && <section className="casting">
        {d.casting.map(c => {
          const mine = s.spells.filter(x => x.cls === c.cls)
          const prepared = mine.filter(x => x.prepared && !x.always && byKey[x.key]?.level > 0).length
          const cantrips = mine.filter(x => byKey[x.key]?.level === 0).length
          const known = mine.filter(x => byKey[x.key]?.level > 0 && !x.always).length
          return (
            <div key={c.cls} className="casting-card">
              <div className="casting-name">{c.name} spells</div>
              <div className="casting-nums">
                <span><small>Ability</small><b>{c.ability.toUpperCase()}</b></span>
                <span><small>Save DC</small><b>{c.dc}</b></span>
                <button type="button" className="roll-bit" onClick={() => roll(`1d20+${c.attack}`, `${c.name} spell attack`, 'spell')}><small>Attack</small><b>{fmtMod(c.attack)}</b></button>
                <span><small>Cantrips</small><b className={cantrips > c.cantrips ? 'over' : ''}>{cantrips}/{c.cantrips}</b></span>
                {c.prepares ? <span title="Prepared spells (not counting the ones always prepared)"><small>Prepared</small><b className={prepared > c.prepared ? 'over' : ''}>{prepared}/{c.prepared}</b></span>
                  : <span><small>Known</small><b className={known > c.known ? 'over' : ''}>{known}/{c.known}</b></span>}
              </div>
              {!readOnly && <button type="button" className="btn sm" onClick={() => setPicker({ cls: c.cls, max: Math.max(c.maxLevel, d.pact && c.cls === 'warlock' ? d.pact.level : 0) })}>
                <Icon name="plus" size={14} />{c.cls === 'wizard' ? 'Add to the spellbook' : c.prepares ? 'Add a spell' : 'Learn a spell'}</button>}
            </div>
          )
        })}
      </section>}

      {(d.slots.some(n => n > 0) || d.pact) && <section className="slots">
        {d.slots.map((n, i) => n > 0 && <div key={i} className="slot">
          <span className="slot-k">{ordinal(i + 1)}</span>
          <Pips max={n} used={Math.min(n, s.slots_used[i])} label={`${ordinal(i + 1)} level slots`} onChange={readOnly ? undefined : u => set(x => ({ ...x, slots_used: x.slots_used.map((v, j) => (j === i ? Math.max(0, Math.min(n, u)) : v)) }))} />
        </div>)}
        {d.pact && <div className="slot pact">
          <span className="slot-k">Pact · {ordinal(d.pact.level)}</span>
          <Pips max={d.pact.count} used={Math.min(d.pact.count, s.pact_used)} label="pact slots" onChange={readOnly ? undefined : u => set(x => ({ ...x, pact_used: Math.max(0, Math.min(d.pact!.count, u)) }))} />
        </div>}
      </section>}

      {!all ? null : rows.length === 0 ? <Empty title="No spells yet" icon="wand">{d.casting.length ? 'Add the spells your character knows or has in the spellbook.' : 'This character does not cast spells.'}</Empty> : levels.map(lv => (
        <section key={lv} className="sheet-card spell-level">
          <h3 className="sheet-h">{lv === 0 ? 'Cantrips' : `${ordinal(lv)} level`}</h3>
          <ul className="spells">
            {rows.filter(x => x.sp.level === lv).map(({ ref, sp }) => {
              const isAlways = ref.always || always.has(sp.key)
              const prepares = PREPARES.includes(ref.cls) && sp.level > 0
              const key = ref.key + ref.cls
              return (
                <li key={key} className={`spell ${prepares && !ref.prepared && !isAlways ? 'unprepared' : ''}`}>
                  <div className="spell-row">
                    {prepares && <button type="button" className={`prep ${ref.prepared || isAlways ? 'on' : ''}`} disabled={readOnly || isAlways} onClick={() => togglePrep(ref.key, ref.cls)} title={isAlways ? 'Always prepared' : ref.prepared ? 'Prepared' : 'Not prepared'} aria-pressed={ref.prepared || isAlways} />}
                    <button type="button" className="spell-name" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
                      <span className="school-dot" style={{ background: SCHOOL_COLORS[sp.school] }} aria-hidden="true" />
                      <b>{sp.name}</b>
                      {sp.conc && <span className="badge" title="Concentration">C</span>}
                      {sp.ritual && <span className="badge" title="Ritual">R</span>}
                      {isAlways && <span className="badge alt" title="Always prepared">always</span>}
                    </button>
                    <span className="muted small hide-sm">{sp.time} · {sp.range}</span>
                    {!readOnly && sp.level > 0 && <button type="button" className="btn ghost sm" onClick={() => cast(sp)} title="Cast: uses the lowest free slot">Cast</button>}
                  </div>
                  {open === key && <SpellDetail spell={sp} onRoll={(e, l) => roll(e, `${sp.name}: ${l}`, l === 'attack' ? 'spell' : 'damage', { noAdv: l !== 'attack' })} onRemove={readOnly ? undefined : () => remove(ref.key, ref.cls)} />}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {picker && <SpellPicker title="Add a spell" cls={picker.cls} maxLevel={picker.max} have={s.spells.filter(x => x.cls === picker.cls).map(x => x.key)}
        onClose={() => setPicker(null)} onPick={sp => set(x => ({ ...x, spells: [...x.spells, { key: sp.key, cls: picker.cls, prepared: !PREPARES.includes(picker.cls) || sp.level === 0 }] }))} />}
    </div>
  )
}

export function SpellDetail({ spell, onRoll, onRemove }: { spell: Spell; onRoll?: (expr: string, label: string) => void; onRemove?: () => void }) {
  const full = useLoad(() => loadSpell(spell.key), [spell.key])
  const sp = full || spell
  const dmg = sp.dmg_slot ? Object.entries(sp.dmg_slot)[0]?.[1] : sp.dmg_char ? Object.entries(sp.dmg_char)[0]?.[1] : ''
  const heal = sp.heal_slot ? Object.entries(sp.heal_slot)[0]?.[1] : ''
  return (
    <div className="spell-detail">
      <div className="spell-props">
        <span><small>Casting time</small>{sp.time}</span><span><small>Range</small>{sp.range}</span>
        <span><small>Components</small>{sp.comp}{sp.mat ? ` (${sp.mat})` : ''}</span><span><small>Duration</small>{sp.conc ? 'Concentration, ' : ''}{sp.dur}</span>
      </div>
      {!full ? <p className="muted small">…</p> : <Markdown text={sp.desc || ''} />}
      {sp.higher && <p className="small"><b>At higher levels.</b> {sp.higher}</p>}
      {onRoll && <div className="row wrap">
        {sp.attack && <button type="button" className="btn sm" onClick={() => onRoll('', 'attack')} disabled>Use your spell attack above</button>}
        {dmg && <button type="button" className="btn sm" onClick={() => onRoll(String(dmg).replace(/\s/g, '').replace(/\+MOD/i, ''), 'damage')}><Icon name="d20" size={14} />{String(dmg)} {sp.dmg_type}</button>}
        {heal && <button type="button" className="btn sm" onClick={() => onRoll(String(heal).replace(/\s/g, '').replace(/\+MOD/i, ''), 'healing')}><Icon name="heart" size={14} />{String(heal).replace(/\+\s*MOD/i, ' + modifier')}</button>}
        {onRemove && <button type="button" className="btn ghost sm danger-text" onClick={onRemove}><Icon name="trash" size={14} />Remove</button>}
      </div>}
      <p className="muted small">{spellLevel(sp.level)} {sp.school} · {sp.classes.map(keyName).join(', ')}</p>
    </div>
  )
}

// ---- inventory ----

const KIND_LABEL: Record<ItemKind, string> = { weapon: 'Weapons', armor: 'Armour', shield: 'Armour', magic: 'Magic items', gear: 'Gear', tool: 'Tools', treasure: 'Treasure' }

export function InventoryTab({ ctx }: { ctx: SheetCtx }) {
  const { s, d, r, set, readOnly } = ctx
  const [pick, setPick] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const attuned = s.inventory.filter(i => i.attuned).length
  const upd = (id: string, f: (i: InvItem) => InvItem) => set(x => ({ ...x, inventory: x.inventory.map(i => (i.id === id ? f(i) : i)) }))
  const groups: ItemKind[] = ['weapon', 'armor', 'magic', 'gear', 'tool', 'treasure']
  const add = (p: Picked) => {
    let it: InvItem
    if (p.kind === 'equipment') {
      const e = p.e
      const kind: ItemKind = e.weapon ? 'weapon' : e.armor ? (e.armor.cat === 'shield' ? 'shield' : 'armor') : e.cat === 'tools' ? 'tool' : 'gear'
      it = { id: newId(), key: e.key, name: e.name, kind, qty: e.qty || 1, w: e.w || 0 }
    } else if (p.kind === 'magic') it = { id: newId(), magic: p.m.key, name: p.m.name, kind: 'magic', qty: 1, w: 0 }
    else it = { id: newId(), name: p.name, kind: 'gear', qty: 1, w: 0 }
    set(x => ({ ...x, inventory: [...x.inventory, it] }))
    setPick(false)
  }
  const coin = (k: keyof Sheet['coins'], v: string) => set(x => ({ ...x, coins: { ...x.coins, [k]: Math.max(0, Math.floor(Number(v) || 0)) } }))
  return (
    <div className="tab-body">
      <section className="coins">
        {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(k => (
          <label key={k} className={`coin ${k}`}><span className="coin-face" aria-hidden="true">{k}</span>
            <input className="input num" inputMode="numeric" value={s.coins[k]} disabled={readOnly} onChange={e => coin(k, e.target.value)} aria-label={k} />
          </label>
        ))}
        <span className="muted small coin-total">≈ {Math.round(sumCoins(s.coins) * 100) / 100} gp</span>
      </section>
      <div className="carry">
        <span className="carry-bar"><span style={{ width: `${Math.min(100, (d.carried / Math.max(1, d.capacity)) * 100)}%` }} className={d.carried > d.capacity ? 'over' : ''} /></span>
        <span className="muted small">Carrying {d.carried} lb of {d.capacity} lb{attuned ? ` · attuned to ${attuned} of 3` : ''}</span>
        {!readOnly && <button type="button" className="btn sm primary" onClick={() => setPick(true)}><Icon name="plus" size={14} />Add</button>}
      </div>
      {s.inventory.length === 0 && <Empty title="Nothing carried" icon="bag">Add weapons, armour, gear and treasure.</Empty>}
      {groups.map(g => {
        const items = s.inventory.filter(i => (g === 'armor' ? i.kind === 'armor' || i.kind === 'shield' : i.kind === g))
        if (!items.length) return null
        return (
          <section key={g} className="sheet-card">
            <h3 className="sheet-h">{KIND_LABEL[g]}</h3>
            <ul className="inv">
              {items.map(i => {
                const eq = i.key ? r.equipBy[i.key] : undefined
                const wearable = ['weapon', 'armor', 'shield', 'magic'].includes(i.kind)
                return (
                  <li key={i.id} className={i.equipped ? 'equipped' : ''}>
                    <div className="inv-row">
                      {wearable && <button type="button" className={`equip ${i.equipped ? 'on' : ''}`} disabled={readOnly} onClick={() => upd(i.id, x => ({ ...x, equipped: !x.equipped }))} title={i.equipped ? 'Equipped' : 'Not equipped'} aria-pressed={!!i.equipped}><Icon name={i.kind === 'weapon' ? 'swords' : i.kind === 'magic' ? 'sparkles' : 'shield'} size={13} /></button>}
                      <button type="button" className="inv-name" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>
                        <b>{i.name}</b>{i.bonus ? <span className="badge">+{i.bonus}</span> : null}
                        <span className="muted small">{eq?.weapon ? ` ${eq.weapon.dmg} ${eq.weapon.type}` : eq?.armor ? (eq.armor.cat === 'shield' ? ' +2 AC' : ` AC ${eq.armor.base}`) : ''}</span>
                      </button>
                      {i.magic && <button type="button" className={`attune ${i.attuned ? 'on' : ''}`} disabled={readOnly || (!i.attuned && attuned >= 3)} onClick={() => upd(i.id, x => ({ ...x, attuned: !x.attuned }))} title="Attuned (at most 3)">attuned</button>}
                      <span className="qty">
                        {!readOnly && <button type="button" className="btn ghost sm icon-only" onClick={() => upd(i.id, x => ({ ...x, qty: Math.max(0, x.qty - 1) }))} aria-label="One fewer"><Icon name="minus" size={12} /></button>}
                        <span className="num">{i.qty}</span>
                        {!readOnly && <button type="button" className="btn ghost sm icon-only" onClick={() => upd(i.id, x => ({ ...x, qty: x.qty + 1 }))} aria-label="One more"><Icon name="plus" size={12} /></button>}
                      </span>
                      <span className="muted small num hide-sm">{i.w ? `${Math.round(i.w * i.qty * 10) / 10} lb` : ''}</span>
                    </div>
                    {open === i.id && <ItemDetail i={i} ctx={ctx} onChange={f => upd(i.id, f)} onRemove={() => set(x => ({ ...x, inventory: x.inventory.filter(y => y.id !== i.id) }))} />}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {pick && <ItemPicker rules={r} onClose={() => setPick(false)} onPick={add} />}
    </div>
  )
}

function ItemDetail({ i, ctx, onChange, onRemove }: { i: InvItem; ctx: SheetCtx; onChange: (f: (i: InvItem) => InvItem) => void; onRemove: () => void }) {
  const magic = useLoad(() => (i.magic ? loadMagicItem(i.magic) : Promise.resolve(null)), [i.magic])
  const eq = i.key ? ctx.r.equipBy[i.key] : undefined
  return (
    <div className="inv-detail">
      {magic && <><p className="muted small"><i>{magic.line}</i></p><Markdown text={magic.desc || ''} /></>}
      {eq?.desc && <Markdown text={eq.desc} />}
      {eq?.weapon && <p className="small muted">{eq.weapon.cat} {eq.weapon.range} weapon{eq.weapon.props.length ? ` · ${eq.weapon.props.join(', ')}` : ''}{eq.weapon.two ? ` · ${eq.weapon.two} two-handed` : ''}</p>}
      {eq?.armor && eq.armor.cat !== 'shield' && <p className="small muted">{eq.armor.cat} armour{eq.armor.str ? ` · needs Strength ${eq.armor.str}` : ''}{eq.armor.stealth ? ' · disadvantage on Stealth' : ''}</p>}
      {eq?.contents && <p className="small">Holds: {eq.contents.map(([k, n]) => `${n > 1 ? n + ' × ' : ''}${ctx.r.equipBy[k]?.name || keyName(k)}`).join(', ')}.</p>}
      {!ctx.readOnly && <div className="row wrap">
        {(i.kind === 'weapon' || i.kind === 'armor' || i.kind === 'shield') && <label className="row small">Magic bonus
          <input className="input num sm" inputMode="numeric" value={i.bonus || 0} onChange={e => onChange(x => ({ ...x, bonus: Math.max(0, Math.min(3, Number(e.target.value) || 0)) }))} style={{ width: 52 }} /></label>}
        <input className="input sm grow" placeholder="Notes" value={i.notes || ''} onChange={e => onChange(x => ({ ...x, notes: e.target.value }))} aria-label="Notes" />
        <button type="button" className="btn ghost sm danger-text" onClick={onRemove}><Icon name="trash" size={14} />Remove</button>
      </div>}
      {i.notes && ctx.readOnly && <p className="small">{i.notes}</p>}
    </div>
  )
}

// ---- features ----

export function FeaturesTab({ ctx }: { ctx: SheetCtx }) {
  const { s, d, r, set, readOnly } = ctx
  const [open, setOpen] = useState<string | null>(null)
  const groups = [...new Set(d.features.map(f => f.from))]
  return (
    <div className="tab-body">
      {groups.map(g => (
        <section key={g} className="sheet-card">
          <h3 className="sheet-h">{g}</h3>
          <ul className="features">
            {d.features.filter(f => f.from === g).map((f, i) => {
              const k = f.key + i
              const picks = s.choices[f.key] || []
              const opts = f.choose?.from || []
              const need = f.choose && picks.length < f.choose.n
              return (
                <li key={k} className={f.name.startsWith('·') ? 'sub' : ''}>
                  <button type="button" className="feature-name" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                    <b>{f.name}</b>{f.level > 0 && <span className="muted small"> · level {f.level}</span>}
                    {need && <span className="badge warn">choose</span>}
                  </button>
                  {(open === k || (need && !readOnly)) && <div className="feature-desc">
                    {open === k && <Markdown text={f.desc} />}
                    {f.choose && !readOnly && <div className="choose">
                      <span className="small muted">Choose {f.choose.n}:</span>
                      {opts.map(o => {
                        const on = picks.includes(o)
                        const name = (r.features[o]?.name || r.traits[o]?.name || keyName(o)).replace(/^.*?:\s*/, '').replace(/^Draconic Ancestry \((.*)\)$/, '$1')
                        return <button key={o} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => set(x => {
                          const cur = x.choices[f.key] || []
                          const next = on ? cur.filter(y => y !== o) : [...cur, o].slice(-f.choose!.n)
                          return { ...x, choices: { ...x.choices, [f.key]: next } }
                        })}>{name}</button>
                      })}
                    </div>}
                  </div>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <ExtraFeatures ctx={ctx} />
    </div>
  )
}

function ExtraFeatures({ ctx }: { ctx: SheetCtx }) {
  const { s, set, readOnly } = ctx
  const [name, setName] = useState('')
  if (readOnly) return null
  return (
    <section className="sheet-card">
      <h3 className="sheet-h">Your own</h3>
      <p className="muted small">A boon, a magic tattoo, a house-rule feat: anything the rules above don't cover.</p>
      {s.features_extra.map((f, i) => (
        <div key={i} className="extra-feature">
          <input className="input" value={f.name} onChange={e => set(x => ({ ...x, features_extra: x.features_extra.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))} aria-label="Name" />
          <textarea className="input" rows={2} value={f.desc} onChange={e => set(x => ({ ...x, features_extra: x.features_extra.map((y, j) => (j === i ? { ...y, desc: e.target.value } : y)) }))} aria-label="What it does" />
          <button type="button" className="btn ghost sm danger-text" onClick={() => set(x => ({ ...x, features_extra: x.features_extra.filter((_, j) => j !== i) }))}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <div className="row"><input className="input grow" placeholder="Name of a feature" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { set(x => ({ ...x, features_extra: [...x.features_extra, { name: name.trim(), desc: '' }] })); setName('') } }} />
        <button type="button" className="btn sm" disabled={!name.trim()} onClick={() => { set(x => ({ ...x, features_extra: [...x.features_extra, { name: name.trim(), desc: '' }] })); setName('') }}>Add</button></div>
    </section>
  )
}

// ---- story ----

export function StoryTab({ ctx }: { ctx: SheetCtx }) {
  const { c, s, d, set, readOnly } = ctx
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const t = (k: keyof Sheet['traits'], label: string, ph: string) => (
    <label className="field"><span className="label">{label}</span>
      {readOnly ? <p className="story-text">{s.traits[k] || '—'}</p> : <textarea className="input" rows={2} placeholder={ph} value={s.traits[k] || ''} onChange={e => set(x => ({ ...x, traits: { ...x.traits, [k]: e.target.value } }))} />}
    </label>
  )
  const b = (k: keyof Sheet['bio'], label: string, rows = 3, ph = '') => (
    <label className="field"><span className="label">{label}</span>
      {readOnly ? <p className="story-text">{s.bio[k] || '—'}</p> : <textarea className="input" rows={rows} placeholder={ph} value={s.bio[k] || ''} onChange={e => set(x => ({ ...x, bio: { ...x.bio, [k]: e.target.value } }))} />}
    </label>
  )
  const backstory = async () => {
    setBusy(true)
    try {
      const traits = [s.traits.personality, s.traits.ideals, s.traits.bonds, s.traits.flaws].filter(Boolean).join(' ')
      const r = await api.post<{ text: string }>(`${V1}/ai/backstory`, { character_id: c.id, background: d.backgroundName, alignment: d.alignmentName, traits, hint: s.bio.backstory?.slice(0, 400) })
      set(x => ({ ...x, bio: { ...x.bio, backstory: r.text } }))
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  const toNotes = async () => {
    try {
      const content = `# ${c.name}\n\n${d.speciesName} · ${d.classesText}\n\n## Backstory\n\n${s.bio.backstory || ''}\n\n## Personality\n\n${s.traits.personality || ''}\n\n**Ideals.** ${s.traits.ideals || ''}\n\n**Bonds.** ${s.traits.bonds || ''}\n\n**Flaws.** ${s.traits.flaws || ''}\n`
      const r = await api.post<{ text: string; url: string }>(`${V1}/apps/note`, { title: c.name, content })
      toast(r.text, 'ok', r.url ? { label: 'Open', run: () => window.open(r.url, '_blank') } : undefined)
    } catch (e) { toast(errMsg(e), 'err') }
  }
  return (
    <div className="tab-body story">
      <section className="sheet-card">
        <h3 className="sheet-h">Personality</h3>
        {t('personality', 'Personality traits', 'How they talk, what they do when nervous…')}
        {t('ideals', 'Ideals', 'What they believe in')}
        {t('bonds', 'Bonds', 'Who and what they care about')}
        {t('flaws', 'Flaws', 'What could bring them down')}
      </section>
      <section className="sheet-card">
        <div className="sheet-h-row"><h3 className="sheet-h">Backstory</h3>
          {!readOnly && <><button type="button" className="btn ghost sm" onClick={backstory} disabled={busy}><Icon name="sparkles" size={14} />{busy ? 'Writing…' : s.bio.backstory ? 'Rewrite with AI' : 'Write with AI'}</button>
            <button type="button" className="btn ghost sm" onClick={toNotes}><Icon name="note" size={14} />To Notes</button></>}</div>
        {b('backstory', 'Where they come from', 7, 'A few lines are enough; the AI can write the rest from what you put here.')}
        {b('appearance', 'Appearance', 2)}
        {b('allies', 'Allies and organisations', 2)}
        {b('notes', 'Notes', 4)}
      </section>
      <section className="sheet-card details-grid">
        {(['age', 'height', 'weight', 'eyes', 'hair', 'skin', 'faith'] as const).map(k => (
          <label key={k} className="field"><span className="label">{k === 'faith' ? 'Faith' : k[0].toUpperCase() + k.slice(1)}</span>
            {readOnly ? <span>{s.bio[k] || '—'}</span> : <input className="input" value={s.bio[k] || ''} onChange={e => set(x => ({ ...x, bio: { ...x.bio, [k]: e.target.value } }))} />}
          </label>
        ))}
      </section>
    </div>
  )
}
