// Small pieces every page of the game uses.
import { Link } from 'react-router-dom'
import type { Campaign, Character, Rating } from '../lib/types'
import { fmtDate } from '../lib/format'
import { CLASS_COLORS, Crest, Token } from './Art'
import { Icon } from './icons'

export function hpTone(cur: number, max: number) {
  if (max <= 0) return 'ok'
  if (cur <= 0) return 'down'
  const f = cur / max
  return f > 0.5 ? 'ok' : f > 0.25 ? 'warn' : 'bad'
}

/** Hit points as a bar: current, temporary on top. Fixed height, never jumps. */
export function HPBar({ cur, max, temp = 0, size = '' }: { cur: number; max: number; temp?: number; size?: '' | 'sm' | 'lg' }) {
  const total = Math.max(max, cur + temp)
  const w = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(1, total)) * 100))}%`
  return (
    <span className={`hpbar ${size} ${hpTone(cur, max)}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={cur} aria-label={`${cur} of ${max} hit points`}>
      <span className="hpbar-fill" style={{ width: w(Math.max(0, cur)) }} />
      {temp > 0 && <span className="hpbar-temp" style={{ left: w(Math.max(0, cur)), width: w(temp) }} />}
    </span>
  )
}

/** Uses or slots as pips: filled = left to use. Click a pip to spend or get back. */
export function Pips({ max, used, onChange, label, size = 14 }: { max: number; used: number; onChange?: (used: number) => void; label: string; size?: number }) {
  if (max > 12) {
    return (
      <span className="pips-num" aria-label={label}>
        <button type="button" className="btn ghost sm icon-only" disabled={!onChange || used >= max} onClick={() => onChange?.(used + 1)} aria-label={`Use one ${label}`}><Icon name="minus" size={13} /></button>
        <b>{max - used}</b><span className="muted">/{max}</span>
        <button type="button" className="btn ghost sm icon-only" disabled={!onChange || used <= 0} onClick={() => onChange?.(used - 1)} aria-label={`Get one ${label} back`}><Icon name="plus" size={13} /></button>
      </span>
    )
  }
  const left = max - used
  return (
    <span className="pips" role="group" aria-label={`${label}: ${left} of ${max} left`}>
      {Array.from({ length: max }, (_, i) => {
        const full = i < left
        return <button key={i} type="button" className={`pip ${full ? 'full' : ''}`} style={{ width: size, height: size }} disabled={!onChange}
          onClick={() => onChange?.(full ? used + (left - i) : used - (i - left + 1))} title={full ? 'Use' : 'Get back'} aria-label={full ? `Use ${label}` : `Get back ${label}`} />
      })}
    </span>
  )
}

export const RATING_WORDS: Record<string, string> = { trivial: 'Trivial', low: 'Low', moderate: 'Moderate', high: 'High', beyond: 'Beyond high' }
export const RATING_HELP: Record<string, string> = {
  trivial: 'Hardly a fight: well under the low budget.',
  low: 'One or two scary moments; no one should fall. Someone may need healing.',
  moderate: 'Could go badly without healing and resources; weaker characters may drop.',
  high: 'Could be lethal for one or more characters: smart tactics and some luck needed.',
  beyond: 'Over the high budget: a deadly fight. Give the party a way out.',
}
export function RatingBadge({ rating, xp }: { rating: Rating | string; xp?: number }) {
  if (!rating) return <span className="rating none">No party</span>
  return <span className={`rating ${rating}`} title={RATING_HELP[rating]}>{RATING_WORDS[rating] || rating}{xp != null ? <span className="rating-xp">{xp.toLocaleString()} XP</span> : null}</span>
}

export function CharacterToken({ c, size = 44, showHP = false }: { c: Pick<Character, 'name' | 'token' | 'class_key' | 'level' | 'hp_cur' | 'hp_max' | 'status' | 'thumb_url' | 'photo_url'>; size?: number; showHP?: boolean }) {
  return <Token name={c.name} color={c.token?.color || CLASS_COLORS[c.class_key]} emblem={c.token?.emblem || c.class_key} frame={c.token?.frame || ''} photo={size > 64 ? c.photo_url || c.thumb_url : c.thumb_url || c.photo_url}
    size={size} level={size >= 40 ? c.level : undefined} hp={showHP ? { cur: c.hp_cur, max: c.hp_max } : undefined} state={c.status === 'dead' ? 'dead' : showHP && c.hp_cur <= 0 ? 'down' : ''} />
}

export function CharacterCard({ c }: { c: Character }) {
  return (
    <Link to={`/characters/${c.id}`} className={`char-card ${c.status !== 'active' ? 'is-retired' : ''}`}>
      <CharacterToken c={c} size={64} showHP />
      <span className="char-card-body">
        <span className="char-card-name">{c.name}</span>
        <span className="char-card-line ellipsis">{[c.species, c.classes].filter(Boolean).join(' · ') || 'Not built yet'}</span>
        <span className="char-card-stats">
          <span title="Armour class"><Icon name="shield" size={13} />{c.ac}</span>
          <span title="Hit points"><Icon name="heart" size={13} />{c.hp_cur}/{c.hp_max}</span>
          <span title="Passive Perception"><Icon name="eye" size={13} />{c.pp}</span>
          {c.campaign_name && <span className="ellipsis" title="Campaign"><Icon name="castle" size={13} />{c.campaign_name}</span>}
        </span>
        <HPBar cur={c.hp_cur} max={c.hp_max} temp={c.hp_temp} size="sm" />
      </span>
      {c.status !== 'active' && <span className="char-card-badge">{c.status === 'dead' ? 'Fallen' : 'Retired'}</span>}
    </Link>
  )
}

export function CampaignCard({ c }: { c: Campaign }) {
  return (
    <Link to={`/campaigns/${c.id}`} className={`camp-card ${c.status}`} style={{ ['--camp' as string]: c.color }}>
      <span className="camp-card-crest"><Crest emblem={c.emblem} color={c.color} size={64} photo={c.photo_url || undefined} /></span>
      <span className="camp-card-body">
        <span className="camp-card-name">{c.name}</span>
        {c.tagline && <span className="camp-card-tag">{c.tagline}</span>}
        <span className="camp-card-meta">
          <span><Icon name="users" size={13} />{c.party} {c.party === 1 ? 'character' : 'characters'}{c.party_level ? ` · level ${c.party_level}` : ''}</span>
          <span><Icon name="scroll" size={13} />{c.sessions} played</span>
          {c.next_session && <span className="accent-ink"><Icon name="calendar" size={13} />{fmtDate(c.next_session, false)}</span>}
          {c.status !== 'active' && <span className="camp-state">{c.status === 'paused' ? 'Paused' : 'Finished'}</span>}
        </span>
      </span>
    </Link>
  )
}

/** A number in a framed box (AC, initiative, speed…), optionally a button. */
export function StatBox({ label, value, sub, onClick, title, shape = '' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; onClick?: () => void; title?: string; shape?: '' | 'shield' }) {
  const body = <><span className="statbox-k">{label}</span><span className="statbox-v">{value}</span>{sub && <span className="statbox-s">{sub}</span>}</>
  return onClick
    ? <button type="button" className={`statbox ${shape} clickable`} onClick={onClick} title={title}>{body}</button>
    : <div className={`statbox ${shape}`} title={title}>{body}</div>
}

export function Ornament() {
  return <span className="ornament" aria-hidden="true"><span /><i /><span /></span>
}
