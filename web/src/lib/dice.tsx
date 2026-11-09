// Rolling dice from anywhere: the server rolls (fair dice, one log), the
// result shows as a card with the die tumbling, then fades.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, V1 } from './api'
import { useApp } from './app-context'
import type { Roll, RollResult } from './types'
import { Die } from '../components/Art'

export interface RollOpts { label?: string; kind?: string; character_id?: number | null; campaign_id?: number | null; adv?: 'adv' | 'dis' | ''; quiet?: boolean; crit?: boolean }
type RollFn = (expr: string, opts?: RollOpts) => Promise<{ roll: Roll; result: RollResult; text: string } | null>

const Ctx = createContext<{ roll: RollFn; last: Shown[] }>({ roll: async () => null, last: [] })
export const useRoll = () => useContext(Ctx).roll
export const useRolls = () => useContext(Ctx).last

interface Shown { id: number; label: string; result: RollResult; text: string; rolling: boolean; at: number; who?: string }

/** 1d20+5 with advantage → 2d20kh1+5. */
export function withAdvantage(expr: string, adv: RollOpts['adv']): string {
  if (!adv) return expr
  return expr.replace(/^1?d20(?![0-9])/, adv === 'adv' ? '2d20kh1' : '2d20kl1')
}

/** A critical hit: the dice twice (or, by the other rule, the dice plus their highest roll). */
export function critExpr(expr: string, rule: 'double' | 'max'): string {
  return expr.replace(/(\d*)d(\d+)/g, (_m, n, d) => {
    const c = Number(n || 1)
    return rule === 'max' ? `${c}d${d}+${c * Number(d)}` : `${c * 2}d${d}`
  })
}

/** The biggest die of an expression, to draw. */
export function mainDie(r: RollResult): 4 | 6 | 8 | 10 | 12 | 20 | 100 {
  let best = 0
  for (const t of r.terms) for (const d of t.dice || []) best = Math.max(best, d.sides)
  return ([4, 6, 8, 10, 12, 20, 100].includes(best) ? best : best > 20 ? 100 : 20) as 4 | 6 | 8 | 10 | 12 | 20 | 100
}

export function RollerProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useApp()
  const [shown, setShown] = useState<Shown[]>([])
  const n = useRef(0)
  const motion = settings?.dice_motion !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const roll = useCallback<RollFn>(async (expr, o = {}) => {
    const e = withAdvantage(o.crit ? critExpr(expr, settings?.crit_rule || 'double') : expr, o.adv || '')
    try {
      const res = await api.post<{ roll: Roll; result: RollResult; text: string }>(`${V1}/rolls`, { expr: e, label: (o.label || '') + (o.crit ? ' (critical)' : '') + (o.adv === 'adv' ? ' · advantage' : o.adv === 'dis' ? ' · disadvantage' : ''), kind: o.kind || 'roll', character_id: o.character_id || null, campaign_id: o.campaign_id || null, quiet: o.quiet })
      const id = ++n.current
      setShown(l => [{ id, label: res.roll.label || res.result.expr, result: res.result, text: res.text, rolling: motion, at: Date.now(), who: res.roll.character_name }, ...l].slice(0, 3))
      if (motion) window.setTimeout(() => setShown(l => l.map(x => (x.id === id ? { ...x, rolling: false } : x))), 650)
      window.dispatchEvent(new CustomEvent('pqst:rolled', { detail: res.roll }))
      return res
    } catch (err) {
      const id = ++n.current
      setShown(l => [{ id, label: (err as Error).message, result: { expr: e, terms: [], total: 0 }, text: '', rolling: false, at: Date.now() }, ...l].slice(0, 3))
      return null
    }
  }, [motion, settings?.crit_rule])
  // cards fade after a while (a calm, fixed place: they never push the page)
  useEffect(() => {
    if (!shown.length) return
    const t = window.setInterval(() => setShown(l => l.filter(x => Date.now() - x.at < 9000)), 1000)
    return () => window.clearInterval(t)
  }, [shown.length])
  return (
    <Ctx.Provider value={{ roll, last: shown }}>
      {children}
      {shown.length > 0 && <div className="roll-stack" aria-live="polite">
        {shown.map((x, i) => <RollCard key={x.id} x={x} faded={i > 0} onClose={() => setShown(l => l.filter(y => y.id !== x.id))} />)}
      </div>}
    </Ctx.Provider>
  )
}

function RollCard({ x, faded, onClose }: { x: Shown; faded: boolean; onClose: () => void }) {
  const r = x.result
  const bad = !r.terms.length
  const tone = r.crit ? 'crit' : r.fumble ? 'fumble' : 'plain'
  return (
    <button type="button" className={`roll-card ${faded ? 'faded' : ''} ${tone}`} onClick={onClose} title="Close">
      {!bad && <Die sides={mainDie(r)} size={faded ? 34 : 52} value={x.rolling ? '' : r.natural || ''} rolling={x.rolling} tone={tone === 'plain' ? 'accent' : tone} />}
      <span className="roll-card-body">
        <span className="roll-card-label ellipsis">{x.who ? <b>{x.who} · </b> : null}{x.label}</span>
        {!bad && <span className="roll-card-text ellipsis">{x.rolling ? r.expr : x.text}</span>}
      </span>
      {!bad && <span className={`roll-card-total ${x.rolling ? 'is-hidden' : ''}`}>{r.total}</span>}
      {!x.rolling && r.crit && <span className="roll-flag">Natural 20</span>}
      {!x.rolling && r.fumble && <span className="roll-flag">Natural 1</span>}
    </button>
  )
}
