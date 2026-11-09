// One game night: the prep, the encounters ready for it, your notes during
// the game, then the recap, treasure and XP once it is played. Text saves
// as you type.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { announceChange } from '../lib/data'
import { fmtDate } from '../lib/format'
import { useAppState } from '../lib/data'
import type { Character, Encounter, Session as Night } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { CharacterToken } from '../components/Game'
import { Markdown } from '../components/Markdown'
import { Icon } from '../components/icons'
import { Confirm, Field, Loading, type MenuItem, MenuButton, Modal, errMsg, useToast } from '../components/ui'

interface Got { session: Night; encounters: Encounter[]; party: Character[] }

export default function Session() {
  const { sid } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const appState = useAppState()
  const [g, setG] = useState<Got | null>(null)
  const [x, setX] = useState<Night | null>(null)
  const [saving, setSaving] = useState('')
  const [play, setPlay] = useState(false)
  const [del, setDel] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [when, setWhen] = useState(false)
  const load = useCallback(() => api.get<Got>(`${V1}/sessions/${sid}`).then(r => { setG(r); setX(r.session) }).catch(e => toast(errMsg(e), 'err')), [sid, toast])
  useEffect(() => { load() }, [load])
  useCrumb(x ? `Session ${x.number}${x.title ? ' · ' + x.title : ''}` : '', x ? `/campaigns/${x.campaign_id}?tab=sessions` : undefined)
  const timer = useRef(0)
  const pending = useRef<Partial<Night>>({})
  const flush = useCallback(async () => {
    const body = pending.current
    pending.current = {}
    if (!Object.keys(body).length || !sid) return
    setSaving('Saving…')
    try { const n = await api.put<Night>(`${V1}/sessions/${sid}`, body); setX(o => (o ? { ...o, calendar_url: n.calendar_url, calendar_ref: n.calendar_ref } : o)); setSaving('Saved') } catch (e) { setSaving(''); toast(errMsg(e), 'err') }
  }, [sid, toast])
  useEffect(() => () => { window.clearTimeout(timer.current); void flush() }, [flush])
  const edit = (patch: Partial<Night>, now = false) => {
    setX(o => (o ? { ...o, ...patch } : o))
    pending.current = { ...pending.current, ...patch }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, now ? 0 : 900)
  }
  if (!g || !x) return <Loading />
  const cal = appState('calendar', 'calendar:write')
  const notes = appState('notes', 'notes:write')
  const chat = appState('chat', 'chat:write')
  const tasks = appState('tasks', 'tasks:write')
  const act = async (path: string, body: unknown = {}) => {
    try { const r = await api.post<{ text: string; url?: string }>(`${V1}${path}`, body); toast(r.text, 'ok', r.url ? { label: 'Open', run: () => window.open(r.url, '_blank') } : undefined); load() } catch (e) { toast(errMsg(e), 'err') }
  }
  const recapAI = async () => {
    setAiBusy(true)
    await flush()
    try { const r = await api.post<{ text: string }>(`${V1}/ai/recap`, { session_id: x.id }); edit({ recap: r.text }, true) } catch (e) { toast(errMsg(e), 'err') } finally { setAiBusy(false) }
  }
  const menu = (): MenuItem[] => [
    { label: x.calendar_ref ? 'Take off the calendar' : 'Put on the calendar', icon: 'calendar', disabled: !cal.ok, hint: cal.ok ? undefined : 'Pocket Calendar', onSelect: () => act(`/sessions/${x.id}/calendar`, { on: !x.calendar_ref }) },
    { label: 'Prep → Pocket Tasks', icon: 'check-square', disabled: !tasks.ok || !x.plan.trim(), onSelect: () => act(`/sessions/${x.id}/tasks`) },
    { label: 'Save to Pocket Notes', icon: 'note', disabled: !notes.ok, onSelect: () => act(`/sessions/${x.id}/note`) },
    { label: 'Tell the party (Pocket Chat)', icon: 'message', disabled: !chat.ok, onSelect: () => act('/apps/chat', { session_id: x.id, what: x.status === 'played' ? 'recap' : 'invite' }) },
    'sep',
    ...(x.status !== 'cancelled' ? [{ label: 'Call it off', icon: 'x-circle', onSelect: () => edit({ status: 'cancelled' }, true) }] : [{ label: 'Plan it again', icon: 'undo', onSelect: () => edit({ status: 'planned' }, true) }]),
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDel(true) },
  ]
  const here = g.party.filter(p => x.attendance.includes(p.id))
  return (
    <div className="page session-page">
      <header className="night-head">
        <span className="night-n"><small>Session</small><b>{x.number}</b></span>
        <div className="grow">
          <input className="title-input" value={x.title} onChange={e => edit({ title: e.target.value })} placeholder="A title for this game night" aria-label="Title" />
          <div className="muted">
            <button type="button" className="linkish" onClick={() => setWhen(true)}><Icon name="calendar" size={13} />{fmtDate(x.date)}{x.time ? ` at ${x.time}` : ''}</button>
            {' · '}{x.campaign_name}
            {x.calendar_url && <> · <a href={x.calendar_url} target="_blank" rel="noreferrer">on your calendar</a></>}
            <span className={`state ${x.status}`}>{x.status === 'planned' ? 'Planned' : x.status === 'played' ? 'Played' : 'Called off'}</span>
          </div>
        </div>
        <span className="save-state">{saving}</span>
        <button type="button" className="btn primary" onClick={() => setPlay(true)}><Icon name="check" size={15} />{x.status === 'played' ? 'XP and attendance' : 'Mark as played'}</button>
        <MenuButton label="More" items={menu} align="right" width={280}><Icon name="more" size={18} /></MenuButton>
      </header>

      <div className="night-grid">
        <section className="card-lite">
          <div className="sec-head"><h2>Prep</h2><span className="muted small">only you see it</span></div>
          <textarea className="input note-area" rows={8} value={x.plan} onChange={e => edit({ plan: e.target.value })} placeholder={'- What happened last time\n- The scenes you expect\n- Who the party might meet'} />
        </section>
        <section className="card-lite">
          <div className="sec-head"><h2>Encounters</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => navigate(`/encounters/new?campaign=${x.campaign_id}&session=${x.id}`)}><Icon name="plus" size={14} />Build one</button></div>
          {g.encounters.length === 0 ? <p className="muted">None ready for this night.</p> : <ul className="enc-list">{g.encounters.map(e => (
            <li key={e.id}><button type="button" className={`enc-row ${e.status}`} onClick={() => navigate(`/encounters/${e.id}`)}><Icon name="swords" size={15} /><span className="grow"><b>{e.name}</b><span className="muted small">{e.place}</span></span><span className={`state ${e.status}`}>{e.status === 'running' ? `Round ${e.state.round}` : e.status === 'done' ? 'Done' : 'Ready'}</span></button></li>
          ))}</ul>}
          <div className="here">{(x.status === 'played' ? here : g.party.filter(p => p.status === 'active')).map(p => <span key={p.id} title={p.name}><CharacterToken c={p} size={36} /></span>)}</div>
        </section>
        <section className="card-lite">
          <div className="sec-head"><h2>Notes during the game</h2><span className="muted small">only you</span></div>
          <textarea className="input note-area" rows={8} value={x.notes} onChange={e => edit({ notes: e.target.value })} placeholder="Names you made up, what the players decided, loose threads…" />
        </section>
        <section className="card-lite recap">
          <div className="sec-head"><h2>Recap</h2><span className="muted small">the players see it</span><span className="spacer" />
            <button type="button" className="btn ghost sm" onClick={recapAI} disabled={aiBusy || (!x.notes.trim() && !x.plan.trim())} title="From your prep and notes"><Icon name="sparkles" size={14} />{aiBusy ? 'Writing…' : 'Write it (AI)'}</button></div>
          <textarea className="input note-area" rows={8} value={x.recap} onChange={e => edit({ recap: e.target.value })} placeholder="What happened, for the players to read before the next game." />
          {x.recap && <details className="preview"><summary className="muted small">Preview</summary><Markdown text={x.recap} /></details>}
          <Field label="Treasure"><input className="input" value={x.loot} onChange={e => edit({ loot: e.target.value })} placeholder="120 gp, a potion of healing" /></Field>
        </section>
      </div>

      {play && <PlayDialog x={x} party={g.party} onClose={() => setPlay(false)} onDone={async (body) => {
        await flush()
        try {
          const r = await api.post<{ session: Night; level_up: string[] }>(`${V1}/sessions/${x.id}/play`, body)
          setX(r.session); setPlay(false); announceChange(); load()
          toast(r.level_up.length ? `Played. ${r.level_up.join(', ')} can level up.` : 'Marked as played')
        } catch (e) { toast(errMsg(e), 'err') }
      }} />}
      {when && <WhenDialog x={x} onClose={() => setWhen(false)} onSave={(date, time) => { edit({ date, time }, true); setWhen(false) }} />}
      {del && <Confirm title="Delete this game night?" message="Its prep, notes and recap go, and it leaves your calendar. Encounters stay." confirmLabel="Delete" onCancel={() => setDel(false)}
        onConfirm={async () => { await api.del(`${V1}/sessions/${x.id}`); announceChange(); navigate(`/campaigns/${x.campaign_id}?tab=sessions`) }} />}
    </div>
  )
}

function PlayDialog({ x, party, onClose, onDone }: { x: Night; party: Character[]; onClose: () => void; onDone: (b: { xp: number; attendance: number[] }) => void }) {
  const [xp, setXp] = useState(x.xp)
  const [att, setAtt] = useState<number[]>(x.attendance.length ? x.attendance : party.filter(p => p.status === 'active').map(p => p.id))
  return (
    <Modal title={`Session ${x.number} was played`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => onDone({ xp, attendance: att })}>Save</button></>}>
      <Field label="Who was there" group>
        <div className="att-pick">{party.map(p => {
          const on = att.includes(p.id)
          return <button key={p.id} type="button" className={`att ${on ? 'on' : ''}`} onClick={() => setAtt(on ? att.filter(i => i !== p.id) : [...att, p.id])} aria-pressed={on}><CharacterToken c={p} size={40} /><span>{p.name}</span></button>
        })}</div>
      </Field>
      <Field label="Experience for each of them" help="Encounters you finished with “share the XP” are already on the sheets; this is for the rest (role-play, a quest done). Changing it later gives only the difference.">
        <input className="input num" inputMode="numeric" value={xp} onChange={e => setXp(Math.max(0, Number(e.target.value) || 0))} style={{ maxWidth: 160 }} />
      </Field>
    </Modal>
  )
}

function WhenDialog({ x, onClose, onSave }: { x: Night; onClose: () => void; onSave: (d: string, t: string) => void }) {
  const [d, setD] = useState(x.date)
  const [t, setT] = useState(x.time)
  return (
    <Modal title="When" onClose={onClose} size="sm" footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => onSave(d, t)} disabled={!d}>Save</button></>}>
      <div className="form-grid"><Field label="Date"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="Time"><input className="input" type="time" value={t} onChange={e => setT(e.target.value)} /></Field></div>
    </Modal>
  )
}
