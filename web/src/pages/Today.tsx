// The table: the campaign at hand — the next game night, the party and how
// hurt they are, a fight in progress, open quests, pinned people and
// places, the encounters ready, the last rolls.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useOnChange } from '../lib/data'
import { ago, fmtDate, todayISO, daysBetween } from '../lib/format'
import type { Campaign, Character, Entry, Quest, Roll, Session } from '../lib/types'
import { CharacterToken, HPBar, RatingBadge } from '../components/Game'
import { Crest, Seal } from '../components/Art'
import { Markdown } from '../components/Markdown'
import { DiceTray } from '../components/QuickDice'
import { ENTRY_KINDS } from '../components/CodexEditors'
import { Icon } from '../components/icons'
import { Loading } from '../components/ui'
import { Select } from '../components/Select'

interface Home {
  campaigns: Campaign[]; campaign: Campaign | null; party: Character[]; next: Session[]; last: Session[]; quests: Quest[]; pinned: Entry[]
  fight?: { id: number; name: string; round: number; turn: string; count: number }; prepared: { id: number; name: string; place: string; rating: string; xp: number }[]
  rolls: Roll[]; characters: number
}

export default function Today() {
  const navigate = useNavigate()
  const { user, settings, setSettings } = useApp()
  const [h, setH] = useState<Home | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const load = useCallback(() => { api.get<Home>(`${V1}/home${pick ? `?campaign=${pick}` : ''}`).then(setH).catch(() => {}) }, [pick])
  useEffect(() => { load() }, [load])
  useOnChange(load)
  useEffect(() => { const f = () => load(); window.addEventListener('pqst:rolled', f); return () => window.removeEventListener('pqst:rolled', f) }, [load])
  if (!h) return <Loading />
  const c = h.campaign
  const choose = async (id: number) => {
    setPick(id)
    if (settings) { try { setSettings(await api.put(`${V1}/settings`, { campaign: id })) } catch { /* fine */ } }
  }
  if (!c) return (
    <div className="page welcome">
      <Seal size={96} />
      <h1 className="page-title">Welcome to the table{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
      <p className="muted">Run your fifth-edition games here: build characters by the rules, plan game nights, keep the world's people and places, run the fights, roll the dice. The whole System Reference Document is built in.</p>
      <div className="row wrap center">
        <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent('pqst:create', { detail: { kind: 'campaign' } }))}><Icon name="castle" size={15} />Start a campaign</button>
        <button type="button" className="btn" onClick={() => navigate('/characters/new')}><Icon name="helmet" size={15} />Build a character</button>
        <button type="button" className="btn" onClick={() => navigate('/compendium/monsters')}><Icon name="book-open" size={15} />Browse the monsters</button>
      </div>
    </div>
  )
  const next = h.next[0]
  const last = h.last[0]
  const days = next ? daysBetween(todayISO(), next.date) : 0
  return (
    <div className="page table-page" style={{ ['--camp' as string]: c.color }}>
      <header className="table-banner">
        <button type="button" className="table-crest" onClick={() => navigate(`/campaigns/${c.id}`)} aria-label={c.name}><Crest emblem={c.emblem} color={c.color} size={72} photo={c.photo_url || undefined} /></button>
        <div className="grow">
          <span className="kicker">The table</span>
          <h1 className="camp-title"><button type="button" className="linkish" onClick={() => navigate(`/campaigns/${c.id}`)}>{c.name}</button></h1>
          {c.tagline && <p className="camp-tagline">{c.tagline}</p>}
        </div>
        {h.campaigns.length > 1 && <div className="table-switch"><Select value={String(c.id)} onChange={v => choose(Number(v))} ariaLabel="Campaign" options={h.campaigns.map(x => ({ value: String(x.id), label: x.name, hint: x.status !== 'active' ? x.status : '' }))} /></div>}
      </header>

      {h.fight && <button type="button" className="fight-banner" onClick={() => navigate(`/encounters/${h.fight!.id}`)}>
        <span className="fight-ico"><Icon name="swords" size={20} /></span>
        <span className="grow"><b>{h.fight.name}</b><span>Round {h.fight.round} · {h.fight.turn}'s turn · {h.fight.count} in the fight</span></span>
        <span className="btn primary sm">Back to the fight<Icon name="chevron-right" size={14} /></span>
      </button>}

      <div className="table-grid">
        <section className="card-lite next-card">
          <div className="sec-head"><h2>Next game night</h2><span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={() => navigate(`/campaigns/${c.id}?tab=sessions&plan=1`)}><Icon name="calendar-plus" size={14} />Plan</button></div>
          {next ? <button type="button" className="next-night big" onClick={() => navigate(`/campaigns/${c.id}/sessions/${next.id}`)}>
            <span className="date-tile"><b>{new Date(next.date + 'T00:00').getDate()}</b><small>{new Date(next.date + 'T00:00').toLocaleDateString(undefined, { month: 'short' })}</small></span>
            <span className="grow"><b>Session {next.number}{next.title ? ` · ${next.title}` : ''}</b>
              <span className="muted small">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`} · {fmtDate(next.date)}{next.time ? ` at ${next.time}` : ''}{c.place ? ` · ${c.place}` : ''}</span>
              {next.plan && <span className="next-prep">{next.plan.split('\n').filter(Boolean).slice(0, 3).map((l, i) => <span key={i}>{l.replace(/^[-*•]\s*/, '')}</span>)}</span>}</span>
          </button> : <p className="muted">Nothing planned. {c.schedule ? `You play ${c.schedule.toLowerCase()}.` : ''}</p>}
          {last && <div className="last-time">
            <span className="kicker">Last time · session {last.number}</span>
            <h3>{last.title}</h3>
            {last.recap ? <Markdown text={last.recap.length > 420 ? last.recap.slice(0, 420).replace(/\s+\S*$/, '') + '…' : last.recap} /> : <p className="muted small">No recap yet — <button type="button" className="linkish" onClick={() => navigate(`/campaigns/${c.id}/sessions/${last.id}`)}>write one</button>.</p>}
          </div>}
        </section>

        <section className="card-lite party-card">
          <div className="sec-head"><h2>The party</h2><span className="muted small">{h.party.length ? `level ${c.party_level}` : ''}</span><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate(`/campaigns/${c.id}?tab=party`)}>All</button></div>
          {h.party.length === 0 ? <p className="muted">No one yet. <button type="button" className="linkish" onClick={() => navigate(`/characters/new?campaign=${c.id}`)}>Build a character</button>.</p> :
            <ul className="party-list">{h.party.map(p => (
              <li key={p.id}><button type="button" className="party-row" onClick={() => navigate(`/characters/${p.id}`)}>
                <CharacterToken c={p} size={48} showHP />
                <span className="grow party-body"><span className="party-name"><b>{p.name}</b><span className="muted small">{p.player}</span></span>
                  <span className="muted small ellipsis">{p.species} · {p.classes}</span>
                  <HPBar cur={p.hp_cur} max={p.hp_max} temp={p.hp_temp} size="sm" /></span>
                <span className="party-nums"><span title="Armour class"><Icon name="shield" size={12} />{p.ac}</span><span title="Hit points" className="num">{p.hp_cur}/{p.hp_max}</span><span title="Passive Perception"><Icon name="eye" size={12} />{p.pp}</span></span>
              </button></li>))}</ul>}
        </section>

        <section className="card-lite">
          <div className="sec-head"><h2>Open quests</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate(`/campaigns/${c.id}?tab=quests`)}>Quest log</button></div>
          {h.quests.length === 0 ? <p className="muted">None open.</p> : <ul className="quest-mini">{h.quests.map(q => {
            const done = q.objectives.filter(o => o.done).length
            const nextStep = q.objectives.find(o => !o.done)
            return <li key={q.id}><Icon name="compass" size={15} /><span className="grow"><b>{q.title}</b>{nextStep && <span className="muted small">Next: {nextStep.text}</span>}</span>{q.objectives.length > 0 && <span className="quest-prog"><span style={{ width: `${(done / q.objectives.length) * 100}%` }} /></span>}</li>
          })}</ul>}
        </section>

        <section className="card-lite">
          <div className="sec-head"><h2>Ready to run</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate(`/encounters/new?campaign=${c.id}`)}><Icon name="plus" size={14} />Build</button></div>
          {h.prepared.length === 0 ? <p className="muted">No encounters ready.</p> : <ul className="enc-mini">{h.prepared.map(e => (
            <li key={e.id}><button type="button" className="enc-row" onClick={() => navigate(`/encounters/${e.id}`)}><Icon name="swords" size={15} /><span className="grow"><b>{e.name}</b><span className="muted small">{e.place}</span></span><RatingBadge rating={e.rating} /></button></li>))}</ul>}
          {h.pinned.length > 0 && <><h3 className="mini-h">Pinned</h3><ul className="codex-mini">{h.pinned.map(e => (
            <li key={e.id}><button type="button" className="linkish" onClick={() => navigate(`/campaigns/${c.id}/codex/${e.id}`)}><Icon name={ENTRY_KINDS[e.kind].icon} size={14} />{e.name}</button><span className="muted small ellipsis">{e.subtitle}</span></li>))}</ul></>}
        </section>

        <section className="card-lite dice-card">
          <div className="sec-head"><h2>Dice</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate('/dice')}>The log</button></div>
          <DiceTray compact campaignId={c.id} />
          {h.rolls.length > 0 && <ul className="roll-log mini">{h.rolls.slice(0, 5).map(r => (
            <li key={r.id}><span className={`roll-total ${r.detail.crit ? 'crit' : r.detail.fumble ? 'fumble' : ''}`}>{r.total}</span><span className="grow ellipsis">{r.character_name ? <b>{r.character_name} · </b> : null}{r.label || r.expr}</span><span className="muted small">{ago(r.created_at)}</span></li>))}</ul>}
        </section>
      </div>
    </div>
  )
}
