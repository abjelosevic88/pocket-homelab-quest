// The dice: the tray, the whole roll log, and the name maker.
import { useCallback, useEffect, useState } from 'react'
import { api, V1 } from '../lib/api'
import { ago } from '../lib/format'
import type { Roll } from '../lib/types'
import { DiceTray } from '../components/QuickDice'
import { Die } from '../components/Art'
import { mainDie } from '../lib/dice'
import { Icon } from '../components/icons'
import { Confirm, Empty, Segmented, copyText, useToast } from '../components/ui'

const KINDS = [['human', 'Human'], ['dwarf', 'Dwarf'], ['elf', 'Elf'], ['halfling', 'Halfling'], ['gnome', 'Gnome'], ['dragonborn', 'Dragonborn'], ['half-orc', 'Half-orc'], ['tiefling', 'Tiefling'], ['tavern', 'Tavern'], ['place', 'Place']] as const

export default function Dice() {
  const { toast } = useToast()
  const [rolls, setRolls] = useState<Roll[]>([])
  const [clear, setClear] = useState(false)
  const [kind, setKind] = useState<string>('human')
  const [names, setNames] = useState<string[]>([])
  const load = useCallback(() => { api.get<{ rolls: Roll[] }>(`${V1}/rolls?limit=100`).then(r => setRolls(r.rolls)).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { window.addEventListener('pqst:rolled', load); return () => window.removeEventListener('pqst:rolled', load) }, [load])
  const make = useCallback(() => { api.get<{ names: string[] }>(`${V1}/names?kind=${kind}&n=8`).then(r => setNames(r.names)).catch(() => {}) }, [kind])
  useEffect(() => { make() }, [make])
  return (
    <div className="page dice-page">
      <div className="page-head"><div className="grow"><h1 className="page-title">Dice</h1><p className="muted">Fair dice, rolled on your box; every roll goes in the log.</p></div></div>
      <div className="dice-grid">
        <div>
          <section className="card-lite"><DiceTray /></section>
          <section className="card-lite">
            <div className="sec-head"><h2>Names</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={make}><Icon name="shuffle" size={14} />More</button></div>
            <Segmented size="sm" value={kind} onChange={setKind} label="For" options={KINDS.map(([v, l]) => ({ value: v, label: l }))} className="wrap" />
            <ul className="names">{names.map(n => <li key={n}><button type="button" className="chip" onClick={async () => { if (await copyText(n)) toast(`Copied: ${n}`) }}>{n}</button></li>)}</ul>
          </section>
        </div>
        <section className="card-lite">
          <div className="sec-head"><h2>The log</h2><span className="spacer" />{rolls.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setClear(true)}>Clear</button>}</div>
          {rolls.length === 0 ? <Empty title="No rolls yet" icon="d20">Tap the dice, or any number on a character sheet or stat block.</Empty> : <ul className="roll-log">
            {rolls.map(r => (
              <li key={r.id}>
                <Die sides={mainDie(r.detail)} size={30} value={r.detail.natural || ''} tone={r.detail.crit ? 'crit' : r.detail.fumble ? 'fumble' : 'plain'} />
                <span className="grow"><span className="ellipsis">{r.character_name ? <b>{r.character_name} · </b> : null}{r.label || 'Roll'}</span>
                  <span className="muted small roll-detail">{r.detail.terms.map((t, i) => <span key={i}>{i > 0 || t.sign < 0 ? (t.sign < 0 ? ' − ' : ' + ') : ''}{t.dice ? <>{t.text} (<span>{t.dice.map((d, j) => <span key={j} className={d.kept ? '' : 'dropped'}>{j ? ', ' : ''}{d.value}</span>)}</span>)</> : t.value}</span>)}</span></span>
                <span className={`roll-total ${r.detail.crit ? 'crit' : r.detail.fumble ? 'fumble' : ''}`}>{r.total}</span>
                <span className="muted small roll-when">{ago(r.created_at)}</span>
              </li>
            ))}
          </ul>}
        </section>
      </div>
      {clear && <Confirm title="Clear the roll log?" message="Every roll in it goes." confirmLabel="Clear" onCancel={() => setClear(false)} onConfirm={async () => { await api.del(`${V1}/rolls`); setClear(false); load() }} />}
    </div>
  )
}
