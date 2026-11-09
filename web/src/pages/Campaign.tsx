// A campaign: its banner and what the players know, then tabs for the
// game nights, the party, the codex (people, places, lore, handouts), the
// quest log, the encounters, and the players' link.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { announceChange } from '../lib/data'
import { fmtDate, todayISO } from '../lib/format'
import type { Campaign as Camp, Character, Encounter, Entry, EntryKind, Quest, Session } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { CharacterCard, RatingBadge } from '../components/Game'
import { Crest, EMBLEMS } from '../components/Art'
import { Markdown } from '../components/Markdown'
import { Icon } from '../components/icons'
import { Confirm, CopyField, Empty, Field, Loading, type MenuItem, MenuButton, Modal, Segmented, Switch, Tabs, errMsg, useToast } from '../components/ui'
import { Select } from '../components/Select'
import { CAMPAIGN_COLORS } from './Campaigns'
import { EntryEditor, QuestEditor, ENTRY_KINDS } from '../components/CodexEditors'

type Tab = 'overview' | 'sessions' | 'party' | 'codex' | 'quests' | 'encounters' | 'players'
interface Full { campaign: Camp; party: Character[]; sessions: Session[]; codex: Entry[]; quests: Quest[]; encounters: Encounter[]; player_url: string }

export default function Campaign() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { settings } = useApp()
  const { toast } = useToast()
  const [f, setF] = useState<Full | null>(null)
  const [err, setErr] = useState('')
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [plan, setPlan] = useState(params.get('plan') === '1')
  const [showSecrets, setShowSecrets] = useState(!!settings?.show_secrets)
  useCrumb(f?.campaign.name)
  const load = useCallback(() => { api.get<Full>(`${V1}/campaigns/${id}`).then(setF).catch(e => setErr(errMsg(e))) }, [id])
  useEffect(() => { load() }, [load])
  if (err) return <div className="page"><p className="error">{err}</p></div>
  if (!f) return <Loading />
  const c = f.campaign
  const next = f.sessions.filter(x => x.status === 'planned' && x.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date))[0]
  const last = f.sessions.find(x => x.status === 'played')
  const upd = async (body: Partial<Camp>) => {
    try { const r = await api.put<{ campaign: Camp; player_url: string }>(`${V1}/campaigns/${c.id}`, body); setF(x => (x ? { ...x, campaign: r.campaign, player_url: r.player_url } : x)); announceChange() } catch (e) { toast(errMsg(e), 'err') }
  }
  const menu = (): MenuItem[] => [
    { label: 'Edit the campaign', icon: 'edit', onSelect: () => setEdit(true) },
    { label: 'Plan a game night', icon: 'calendar-plus', onSelect: () => setPlan(true) },
    { label: 'Ideas for the next game night (AI)', icon: 'sparkles', onSelect: () => setTab('overview') },
    'sep',
    c.status === 'active' ? { label: 'Pause', icon: 'pause', onSelect: () => upd({ status: 'paused' }) } : { label: 'Make active', icon: 'play', onSelect: () => upd({ status: 'active' }) },
    ...(c.status !== 'done' ? [{ label: 'Mark as finished', icon: 'flag', onSelect: () => upd({ status: 'done' }) }] : []),
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDel(true) },
  ]
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'castle' }, { id: 'sessions', label: 'Game nights', icon: 'calendar' }, { id: 'party', label: 'Party', icon: 'users' },
    { id: 'codex', label: 'Codex', icon: 'scroll' }, { id: 'quests', label: 'Quests', icon: 'compass' }, { id: 'encounters', label: 'Encounters', icon: 'swords' },
    { id: 'players', label: 'Players', icon: 'share' },
  ]
  return (
    <div className="page campaign-page" style={{ ['--camp' as string]: c.color }}>
      <header className="camp-banner">
        <Crest emblem={c.emblem} color={c.color} size={88} photo={c.photo_url || undefined} />
        <div className="grow">
          <h1 className="camp-title">{c.name}</h1>
          {c.tagline && <p className="camp-tagline">{c.tagline}</p>}
          <div className="camp-facts">
            {c.world && <span><Icon name="globe" size={13} />{c.world}</span>}
            <span><Icon name="users" size={13} />{c.party} in the party{c.party_level ? ` · level ${c.party_level}` : ''}</span>
            <span><Icon name="scroll" size={13} />{c.sessions} played</span>
            {c.schedule && <span><Icon name="clock" size={13} />{c.schedule}</span>}
            {c.place && <span><Icon name="pin" size={13} />{c.place}</span>}
            {c.status !== 'active' && <span className="tag">{c.status === 'paused' ? 'Paused' : 'Finished'}</span>}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setPlan(true)}><Icon name="calendar-plus" size={15} /><span className="hide-sm">Plan a game night</span></button>
          <MenuButton label="More" items={menu} align="right" width={260}><Icon name="more" size={18} /></MenuButton>
        </div>
      </header>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview f={f} next={next} last={last} showSecrets={showSecrets} setShowSecrets={setShowSecrets} onTab={setTab} upd={upd} />}
      {tab === 'sessions' && <Sessions f={f} onPlan={() => setPlan(true)} />}
      {tab === 'party' && <Party f={f} reload={load} />}
      {tab === 'codex' && <Codex f={f} reload={load} showSecrets={showSecrets} />}
      {tab === 'quests' && <Quests f={f} reload={load} showSecrets={showSecrets} />}
      {tab === 'encounters' && <Encounters f={f} />}
      {tab === 'players' && <Players f={f} upd={upd} reload={load} />}
      {plan && <PlanNight c={c} party={f.party} onClose={() => { setPlan(false); if (params.get('plan')) setParams(tab === 'overview' ? {} : { tab }, { replace: true }) }} onDone={x => { setPlan(false); navigate(`/campaigns/${c.id}/sessions/${x.id}`) }} />}
      {edit && <EditCampaign c={c} onClose={() => setEdit(false)} onSave={async b => { await upd(b); setEdit(false) }} />}
      {del && <Confirm title={`Delete ${c.name}?`} message="Its game nights, codex and quest log go too. The characters stay, without a campaign." confirmLabel="Delete"
        onCancel={() => setDel(false)} onConfirm={async () => { await api.del(`${V1}/campaigns/${c.id}`); announceChange(); navigate('/campaigns') }} />}
    </div>
  )
}

function Secret({ text, show }: { text: string; show: boolean }) {
  const [open, setOpen] = useState(show)
  useEffect(() => setOpen(show), [show])
  if (!text) return null
  return (
    <div className={`secret ${open ? 'open' : ''}`}>
      <button type="button" className="secret-head" onClick={() => setOpen(o => !o)} aria-expanded={open}><Icon name={open ? 'eye' : 'eye-off'} size={13} />Game master only</button>
      {open && <Markdown text={text} />}
    </div>
  )
}

function Overview({ f, next, last, showSecrets, setShowSecrets, onTab, upd }: { f: Full; next?: Session; last?: Session; showSecrets: boolean; setShowSecrets: (b: boolean) => void; onTab: (t: Tab) => void; upd: (b: Partial<Camp>) => Promise<void> }) {
  const c = f.campaign
  const navigate = useNavigate()
  const { toast } = useToast()
  const [ideas, setIdeas] = useState('')
  const [busy, setBusy] = useState(false)
  const active = f.quests.filter(q => q.status === 'active')
  const pinned = f.codex.filter(e => e.pinned)
  const askIdeas = async () => {
    setBusy(true)
    try { setIdeas((await api.post<{ text: string }>(`${V1}/ai/ideas`, { campaign_id: c.id })).text) } catch (e) { toast(errMsg(e), 'err') } finally { setBusy(false) }
  }
  return (
    <div className="camp-overview">
      <div className="col-main">
        <section className="card-lite">
          <div className="sec-head"><h2>The story so far</h2><span className="spacer" /><label className="row small muted">Secrets <Switch size="sm" checked={showSecrets} onChange={setShowSecrets} label="Show the secrets" /></label></div>
          {c.summary ? <Markdown text={c.summary} /> : <p className="muted">What the players know about this campaign. <button type="button" className="linkish" onClick={() => upd({})}>Edit the campaign</button> to write it.</p>}
          <Secret text={c.secrets} show={showSecrets} />
        </section>
        {last && <section className="card-lite recap">
          <div className="sec-head"><h2>Last time</h2><span className="muted small">Session {last.number} · {fmtDate(last.date)}</span><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate(`/campaigns/${c.id}/sessions/${last.id}`)}>Open</button></div>
          <h3 className="recap-title">{last.title}</h3>
          {last.recap ? <Markdown text={last.recap} /> : <p className="muted">No recap yet.</p>}
        </section>}
        <section className="card-lite">
          <div className="sec-head"><h2>Next game night</h2><span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={askIdeas} disabled={busy}><Icon name="sparkles" size={14} />{busy ? 'Thinking…' : 'Ideas (AI)'}</button></div>
          {ideas && <div className="ai-box"><Markdown text={ideas} /></div>}
          {next ? <button type="button" className="next-night" onClick={() => navigate(`/campaigns/${c.id}/sessions/${next.id}`)}>
            <span className="date-tile"><b>{new Date(next.date + 'T00:00').getDate()}</b><small>{new Date(next.date + 'T00:00').toLocaleDateString(undefined, { month: 'short' })}</small></span>
            <span className="grow"><b>Session {next.number}{next.title ? ` · ${next.title}` : ''}</b><span className="muted small">{fmtDate(next.date)}{next.time ? ` at ${next.time}` : ''}{next.encounters ? ` · ${next.encounters} encounters ready` : ''}</span></span>
            <Icon name="chevron-right" size={16} />
          </button> : <p className="muted">Nothing planned yet.</p>}
        </section>
      </div>
      <aside className="col-side">
        <section className="card-lite">
          <div className="sec-head"><h2>The party</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => onTab('party')}>All</button></div>
          {f.party.length === 0 ? <p className="muted">No one yet.</p> : <ul className="mini-party">{f.party.filter(p => p.status === 'active').map(p => (
            <li key={p.id}><button type="button" className="mini-pc" onClick={() => navigate(`/characters/${p.id}`)}>
              <span className="mini-pc-name"><b>{p.name}</b><span className="muted small">{p.classes}</span></span>
              <span className="mini-pc-hp num">{p.hp_cur}/{p.hp_max}</span>
            </button></li>))}</ul>}
        </section>
        <section className="card-lite">
          <div className="sec-head"><h2>Open quests</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => onTab('quests')}>All</button></div>
          {active.length === 0 ? <p className="muted">None open.</p> : <ul className="quest-mini">{active.map(q => {
            const done = q.objectives.filter(o => o.done).length
            return <li key={q.id}><Icon name="compass" size={14} /><span className="grow">{q.title}</span>{q.objectives.length > 0 && <span className="muted small num">{done}/{q.objectives.length}</span>}</li>
          })}</ul>}
        </section>
        {pinned.length > 0 && <section className="card-lite">
          <div className="sec-head"><h2>Pinned</h2></div>
          <ul className="codex-mini">{pinned.map(e => <li key={e.id}><button type="button" className="linkish" onClick={() => navigate(`/campaigns/${c.id}/codex/${e.id}`)}><Icon name={ENTRY_KINDS[e.kind].icon} size={14} />{e.name}</button><span className="muted small">{e.subtitle}</span></li>)}</ul>
        </section>}
        {c.house_rules && <section className="card-lite"><div className="sec-head"><h2>House rules</h2></div><Markdown text={c.house_rules} /></section>}
      </aside>
    </div>
  )
}

function Sessions({ f, onPlan }: { f: Full; onPlan: () => void }) {
  const navigate = useNavigate()
  const list = [...f.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
  if (!list.length) return <Empty title="No game nights yet" icon="calendar"><button type="button" className="btn primary" onClick={onPlan}>Plan the first one</button></Empty>
  return (
    <ul className="session-list">
      {list.map(x => (
        <li key={x.id}><button type="button" className={`session-row ${x.status}`} onClick={() => navigate(`/campaigns/${f.campaign.id}/sessions/${x.id}`)}>
          <span className="session-n">{x.number}</span>
          <span className="grow"><b>{x.title || `Session ${x.number}`}</b><span className="muted small">{fmtDate(x.date)}{x.time ? ` · ${x.time}` : ''}{x.xp ? ` · ${x.xp} XP` : ''}{x.loot ? ` · ${x.loot}` : ''}</span>
            {x.recap && <span className="session-recap">{x.recap}</span>}</span>
          <span className={`state ${x.status}`}>{x.status === 'planned' ? (x.date < todayISO() ? 'Not marked played' : 'Planned') : x.status === 'played' ? 'Played' : 'Called off'}</span>
        </button></li>
      ))}
    </ul>
  )
}

function Party({ f, reload }: { f: Full; reload: () => void }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  const [others, setOthers] = useState<Character[]>([])
  useEffect(() => { if (adding) api.get<{ characters: Character[] }>(`${V1}/characters`).then(r => setOthers(r.characters.filter(c => c.campaign_id !== f.campaign.id))).catch(() => {}) }, [adding, f.campaign.id])
  const join = async (c: Character) => { try { await api.put(`${V1}/characters/${c.id}`, { campaign_id: f.campaign.id }); announceChange(); reload(); setAdding(false) } catch (e) { toast(errMsg(e), 'err') } }
  return (
    <div>
      <div className="row"><span className="spacer" />
        <button type="button" className="btn" onClick={() => setAdding(true)}><Icon name="users" size={15} />Add someone</button>
        <button type="button" className="btn primary" onClick={() => navigate(`/characters/new?campaign=${f.campaign.id}`)}><Icon name="plus" size={15} />New character</button></div>
      {f.party.length === 0 ? <Empty title="No one in the party yet" icon="users">Build characters here, or add ones you already have.</Empty>
        : <div className="char-grid">{f.party.map(c => <CharacterCard key={c.id} c={c} />)}</div>}
      {adding && <Modal title="Add to the party" onClose={() => setAdding(false)}>
        {others.length === 0 ? <p className="muted">Every character is in this campaign already.</p> : <ul className="pick-list">{others.map(c => (
          <li key={c.id}><button type="button" className="pick-row" onClick={() => join(c)}><b>{c.name}</b><span className="muted small grow"> · {c.classes}{c.campaign_name ? ` · now in ${c.campaign_name}` : ''}</span><Icon name="plus" size={15} /></button></li>
        ))}</ul>}
      </Modal>}
    </div>
  )
}

function Codex({ f, reload, showSecrets }: { f: Full; reload: () => void; showSecrets: boolean }) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<EntryKind | ''>('')
  const [q, setQ] = useState('')
  const [making, setMaking] = useState<EntryKind | null>(null)
  const list = f.codex.filter(e => (!kind || e.kind === kind) && (!q || (e.name + e.subtitle + e.body).toLowerCase().includes(q.toLowerCase())))
  return (
    <div>
      <div className="toolbar">
        <input className="input" placeholder="Find in the codex" value={q} onChange={e => setQ(e.target.value)} aria-label="Find" />
        <Segmented size="sm" value={kind} onChange={setKind} label="Kind" options={[{ value: '', label: 'All' }, ...(Object.keys(ENTRY_KINDS) as EntryKind[]).map(k => ({ value: k, label: ENTRY_KINDS[k].plural }))]} />
        <MenuButton label="Add" className="btn primary" items={(Object.keys(ENTRY_KINDS) as EntryKind[]).map(k => ({ label: `A ${ENTRY_KINDS[k].one.toLowerCase()}`, icon: ENTRY_KINDS[k].icon, onSelect: () => setMaking(k) }))}><Icon name="plus" size={15} />Add</MenuButton>
      </div>
      {list.length === 0 ? <Empty title="Nothing here yet" icon="scroll">People, places, factions, items, lore and handouts. Reveal one and the players see it on their page.</Empty> : <div className="codex-grid">
        {list.map(e => (
          <button key={e.id} type="button" className={`codex-card ${e.kind} ${e.status === 'dead' ? 'is-dead' : ''}`} onClick={() => navigate(`/campaigns/${f.campaign.id}/codex/${e.id}`)}>
            {e.thumb_url ? <img src={e.thumb_url} alt="" className="codex-img" /> : <span className="codex-ico"><Icon name={ENTRY_KINDS[e.kind].icon} size={20} /></span>}
            <span className="codex-body">
              <span className="codex-name">{e.name}{e.pinned && <Icon name="pin" size={12} />}</span>
              <span className="muted small ellipsis">{e.subtitle || ENTRY_KINDS[e.kind].one}{e.place_name ? ` · ${e.place_name}` : ''}</span>
              <span className="codex-tags">
                {e.attitude && <span className={`att ${e.attitude}`}>{e.attitude}</span>}
                {e.status && e.status !== 'alive' && <span className="tag">{e.status}</span>}
                <span className={`reveal ${e.revealed ? 'on' : ''}`} title={e.revealed ? 'The players can see it' : 'Hidden from the players'}><Icon name={e.revealed ? 'eye' : 'eye-off'} size={12} /></span>
                {showSecrets && e.secret && <span className="tag secret-tag">secret</span>}
              </span>
            </span>
          </button>
        ))}
      </div>}
      {making && <EntryEditor campaign={f.campaign} kind={making} places={f.codex.filter(x => x.kind === 'place')} onClose={() => setMaking(null)} onSaved={() => { setMaking(null); reload() }} />}
    </div>
  )
}

function Quests({ f, reload, showSecrets }: { f: Full; reload: () => void; showSecrets: boolean }) {
  const [open, setOpen] = useState<Quest | 'new' | null>(null)
  const { toast } = useToast()
  const groups: [Quest['status'], string][] = [['active', 'Open'], ['rumour', 'Rumours'], ['done', 'Done'], ['failed', 'Failed']]
  const toggle = async (q: Quest, i: number) => {
    const objectives = q.objectives.map((o, j) => (j === i ? { ...o, done: !o.done } : o))
    try { await api.put(`${V1}/quests/${q.id}`, { objectives }); reload() } catch (e) { toast(errMsg(e), 'err') }
  }
  return (
    <div>
      <div className="row"><span className="spacer" /><button type="button" className="btn primary" onClick={() => setOpen('new')}><Icon name="plus" size={15} />New quest</button></div>
      {f.quests.length === 0 && <Empty title="The quest log is empty" icon="compass">Write down what the party is after, step by step.</Empty>}
      {groups.map(([st, label]) => {
        const qs = f.quests.filter(q => q.status === st)
        if (!qs.length) return null
        return (
          <section key={st} className="quest-group">
            <h2 className="group-h">{label}</h2>
            {qs.map(q => (
              <article key={q.id} className={`quest ${q.status}`}>
                <header className="quest-head">
                  <button type="button" className="quest-title" onClick={() => setOpen(q)}><Icon name="compass" size={16} /><b>{q.title}</b></button>
                  {!q.revealed && <span className="reveal" title="Hidden from the players"><Icon name="eye-off" size={13} /></span>}
                  {q.reward && <span className="muted small"><Icon name="coins" size={12} /> {q.reward}</span>}
                </header>
                {q.summary && <p className="quest-sum">{q.summary}</p>}
                {(q.giver_name || q.place_name) && <p className="muted small">{q.giver_name && <>From {q.giver_name}</>}{q.giver_name && q.place_name ? ' · ' : ''}{q.place_name && <>at {q.place_name}</>}</p>}
                {q.objectives.length > 0 && <ul className="objectives">{q.objectives.map((o, i) => (
                  <li key={i}><button type="button" className={`obj ${o.done ? 'done' : ''}`} onClick={() => toggle(q, i)} aria-pressed={o.done}><span className="obj-box" aria-hidden="true">{o.done && <Icon name="check" size={11} strokeWidth={3} />}</span>{o.text}</button></li>
                ))}</ul>}
                {showSecrets && q.secret && <Secret text={q.secret} show />}
              </article>
            ))}
          </section>
        )
      })}
      {open && <QuestEditor campaign={f.campaign} quest={open === 'new' ? null : open} codex={f.codex} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload() }} />}
    </div>
  )
}

function Encounters({ f }: { f: Full }) {
  const navigate = useNavigate()
  if (!f.encounters.length) return <Empty title="No encounters yet" icon="swords"><button type="button" className="btn primary" onClick={() => navigate(`/encounters/new?campaign=${f.campaign.id}`)}>Build one</button></Empty>
  return (
    <div>
      <div className="row"><span className="spacer" /><button type="button" className="btn primary" onClick={() => navigate(`/encounters/new?campaign=${f.campaign.id}`)}><Icon name="plus" size={15} />Build an encounter</button></div>
      <ul className="enc-list">{f.encounters.map(e => (
        <li key={e.id}><button type="button" className={`enc-row ${e.status}`} onClick={() => navigate(`/encounters/${e.id}`)}>
          <Icon name="swords" size={16} />
          <span className="grow"><b>{e.name}</b><span className="muted small">{e.place}{e.plan.length ? ` · ${e.plan.map(l => `${l.n} × ${l.name}`).join(', ')}` : ''}</span></span>
          <span className={`state ${e.status}`}>{e.status === 'running' ? `Round ${e.state.round}` : e.status === 'done' ? 'Done' : 'Ready'}</span>
        </button></li>
      ))}</ul>
    </div>
  )
}

function Players({ f, upd, reload }: { f: Full; upd: (b: Partial<Camp>) => Promise<void>; reload: () => void }) {
  const c = f.campaign
  const { toast } = useToast()
  const revealed = f.codex.filter(e => e.revealed).length
  return (
    <div className="players">
      <section className="card-lite">
        <div className="sec-head"><h2>The players' page</h2></div>
        <p>A page for your players, on any phone, without an account: the party with its hit points, the recaps, the quest log, what you revealed of people, places and lore ({revealed} {revealed === 1 ? 'entry' : 'entries'}), and the fight in progress — whose turn it is, how hurt the monsters look. Never a secret.</p>
        <div className="row wrap"><Switch checked={c.share_on} onChange={v => upd({ share_on: v })} label="The players' page is on" /><span>{c.share_on ? 'On: anyone with the link can see it' : 'Off'}</span></div>
        {c.share_on && f.player_url && <><CopyField value={f.player_url} label="Link" />
          <div className="row wrap">
            <a className="btn" href={f.player_url} target="_blank" rel="noreferrer"><Icon name="external" size={14} />Open it</a>
            <button type="button" className="btn" onClick={async () => { try { await api.post(`${V1}/campaigns/${c.id}/share`); reload(); toast('A new link: the old one stopped working') } catch (e) { toast(errMsg(e), 'err') } }}><Icon name="refresh" size={14} />New link</button>
          </div>
          <p className="muted small">Your box is reachable only on your own network unless you made it public; players need to reach it too.</p></>}
      </section>
    </div>
  )
}

export function PlanNight({ c, party, onClose, onDone }: { c: Camp; party: Character[]; onClose: () => void; onDone: (s: Session) => void }) {
  const { toast } = useToast()
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10) })
  const [time, setTime] = useState(/(\d{1,2}:\d{2})/.exec(c.schedule)?.[1]?.padStart(5, '0') || '19:00')
  const [title, setTitle] = useState('')
  const [planText, setPlanText] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyDay, setBusyDay] = useState<{ title: string; start: string }[] | null>(null)
  useEffect(() => { api.get<{ events: { title: string; start: string }[] }>(`${V1}/apps/busy?date=${date}`).then(r => setBusyDay(r.events)).catch(() => setBusyDay(null)) }, [date])
  const save = async () => {
    setBusy(true)
    try { onDone(await api.post<Session>(`${V1}/sessions`, { campaign_id: c.id, date, time, title, plan: planText })); announceChange() } catch (e) { toast(errMsg(e), 'err'); setBusy(false) }
  }
  return (
    <Modal title={`Plan a game night · ${c.name}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !date} onClick={save}>Plan it</button></>}>
      <div className="form-grid">
        <Field label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Time"><input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Field label="Title" help="Optional — you can name it after it is played"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="The seventh level" /></Field>
      </div>
      {busyDay && busyDay.length > 0 && <p className="notice small"><Icon name="calendar" size={13} /> Also that day: {busyDay.map(e => `${e.title}${e.start.length > 10 ? ' at ' + e.start.slice(11, 16) : ''}`).join(', ')}</p>}
      <Field label="Your prep" help="One thing a line; Pocket Tasks can turn the lines into tasks."><textarea className="input" rows={4} value={planText} onChange={e => setPlanText(e.target.value)} placeholder={'- Recap the last session\n- Stat block for the boss\n- Map of the mines'} /></Field>
      <p className="muted small">{party.filter(p => p.status === 'active').length} characters are expected. {c.place ? `At ${c.place}.` : ''}</p>
    </Modal>
  )
}

function EditCampaign({ c, onClose, onSave }: { c: Camp; onClose: () => void; onSave: (b: Partial<Camp>) => Promise<void> }) {
  const [v, setV] = useState({ name: c.name, tagline: c.tagline, world: c.world, summary: c.summary, secrets: c.secrets, house_rules: c.house_rules, schedule: c.schedule, place: c.place, emblem: c.emblem, color: c.color, advancement: c.advancement })
  const set = (k: keyof typeof v, x: string) => setV(o => ({ ...o, [k]: x }))
  const changed = useMemo(() => JSON.stringify(v) !== JSON.stringify({ name: c.name, tagline: c.tagline, world: c.world, summary: c.summary, secrets: c.secrets, house_rules: c.house_rules, schedule: c.schedule, place: c.place, emblem: c.emblem, color: c.color, advancement: c.advancement }), [v, c])
  return (
    <Modal title="Edit the campaign" onClose={onClose} size="lg" footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!changed || !v.name.trim()} onClick={() => onSave(v)}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name"><input className="input" value={v.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="In one line"><input className="input" value={v.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
        <Field label="World"><input className="input" value={v.world} onChange={e => set('world', e.target.value)} /></Field>
        <Field label="When you play"><input className="input" value={v.schedule} onChange={e => set('schedule', e.target.value)} placeholder="Fridays, 19:00" /></Field>
        <Field label="Where you play"><input className="input" value={v.place} onChange={e => set('place', e.target.value)} placeholder="Ana's flat, or online" /></Field>
        <Field label="Levelling up" group><Segmented value={v.advancement} onChange={x => set('advancement', x)} options={[{ value: 'xp', label: 'Experience points' }, { value: 'milestone', label: 'Milestones' }]} label="Advancement" /></Field>
      </div>
      <Field label="What the players know"><textarea className="input" rows={5} value={v.summary} onChange={e => set('summary', e.target.value)} /></Field>
      <Field label="Your secrets" help="Never on the players' page, never sent to another app."><textarea className="input secret-input" rows={4} value={v.secrets} onChange={e => set('secrets', e.target.value)} /></Field>
      <Field label="House rules"><textarea className="input" rows={3} value={v.house_rules} onChange={e => set('house_rules', e.target.value)} /></Field>
      <Field label="Emblem" group><div className="emblem-pick">{EMBLEMS.map(e => <button key={e} type="button" className={`emblem-btn ${v.emblem === e ? 'on' : ''}`} onClick={() => set('emblem', e)} aria-label={e}><Crest emblem={e} color={v.color} size={34} /></button>)}</div></Field>
      <Field label="Colour" group><div className="swatches">{CAMPAIGN_COLORS.map(x => <button key={x} type="button" className={`swatch ${v.color === x ? 'on' : ''}`} style={{ background: x }} onClick={() => set('color', x)} aria-label={x} />)}</div></Field>
    </Modal>
  )
}

export { RatingBadge, Select }
