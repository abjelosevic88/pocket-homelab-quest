// Editing a character by hand: details, the token and portrait, the base
// ability scores, proficiencies and languages, and the numbers the rules
// can't know (a magic bonus, a house rule).
import { useState } from 'react'
import { shrink, uploadPhoto } from '../lib/photo'
import { profBonus, totalLevel } from '../lib/rules'
import type { Rules } from '../lib/srd'
import type { Ability, Campaign, Character, Sheet, Token } from '../lib/types'
import { ABILITIES, ABILITY_NAMES } from '../lib/types'
import { CLASS_COLORS, CLASS_KEYS } from './Art'
import { CharacterToken } from './Game'
import { Icon } from './icons'
import { Field, Modal, Segmented, Tabs, errMsg, useToast } from './ui'
import { Select } from './Select'

const FRAMES: Token['frame'][] = ['gold', 'silver', 'bronze', 'iron', '']
const SWATCHES = ['#9f1d35', '#b8892e', '#3f7d4e', '#4a5bb5', '#6b3fa0', '#1d5f8a', '#8a6a2f', '#7a4a2a', '#c0508a', '#2f8f7a', '#444b57', '#a8323e']

export function CharacterEdit({ c, s, r, camps, onClose, onSave }: { c: Character; s: Sheet; r: Rules; camps: Campaign[]; onClose: () => void; onSave: (s: Sheet, meta: Partial<Character>) => void }) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'details' | 'scores' | 'profs' | 'numbers'>('details')
  const [n, setN] = useState<Sheet>(s)
  const [name, setName] = useState(c.name)
  const [player, setPlayer] = useState(c.player)
  const [camp, setCamp] = useState(c.campaign_id ? String(c.campaign_id) : '')
  const [kind, setKind] = useState(c.kind)
  const [token, setToken] = useState<Token>(c.token || {})
  const [photo, setPhoto] = useState<{ id: number | null; url: string }>({ id: c.photo_id, url: c.thumb_url || c.photo_url })
  const [busy, setBusy] = useState(false)
  const up = async (f: File) => {
    setBusy(true)
    try { const sh = await shrink(f); const p = await uploadPhoto(sh, 'portrait'); setPhoto({ id: p.id, url: p.thumb_url }) } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  const pb = profBonus(totalLevel(n))
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const save = () => onSave(n, { name: name.trim() || c.name, player: player.trim(), campaign_id: camp ? Number(camp) : null, kind, token, photo_id: photo.id, thumb_url: photo.url, photo_url: photo.url })
  return (
    <Modal title={`Edit ${c.name}`} onClose={onClose} size="lg" footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save} disabled={busy}>Save</button></>}>
      <Tabs tabs={[{ id: 'details', label: 'Details' }, { id: 'scores', label: 'Ability scores' }, { id: 'profs', label: 'Proficiencies' }, { id: 'numbers', label: 'Numbers' }]} value={tab} onChange={setTab} />
      {tab === 'details' && <div className="form-grid">
        <div className="token-edit">
          <CharacterToken c={{ ...c, name, token, thumb_url: photo.url, photo_url: photo.url }} size={96} />
          <div className="col">
            <label className="btn sm"><Icon name="camera" size={14} />{photo.id ? 'Another portrait' : 'Add a portrait'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void up(f) }} /></label>
            {photo.id && <button type="button" className="btn ghost sm" onClick={() => setPhoto({ id: null, url: '' })}>Use the emblem</button>}
          </div>
        </div>
        <Field label="Name"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Played by"><input className="input" value={player} onChange={e => setPlayer(e.target.value)} placeholder="The player's name" /></Field>
        <Field label="Campaign"><Select value={camp} onChange={setCamp} options={[{ value: '', label: 'No campaign' }, ...camps.map(x => ({ value: String(x.id), label: x.name }))]} ariaLabel="Campaign" /></Field>
        <Field label="Kind"><Segmented value={kind} onChange={setKind} options={[{ value: 'pc', label: 'Player character' }, { value: 'companion', label: 'Companion or sidekick' }]} label="Kind" /></Field>
        <Field label="Token colour" group>
          <div className="swatches">{SWATCHES.map(col => <button key={col} type="button" className={`swatch ${token.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => setToken(t => ({ ...t, color: col }))} aria-label={col} />)}
            <button type="button" className={`swatch auto ${!token.color ? 'on' : ''}`} onClick={() => setToken(t => ({ ...t, color: '' }))} title="The class colour" style={{ background: CLASS_COLORS[c.class_key] || '#888' }}>A</button></div>
        </Field>
        <Field label="Frame" group><Segmented size="sm" value={token.frame || ''} onChange={f => setToken(t => ({ ...t, frame: f as Token['frame'] }))} options={FRAMES.map(f => ({ value: f || '', label: f ? f[0].toUpperCase() + f.slice(1) : 'Pewter' }))} label="Frame" /></Field>
        <Field label="Emblem"><Select value={token.emblem || ''} onChange={v => setToken(t => ({ ...t, emblem: v }))} options={[{ value: '', label: 'The class' }, ...CLASS_KEYS.map(k => ({ value: k, label: r.classBy[k]?.name || k }))]} ariaLabel="Emblem" /></Field>
        <Field label="Alignment"><Select value={n.alignment} onChange={v => setN(x => ({ ...x, alignment: v }))} options={[{ value: '', label: 'None' }, ...r.alignments.map(a => ({ value: a.key, label: a.name }))]} ariaLabel="Alignment" /></Field>
        <Field label="Background"><input className="input" value={n.background_name || r.backgrounds.find(b => b.key === n.background)?.name || ''} onChange={e => setN(x => ({ ...x, background_name: e.target.value, background: r.backgrounds.some(b => b.name === e.target.value) ? x.background : '' }))} /></Field>
      </div>}
      {tab === 'scores' && <div>
        <p className="muted small">The scores before species bonuses and improvements (those are added on the sheet).</p>
        <div className="score-edit">
          {ABILITIES.map(a => (
            <label key={a} className="score-cell"><span>{ABILITY_NAMES[a]}</span>
              <input className="input num" inputMode="numeric" value={n.abilities[a]} onChange={e => setN(x => ({ ...x, abilities: { ...x.abilities, [a]: Math.max(1, Math.min(30, Number(e.target.value) || 0)) } }))} /></label>
          ))}
        </div>
        <Field label="Saving throws you are proficient in besides the class's" group>
          <div className="chips">{ABILITIES.map(a => <button key={a} type="button" className={`chip ${(n.save_profs || []).includes(a) ? 'on' : ''}`} onClick={() => setN(x => ({ ...x, save_profs: toggle(x.save_profs || [], a) as Ability[] }))}>{ABILITY_NAMES[a]}</button>)}</div>
        </Field>
      </div>}
      {tab === 'profs' && <div>
        <Field label={`Skills (proficient: +${pb}; expertise: +${pb * 2})`} group>
          <div className="skill-edit">
            {r.skills.map(sk => {
              const k = sk.key.replace(/^skill-/, '')
              const p = n.skills.includes(k), e = n.expertise.includes(k)
              return (
                <div key={k} className="skill-edit-row">
                  <span className="grow">{sk.name} <span className="muted small">{sk.ability.toUpperCase()}</span></span>
                  <Segmented size="sm" value={e ? 'e' : p ? 'p' : ''} label={sk.name} onChange={v => setN(x => ({ ...x, skills: v ? [...new Set([...x.skills, k])] : x.skills.filter(y => y !== k), expertise: v === 'e' ? [...new Set([...x.expertise, k])] : x.expertise.filter(y => y !== k) }))}
                    options={[{ value: '', label: '—' }, { value: 'p', label: 'Proficient' }, { value: 'e', label: 'Expertise' }]} />
                </div>
              )
            })}
          </div>
        </Field>
        <Field label="Languages" group>
          <div className="chips">{r.languages.map(l => <button key={l.key} type="button" className={`chip ${n.langs.includes(l.key) ? 'on' : ''}`} onClick={() => setN(x => ({ ...x, langs: toggle(x.langs, l.key) }))}>{l.name}</button>)}</div>
        </Field>
        <Field label="Tools and instruments" group>
          <div className="chips">{Object.entries(r.proficiencies).filter(([, p]) => /Tools|Musical|Gaming|Artisan|Kit|Vehicles/i.test(p.type)).map(([k, p]) => <button key={k} type="button" className={`chip ${n.tools.includes(k) ? 'on' : ''}`} onClick={() => setN(x => ({ ...x, tools: toggle(x.tools, k) }))}>{p.name}</button>)}</div>
        </Field>
        <Field label="Anything else"><input className="input" value={n.profs_extra} onChange={e => setN(x => ({ ...x, profs_extra: e.target.value }))} placeholder="e.g. proficient with nets" /></Field>
      </div>}
      {tab === 'numbers' && <div className="form-grid">
        <Field label="Experience points"><input className="input num" inputMode="numeric" value={n.xp} onChange={e => setN(x => ({ ...x, xp: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
        <Field label="Armour class: set by hand" help="0 = worked out from armour and abilities"><input className="input num" inputMode="numeric" value={n.ac_override} onChange={e => setN(x => ({ ...x, ac_override: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
        <Field label="Armour class: extra" help="A ring, a house rule…"><input className="input num" inputMode="numeric" value={n.ac_bonus} onChange={e => setN(x => ({ ...x, ac_bonus: Number(e.target.value) || 0 }))} /></Field>
        <Field label="Maximum hit points: extra" help="The Tough feat, a blessing…"><input className="input num" inputMode="numeric" value={n.hp.bonus} onChange={e => setN(x => ({ ...x, hp: { ...x.hp, bonus: Number(e.target.value) || 0 } }))} /></Field>
        <Field label="Speed: extra (ft.)"><input className="input num" inputMode="numeric" value={n.speed_bonus} onChange={e => setN(x => ({ ...x, speed_bonus: Number(e.target.value) || 0 }))} /></Field>
        <Field label="Initiative: extra"><input className="input num" inputMode="numeric" value={n.init_bonus} onChange={e => setN(x => ({ ...x, init_bonus: Number(e.target.value) || 0 }))} /></Field>
        <Field label="Hit points per level" help="What each level added before Constitution (first class first)" group>
          <div className="hp-levels">{n.classes.map((cl, i) => (
            <div key={cl.key} className="row wrap"><span className="small">{r.classBy[cl.key]?.name}</span>
              {cl.hp.map((v, j) => <input key={j} className="input num sm" style={{ width: 46 }} inputMode="numeric" value={v} aria-label={`Level ${j + 2}`}
                onChange={e => setN(x => ({ ...x, classes: x.classes.map((y, q) => (q === i ? { ...y, hp: y.hp.map((h, w) => (w === j ? Math.max(1, Number(e.target.value) || 1) : h)) } : y)) }))} />)}
            </div>))}</div>
        </Field>
      </div>}
      <p className="muted small edit-foot">Changes to the sheet itself (hit points, items, spells) save as you make them; this dialog saves when you press Save.</p>
    </Modal>
  )
}
