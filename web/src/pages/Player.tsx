// The players' page (/p/<link>): no account, nothing secret. The party,
// the fight in progress (live), the next game night, the quest log, what
// the game master revealed, and the recaps.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { fmtDate } from '../lib/format'
import type { Objective, Token as Tok } from '../lib/types'
import { CLASS_COLORS, CreatureIcon, Crest, Seal, Token } from '../components/Art'
import { HPBar } from '../components/Game'
import { Markdown } from '../components/Markdown'
import { ENTRY_KINDS } from '../components/CodexEditors'
import { Icon } from '../components/icons'
import { Loading, Segmented } from '../components/ui'

interface PV {
  campaign: { name: string; tagline: string; world: string; summary: string; emblem: string; color: string; photo_url: string; schedule: string; place: string; house_rules: string; sessions: number; party_level: number }
  party: { id: number; name: string; player: string; species: string; classes: string; class_key: string; level: number; ac: number; hp_max: number; hp_cur: number; hp_temp: number; pp: number; status: string; token: Tok; photo_url: string; sheet_url: string }[]
  recaps: { id: number; number: number; title: string; date: string; recap: string; loot: string; xp: number }[]
  next: { number: number; title: string; date: string; time: string } | null
  codex: { id: number; kind: keyof typeof ENTRY_KINDS; name: string; subtitle: string; body: string; status: string; attitude: string; place_name: string; tags: string[]; photo_url: string }[]
  quests: { id: number; title: string; status: string; summary: string; reward: string; giver_name: string; place_name: string; objectives: Objective[] }[]
  fight?: { name: string; place: string; round: number; turn: string; combatants: { id: string; kind: string; type?: string; name: string; init: number; health: string; hp?: number; hp_max?: number; conditions: string[]; out: boolean; color?: string }[] }
}

export default function Player() {
  const { token } = useParams()
  const [v, setV] = useState<PV | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'party' | 'quests' | 'world' | 'story'>('party')
  const load = useCallback(() => { api.get<PV>(`${V1}/public/p/${token}`).then(x => { setV(x); setErr('') }).catch(e => setErr((e as Error).message)) }, [token])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, v?.fight ? 4000 : 30000)
    return () => window.clearInterval(t)
  }, [load, v?.fight])
  useEffect(() => { if (v) document.title = v.campaign.name }, [v])
  if (err && !v) return <div className="player-page"><div className="welcome"><Seal size={80} /><h1 className="page-title">This link does not work</h1><p className="muted">{err}</p></div></div>
  if (!v) return <div className="player-page"><Loading /></div>
  const c = v.campaign
  const byKind = (k: string) => v.codex.filter(e => e.kind === k)
  return (
    <div className="player-page" style={{ ['--camp' as string]: c.color }}>
      <header className="player-head">
        <Crest emblem={c.emblem} color={c.color} size={72} photo={c.photo_url || undefined} />
        <div className="grow"><h1 className="camp-title">{c.name}</h1>{c.tagline && <p className="camp-tagline">{c.tagline}</p>}
          <p className="muted small">{[c.world, c.sessions ? `${c.sessions} sessions played` : '', c.party_level ? `party level ${c.party_level}` : ''].filter(Boolean).join(' · ')}</p></div>
      </header>
      {v.next && <div className="player-next"><Icon name="calendar" size={16} /><span>Next game night: <b>{fmtDate(v.next.date)}{v.next.time ? ` at ${v.next.time}` : ''}</b>{v.next.title ? ` · ${v.next.title}` : ''}{c.place ? ` · ${c.place}` : ''}</span></div>}
      {v.fight && <section className="player-fight">
        <div className="sec-head"><h2><Icon name="swords" size={18} /> {v.fight.name}</h2><span className="round-tile sm"><small>Round</small><b>{v.fight.round}</b></span></div>
        <ol className="init-list public">{v.fight.combatants.map(x => {
          const pc = v.party.find(p => p.name === x.name && x.kind === 'pc')
          return (
            <li key={x.id} className={`init-row ${x.id === v.fight!.turn ? 'turn' : ''} ${x.out ? 'out' : ''} ${x.kind}`}>
              <span className="init-num num">{x.init}</span>
              <span className="init-avatar">{pc ? <Token name={pc.name} color={pc.token.color || CLASS_COLORS[pc.class_key]} emblem={pc.token.emblem || pc.class_key} frame={pc.token.frame || ''} photo={pc.photo_url || undefined} size={36} /> : <span className={`mon-token ${x.health === 'down' ? 'down' : x.health === 'bloodied' ? 'bad' : x.health === 'hurt' ? 'warn' : 'ok'}`}><CreatureIcon type={x.type || "humanoid"} size={20} /></span>}</span>
              <span className="init-body"><span className="init-name">{x.name}</span>
                {x.hp != null && x.hp_max != null ? <HPBar cur={x.hp} max={x.hp_max} size="sm" /> : x.health ? <span className={`health ${x.health}`}>{x.health}</span> : null}
                {x.conditions.length > 0 && <span className="init-conds">{x.conditions.map(k => <span key={k} className="cond sm on">{k}</span>)}</span>}</span>
              {x.hp != null && <span className="num small">{x.hp}/{x.hp_max}</span>}
            </li>
          )
        })}</ol>
        {v.fight.turn && <p className="turn-line">{v.fight.combatants.find(x => x.id === v.fight!.turn)?.name}'s turn</p>}
      </section>}
      <Segmented value={tab} onChange={setTab} label="Show" options={[{ value: 'party', label: 'Party' }, { value: 'quests', label: `Quests (${v.quests.filter(q => q.status === 'active').length})` }, { value: 'world', label: 'The world' }, { value: 'story', label: 'Story so far' }]} />
      {tab === 'party' && <div className="player-party">{v.party.map(p => (
        <article key={p.id} className="player-pc">
          <Token name={p.name} color={p.token.color || CLASS_COLORS[p.class_key]} emblem={p.token.emblem || p.class_key} frame={p.token.frame || ''} photo={p.photo_url || undefined} size={64} level={p.level} hp={{ cur: p.hp_cur, max: p.hp_max }} state={p.status === 'dead' ? 'dead' : p.hp_cur <= 0 ? 'down' : ''} />
          <div className="grow"><b className="pc-name">{p.name}</b><span className="muted small">{p.species} · {p.classes}{p.player ? ` · ${p.player}` : ''}</span>
            <HPBar cur={p.hp_cur} max={p.hp_max} temp={p.hp_temp} size="sm" />
            <span className="party-nums"><span><Icon name="shield" size={12} />{p.ac}</span><span className="num">{p.hp_cur}/{p.hp_max}</span><span><Icon name="eye" size={12} />{p.pp}</span>{p.sheet_url && <a href={p.sheet_url}>Sheet</a>}</span></div>
        </article>))}</div>}
      {tab === 'quests' && <div>{v.quests.length === 0 ? <p className="muted">No quests yet.</p> : v.quests.map(q => (
        <article key={q.id} className={`quest ${q.status}`}><header className="quest-head"><b><Icon name="compass" size={15} /> {q.title}</b><span className={`state ${q.status}`}>{q.status === 'active' ? 'Open' : q.status === 'rumour' ? 'Rumour' : q.status === 'done' ? 'Done' : 'Failed'}</span></header>
          {q.summary && <p className="quest-sum">{q.summary}</p>}{(q.giver_name || q.reward) && <p className="muted small">{q.giver_name ? `From ${q.giver_name}` : ''}{q.giver_name && q.reward ? ' · ' : ''}{q.reward ? `Reward: ${q.reward}` : ''}</p>}
          {q.objectives.length > 0 && <ul className="objectives">{q.objectives.map((o, i) => <li key={i} className={`obj ${o.done ? 'done' : ''}`}><span className="obj-box">{o.done && <Icon name="check" size={11} strokeWidth={3} />}</span>{o.text}</li>)}</ul>}
        </article>))}</div>}
      {tab === 'world' && <div>
        {c.summary && <section className="card-lite"><Markdown text={c.summary} /></section>}
        {(['npc', 'place', 'faction', 'item', 'lore', 'handout'] as const).map(k => byKind(k).length > 0 && <section key={k}><h2 className="group-h">{ENTRY_KINDS[k].plural}</h2>
          <div className="codex-grid">{byKind(k).map(e => <details key={e.id} className={`codex-card ${e.kind} ${e.status === 'dead' ? 'is-dead' : ''}`}><summary>
            {e.photo_url ? <img src={e.photo_url + '?thumb=1'} alt="" className="codex-img" /> : <span className="codex-ico"><Icon name={ENTRY_KINDS[e.kind].icon} size={20} /></span>}
            <span className="codex-body"><span className="codex-name">{e.name}</span><span className="muted small">{e.subtitle}{e.place_name ? ` · ${e.place_name}` : ''}</span></span></summary>
            <div className={e.kind === 'handout' ? 'handout' : ''}><Markdown text={e.body} /></div></details>)}</div></section>)}
        {c.house_rules && <section className="card-lite"><h2 className="group-h">House rules</h2><Markdown text={c.house_rules} /></section>}
      </div>}
      {tab === 'story' && <div className="recaps">{v.recaps.length === 0 ? <p className="muted">No recaps yet.</p> : v.recaps.map(r => (
        <article key={r.id} className="card-lite recap"><span className="kicker">Session {r.number} · {fmtDate(r.date)}</span><h3 className="recap-title">{r.title}</h3><Markdown text={r.recap} />{r.loot && <p className="small"><Icon name="coins" size={12} /> {r.loot}</p>}</article>))}</div>}
      <footer className="player-foot muted small">Pocket Quest · 5E compatible</footer>
    </div>
  )
}
