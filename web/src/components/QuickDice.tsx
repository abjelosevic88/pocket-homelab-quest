// The dice tray: tap dice to build a pool (2d6 + 1d8 + 3), with advantage
// or disadvantage on a d20, or type any expression. The server rolls.
import { useState } from 'react'
import { useRoll } from '../lib/dice'
import { Die } from './Art'
import { Icon } from './icons'
import { Modal, Segmented } from './ui'

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const

export function DiceTray({ campaignId, compact = false }: { campaignId?: number | null; compact?: boolean }) {
  const roll = useRoll()
  const [pool, setPool] = useState<Record<number, number>>({})
  const [bonus, setBonus] = useState(0)
  const [adv, setAdv] = useState<'' | 'adv' | 'dis'>('')
  const [typed, setTyped] = useState('')
  const [label, setLabel] = useState('')
  const expr = () => {
    const parts = SIDES.filter(s => pool[s]).map(s => `${pool[s]}d${s === 100 ? '%' : s}`)
    if (bonus) parts.push(String(bonus))
    return parts.join('+').replace('+-', '-')
  }
  const built = expr()
  const onlyD20 = SIDES.every(s => s === 20 || !pool[s]) && pool[20] === 1
  const go = (e?: string) => {
    const x = (e ?? (typed.trim() || built)).trim()
    if (!x) return
    roll(x, { label: label.trim() || (typed.trim() ? '' : describe(pool, bonus)), adv: onlyD20 || /^1?d20/.test(x) ? adv : '', campaign_id: campaignId })
  }
  const add = (s: number, d = 1) => setPool(p => ({ ...p, [s]: Math.max(0, Math.min(20, (p[s] || 0) + d)) }))
  return (
    <div className={`dice-tray ${compact ? 'compact' : ''}`}>
      <div className="dice-row" role="group" aria-label="Dice">
        {SIDES.map(s => (
          <button key={s} type="button" className={`dice-pick ${pool[s] ? 'on' : ''}`} onClick={() => add(s)} onContextMenu={e => { e.preventDefault(); add(s, -1) }}
            title={`Add a d${s} (right-click to take one away)`} aria-label={`Add a d${s}`}>
            <Die sides={s} size={compact ? 40 : 48} value={pool[s] ? `${pool[s]}` : ''} tone={pool[s] ? 'accent' : 'plain'} />
            <span className="dice-pick-k">d{s === 100 ? '%' : s}</span>
          </button>
        ))}
      </div>
      <div className="dice-build">
        <div className="dice-expr" aria-live="polite">{built ? built.replace(/\+/g, ' + ').replace(/-/g, ' − ') : <span className="muted">Tap the dice</span>}</div>
        <div className="stepper" aria-label="Modifier">
          <button type="button" className="btn ghost sm icon-only" onClick={() => setBonus(b => b - 1)} aria-label="Lower the modifier"><Icon name="minus" size={14} /></button>
          <span className="stepper-v">{bonus >= 0 ? '+' + bonus : '−' + Math.abs(bonus)}</span>
          <button type="button" className="btn ghost sm icon-only" onClick={() => setBonus(b => b + 1)} aria-label="Raise the modifier"><Icon name="plus" size={14} /></button>
        </div>
        <button type="button" className="btn ghost sm" onClick={() => { setPool({}); setBonus(0); setTyped('') }} disabled={!built && !typed}>Clear</button>
      </div>
      <div className="dice-opts">
        <Segmented size="sm" label="Advantage" value={adv} onChange={setAdv} options={[{ value: '', label: 'Normal' }, { value: 'adv', label: 'Advantage' }, { value: 'dis', label: 'Disadvantage' }]} />
      </div>
      <div className="dice-typed">
        <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Or type: 1d20+5, 4d6kh3, 2d20kl1…" aria-label="Roll expression"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go() } }} />
        {!compact && <input className="input dice-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="What for (optional)" aria-label="What the roll is for" />}
        <button type="button" className="btn primary" onClick={() => go()} disabled={!built && !typed.trim()}><Icon name="d20" size={16} />Roll</button>
      </div>
      <div className="dice-quick">
        <span className="muted small">Quick:</span>
        {[['1d20', 'd20'], ['1d20adv', 'd20 adv.'], ['1d20dis', 'd20 dis.'], ['4d6kh3', 'ability score'], ['1d100', 'percentile']].map(([e, l]) => (
          <button key={e} type="button" className="chip" onClick={() => roll(e, { label: l, campaign_id: campaignId })}>{l}</button>
        ))}
      </div>
    </div>
  )
}

function describe(pool: Record<number, number>, bonus: number) {
  const n = Object.values(pool).reduce((a, b) => a + b, 0)
  if (n === 1 && pool[20] && !bonus) return 'd20'
  return ''
}

export function QuickDice({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Roll dice" onClose={onClose} size="sm" className="quick-dice">
      <DiceTray compact />
    </Modal>
  )
}
