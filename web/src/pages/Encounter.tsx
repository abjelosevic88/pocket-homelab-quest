// An encounter: build it (monsters, how hard it is for the party, read-aloud
// text), then run it — initiative order, whose turn, hit points, conditions,
// concentration, death saves, legendary actions, the log — and end it,
// sharing the experience.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { announceChange } from '../lib/data'
import { useRoll } from '../lib/dice'
import { CONDITION_HINTS, crText, signed } from '../lib/srd'
import type { Campaign, Character, Combatant, Difficulty, Encounter as Enc, Fight, Monster, PlanCost, Session } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { CharacterToken, HPBar, Pips, RatingBadge, RATING_HELP, hpTone } from '../components/Game'
import { CreatureIcon } from '../components/Art'
import { StatBlock } from '../components/StatBlock'
import { MonsterPicker } from '../components/Pickers'
import { Icon } from '../components/icons'
import { Confirm, Field, Loading, type MenuItem, MenuButton, Modal, Segmented, Switch, errMsg, useIsMobile, useToast } from '../components/ui'
import { Select } from '../components/Select'

interface Got { encounter: Enc; difficulty: Difficulty; costs: PlanCost[]; levels: number[]; blocks?: Record<string, Monster> }

export default function Encounter() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { toast } = useToast()
  const [g, setG] = useState<Got | null>(null)
  const load = useCallback(() => api.get<Got>(`${V1}/encounters/${id}`).then(setG).catch(e => toast(errMsg(e), 'err')), [id, toast])
  useEffect(() => { load() }, [load])
  useCrumb(g?.encounter.name)
  if (!g) return <Loading />
  return g.encounter.status === 'plan'
    ? <Build g={g} setG={setG} reload={load} fresh={params.get('new') === '1'} />
    : <Tracker g={g} setG={setG} reload={load} />
}

// ---- building ----

function Meter({ d }: { d: Difficulty }) {
  if (!d.party) return <p className="muted small">Put the encounter in a campaign with a party to see how hard it is.</p>
  const top = Math.max(d.high * 1.25, d.xp * 1.05, 1)
  const at = (n: number) => `${Math.min(100, (n / top) * 100)}%`
  return (
    <div className="meter">
      <div className="meter-head"><RatingBadge rating={d.rating} xp={d.xp} /><span className="muted small">{d.party} characters · budget low {d.low.toLocaleString()} · moderate {d.moderate.toLocaleString()} · high {d.high.toLocaleString()} XP</span></div>
      <div className="meter-bar" role="img" aria-label={`${d.xp} XP against a high budget of ${d.high}`}>
        <span className="zone low" style={{ width: at(d.low) }} /><span className="zone moderate" style={{ left: at(d.low), width: `calc(${at(d.moderate)} - ${at(d.low)})` }} /><span className="zone high" style={{ left: at(d.moderate), width: `calc(${at(d.high)} - ${at(d.moderate)})` }} />
        <span className="meter-fill" style={{ width: at(d.xp) }} />
        {[d.low, d.moderate, d.high].map((n, i) => <span key={i} className="tick" style={{ left: at(n) }} />)}
      </div>
      {d.rating && <p className="small muted">{RATING_HELP[d.rating]}</p>}
    </div>
  )
}

function Build({ g, setG, reload, fresh }: { g: Got; setG: (g: Got) => void; reload: () => void; fresh: boolean }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const e = g.encounter
  const [pick, setPick] = useState(fresh && e.plan.length === 0)
  const [camps, setCamps] = useState<Campaign[]>([])
  const [nights, setNights] = useState<Session[]>([])
  const [start, setStart] = useState(false)
  const [del, setDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => { api.get<{ campaigns: Campaign[] }>(`${V1}/campaigns`).then(r => setCamps(r.campaigns)).catch(() => {}) }, [])
  useEffect(() => { if (e.campaign_id) api.get<{ sessions: Session[] }>(`${V1}/sessions?campaign=${e.campaign_id}&status=planned`).then(r => setNights(r.sessions)).catch(() => {}) }, [e.campaign_id])
  const timer = useRef(0)
  const save = (body: Partial<Enc>, now = false) => {
    setG({ ...g, encounter: { ...e, ...body } })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => { try { setG(await api.put<Got>(`${V1}/encounters/${e.id}`, body)); announceChange() } catch (x) { toast(errMsg(x), 'err') } }, now ? 0 : 700)
  }
  const setN = (ref: string, n: number) => save({ plan: e.plan.map(l => (l.ref === ref ? { ...l, n } : l)).filter(l => l.n > 0) }, true)
  const readaloud = async () => { setBusy(true); try { const r = await api.post<{ text: string }>(`${V1}/ai/readaloud`, { encounter_id: e.id }); save({ readaloud: r.text }, true) } catch (x) { toast(errMsg(x), 'err') } finally { setBusy(false) } }
  const cost = (ref: string) => g.costs.find(c => c.ref === ref)
  return (
    <div className="page enc-build">
      <div className="page-head">
        <div className="grow"><input className="title-input" value={e.name} onChange={x => save({ name: x.target.value })} aria-label="Name" />
          <input className="input bare" value={e.place} onChange={x => save({ place: x.target.value })} placeholder="Where it happens" aria-label="Where" /></div>
        <button type="button" className="btn primary" disabled={!e.plan.length} onClick={() => setStart(true)}><Icon name="play" size={15} />Start the fight</button>
        <MenuButton label="More" align="right" items={[{ label: 'Delete', icon: 'trash', danger: true, onSelect: () => setDel(true) }]}><Icon name="more" size={18} /></MenuButton>
      </div>
      <div className="enc-grid">
        <div className="col-main">
          <section className="card-lite">
            <div className="sec-head"><h2>Monsters</h2><span className="spacer" /><button type="button" className="btn sm" onClick={() => setPick(true)}><Icon name="plus" size={14} />Add</button></div>
            {e.plan.length === 0 ? <p className="muted">No monsters yet.</p> : <ul className="plan">{e.plan.map(l => {
              const c = cost(l.ref)
              return (
                <li key={l.ref}>
                  <span className="plan-n stepper">
                    <button type="button" className="btn ghost sm icon-only" onClick={() => setN(l.ref, l.n - 1)} aria-label="One fewer"><Icon name="minus" size={13} /></button><b>{l.n}</b>
                    <button type="button" className="btn ghost sm icon-only" onClick={() => setN(l.ref, l.n + 1)} aria-label="One more"><Icon name="plus" size={13} /></button>
                  </span>
                  <button type="button" className="grow plan-name" onClick={() => setPreview(l.ref)}><b>{l.name || c?.name || l.ref}</b>{c && <span className="muted small"> · CR {crText(c.cr)} · {c.xp.toLocaleString()} XP each</span>}</button>
                  <span className="num muted small">{c ? (c.xp * l.n).toLocaleString() : ''} XP</span>
                </li>
              )
            })}</ul>}
            <Meter d={g.difficulty} />
            {g.levels.length > 0 && <p className="muted small">Party levels: {g.levels.join(', ')}. Budget from the SRD 5.2 “XP Budget per Character” table.</p>}
          </section>
          <section className="card-lite">
            <div className="sec-head"><h2>Read aloud</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={readaloud} disabled={busy}><Icon name="sparkles" size={14} />{busy ? 'Writing…' : 'Write it (AI)'}</button></div>
            <textarea className="input readaloud-input" rows={4} value={e.readaloud} onChange={x => save({ readaloud: x.target.value })} placeholder="What the characters see as the scene opens." />
          </section>
          <section className="card-lite">
            <div className="sec-head"><h2>Notes</h2></div>
            <textarea className="input" rows={4} value={e.notes} onChange={x => save({ notes: x.target.value })} placeholder="Tactics, terrain, what happens if they flee…" />
          </section>
        </div>
        <aside className="col-side">
          <section className="card-lite">
            <Field label="Campaign"><Select value={e.campaign_id ? String(e.campaign_id) : ''} onChange={v => save({ campaign_id: v ? Number(v) : null, session_id: null }, true)} ariaLabel="Campaign" options={[{ value: '', label: 'None' }, ...camps.map(c => ({ value: String(c.id), label: c.name }))]} /></Field>
            {e.campaign_id && <Field label="Game night"><Select value={e.session_id ? String(e.session_id) : ''} onChange={v => save({ session_id: v ? Number(v) : null }, true)} ariaLabel="Game night" options={[{ value: '', label: 'Any' }, ...nights.map(n => ({ value: String(n.id), label: `Session ${n.number}${n.title ? ' · ' + n.title : ''}` }))]} /></Field>}
          </section>
          {preview && g.blocks?.[preview] && <StatBlock m={g.blocks[preview]} compact campaignId={e.campaign_id} />}
        </aside>
      </div>
      {pick && <MonsterPicker onClose={() => setPick(false)} onPick={m => { const had = e.plan.find(l => l.ref === m.key); save({ plan: had ? e.plan.map(l => (l.ref === m.key ? { ...l, n: l.n + 1 } : l)) : [...e.plan, { ref: m.key, n: 1 }] }, true); setPick(false); setTimeout(reload, 400) }} />}
      {start && <StartDialog e={e} onClose={() => setStart(false)} onStarted={x => { setStart(false); setG(x); announceChange() }} />}
      {del && <Confirm title="Delete this encounter?" message="The plan and any fight in it go." confirmLabel="Delete" onCancel={() => setDel(false)} onConfirm={async () => { await api.del(`${V1}/encounters/${e.id}`); announceChange(); navigate('/encounters') }} />}
    </div>
  )
}

function StartDialog({ e, onClose, onStarted }: { e: Enc; onClose: () => void; onStarted: (g: Got) => void }) {
  const { toast } = useToast()
  const [party, setParty] = useState(!!e.campaign_id)
  const [rollHP, setRollHP] = useState(false)
  const [group, setGroup] = useState(true)
  const [rollPC, setRollPC] = useState(false)
  const go = async () => {
    try { const r = await api.post<Got>(`${V1}/encounters/${e.id}/start`, { party, roll_hp: rollHP, group_init: group, roll_player: rollPC }); onStarted(await api.get<Got>(`${V1}/encounters/${r.encounter.id}`)) } catch (x) { toast(errMsg(x), 'err') }
  }
  return (
    <Modal title="Start the fight" onClose={onClose} size="sm" footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={go}><Icon name="swords" size={15} />Roll initiative</button></>}>
      <label className="row setting-line"><Switch checked={party} onChange={setParty} disabled={!e.campaign_id} label="The party" /><span className="grow">The campaign's party joins</span></label>
      <label className="row setting-line"><Switch checked={rollPC} onChange={setRollPC} label="Roll for the players" /><span className="grow">Roll the players' initiative too (otherwise they tell you)</span></label>
      <label className="row setting-line"><Switch checked={group} onChange={setGroup} label="Group initiative" /><span className="grow">One initiative for each kind of monster</span></label>
      <label className="row setting-line"><Switch checked={rollHP} onChange={setRollHP} label="Roll hit points" /><span className="grow">Roll the monsters' hit dice instead of the average</span></label>
    </Modal>
  )
}

// ---- running the fight ----

const CONDS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']

function Tracker({ g, setG, reload }: { g: Got; setG: (g: Got) => void; reload: () => void }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const roll = useRoll()
  const mobile = useIsMobile()
  const e = g.encounter
  const [f, setF] = useState<Fight>(e.state)
  const [sel, setSel] = useState<string>(() => e.state.combatants[e.state.turn]?.id || '')
  const [adding, setAdding] = useState<'' | 'monster' | 'other'>('')
  const [finish, setFinish] = useState(false)
  const [chars, setChars] = useState<Record<number, Character>>({})
  const done = e.status === 'done'
  useEffect(() => { api.get<{ characters: Character[] }>(`${V1}/characters`).then(r => setChars(Object.fromEntries(r.characters.map(c => [c.id, c])))).catch(() => {}) }, [])
  // saving: every change goes to the server (it sorts, logs, and copies the party's hit points to their sheets)
  const queue = useRef<{ state: Fight; sort?: boolean; log?: string } | null>(null)
  const timer = useRef(0)
  const flush = useCallback(async () => {
    const q = queue.current
    queue.current = null
    if (!q) return
    try { const r = await api.put<{ state: Fight }>(`${V1}/encounters/${e.id}/fight`, q); if (q.sort || q.log) setF(r.state) } catch (x) { toast(errMsg(x), 'err') }
  }, [e.id, toast])
  useEffect(() => () => { window.clearTimeout(timer.current); void flush() }, [flush])
  const push = (state: Fight, o: { sort?: boolean; log?: string; now?: boolean } = {}) => {
    setF(state)
    const logs = [queue.current?.log, o.log].filter(Boolean).join(' ')
    queue.current = { state, sort: o.sort || queue.current?.sort, log: logs || undefined }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, o.now || o.sort || o.log ? 0 : 500)
  }
  const upd = (id: string, fn: (c: Combatant) => Combatant, log?: string) => push({ ...f, combatants: f.combatants.map(c => (c.id === id ? fn(c) : c)) }, { log })
  const next = (dir = 1) => {
    const n = f.combatants.length
    if (!n) return
    let turn = f.turn, round = f.round
    for (let i = 0; i < n; i++) {
      turn += dir
      if (turn >= n) { turn = 0; round++ }
      if (turn < 0) { turn = n - 1; round = Math.max(1, round - 1) }
      if (!f.combatants[turn].out) break
    }
    const newRound = round !== f.round && dir > 0
    const combatants = newRound ? f.combatants.map(c => (c.legendary != null && g.blocks?.[c.ref]?.legendary?.length ? { ...c, legendary: 3 } : c)) : f.combatants
    push({ ...f, turn, round, combatants }, { log: newRound ? `Round ${round}.` : undefined, now: true })
    setSel(combatants[turn].id)
  }
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement
      if (done || t.closest('input, textarea, [contenteditable="true"]') || document.querySelector('.modal-backdrop')) return
      if (ev.key === ' ') { ev.preventDefault(); next(ev.shiftKey ? -1 : 1) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  const cur = f.combatants[f.turn]
  const s = f.combatants.find(c => c.id === sel) || cur
  const block = s && g.blocks?.[s.ref]
  const alive = f.combatants.filter(c => c.kind !== 'pc' && !c.out && c.hp > 0).length
  const menu = (): MenuItem[] => [
    { label: 'Sort by initiative', icon: 'list', onSelect: () => push(f, { sort: true }) },
    { label: 'Add a monster', icon: 'skull', onSelect: () => setAdding('monster') },
    { label: 'Add someone else', icon: 'user', onSelect: () => setAdding('other') },
    'sep',
    { label: 'Back to the plan (start over)', icon: 'undo', onSelect: async () => { setG(await api.post<Got>(`${V1}/encounters/${e.id}/reset`)); announceChange() } },
  ]
  return (
    <div className="page tracker">
      <header className="tracker-head">
        <div className="round-tile"><small>Round</small><b>{f.round}</b></div>
        <div className="grow">
          <h1 className="page-title">{e.name}</h1>
          <p className="muted small">{[e.place, e.campaign_name, done ? 'The fight is over' : cur ? `${cur.name}'s turn` : ''].filter(Boolean).join(' · ')}</p>
        </div>
        {!done && <>
          <button type="button" className="btn" onClick={() => next(-1)} title="Back a turn (⇧ space)"><Icon name="chevron-left" size={16} /></button>
          <button type="button" className="btn primary next-turn" onClick={() => next(1)} title="Next turn (space)">Next turn<Icon name="chevron-right" size={16} /></button>
          <MenuButton label="More" items={menu} align="right" width={240}><Icon name="more" size={18} /></MenuButton>
          <button type="button" className="btn" onClick={() => setFinish(true)}><Icon name="flag" size={15} /><span className="hide-sm">End</span></button>
        </>}
        {done && <button type="button" className="btn" onClick={async () => { setG(await api.post<Got>(`${V1}/encounters/${e.id}/reset`)); announceChange() }}><Icon name="refresh" size={15} />Run it again</button>}
      </header>
      {e.readaloud && f.round === 1 && f.turn === 0 && !done && <blockquote className="readaloud">{e.readaloud}</blockquote>}
      <div className="tracker-grid">
        <ol className="init-list" aria-label="Initiative order">
          {f.combatants.map((c, i) => {
            const pc = c.kind === 'pc' ? chars[Number(c.ref.split(':')[1])] : undefined
            return (
              <li key={c.id} className={`init-row ${i === f.turn && !done ? 'turn' : ''} ${c.id === s?.id ? 'sel' : ''} ${c.out || (c.kind !== 'pc' && c.hp <= 0) ? 'out' : ''} ${c.hidden ? 'hidden' : ''} ${c.kind}`}>
                <input className="init-num num" inputMode="numeric" value={c.init} disabled={done} aria-label={`${c.name}'s initiative`}
                  onChange={x => upd(c.id, y => ({ ...y, init: Number(x.target.value.replace(/[^0-9-]/g, '')) || 0 }))} onBlur={() => push(f, { sort: true })} />
                <button type="button" className="init-main" onClick={() => setSel(c.id)}>
                  <span className="init-avatar">{pc ? <CharacterToken c={{ ...pc, hp_cur: c.hp, hp_max: c.hp_max }} size={38} /> : <span className={`mon-token ${hpTone(c.hp, c.hp_max)}`}><CreatureIcon type={g.blocks?.[c.ref]?.type || 'humanoid'} size={22} /></span>}</span>
                  <span className="init-body">
                    <span className="init-name">{c.name}{c.conc && <span className="badge conc" title="Concentrating">C</span>}{c.hidden && <Icon name="eye-off" size={12} />}</span>
                    <HPBar cur={c.hp} max={c.hp_max} temp={c.temp} size="sm" />
                    {c.conditions.length > 0 && <span className="init-conds">{c.conditions.map(k => <span key={k} className="cond sm on" title={CONDITION_HINTS[k]}>{k}</span>)}</span>}
                  </span>
                  <span className="init-nums"><span title="Armour class"><Icon name="shield" size={12} />{c.ac}</span><span className="num" title="Hit points">{c.hp}/{c.hp_max}{c.temp ? `+${c.temp}` : ''}</span></span>
                </button>
              </li>
            )
          })}
        </ol>
        {s && <aside className="tracker-side">
          <CombatantPanel c={s} done={done} block={block} campaignId={e.campaign_id} upd={upd} onRemove={() => push({ ...f, combatants: f.combatants.filter(x => x.id !== s.id), turn: Math.min(f.turn, f.combatants.length - 2) }, { log: `${s.name} leaves the fight.` })}
            onRoll={(expr, label) => roll(expr, { label: `${s.name}: ${label}`, campaign_id: e.campaign_id })} />
          {block && !mobile && <StatBlock m={block} compact campaignId={e.campaign_id} who={s.name} />}
          {block && mobile && <details className="stb-details"><summary>Stat block</summary><StatBlock m={block} compact campaignId={e.campaign_id} who={s.name} /></details>}
        </aside>}
      </div>
      <section className="card-lite fight-log">
        <div className="sec-head"><h2>Log</h2><span className="muted small">{alive} {alive === 1 ? 'enemy' : 'enemies'} standing</span></div>
        <ol>{[...f.log].reverse().slice(0, 30).map((l, i) => <li key={i}><span className="muted small">R{l.round}</span> {l.text}</li>)}</ol>
      </section>
      {adding === 'monster' && <MonsterPicker onClose={() => setAdding('')} onPick={async m => {
        setAdding('')
        const r = await fetch(`${V1}/srd/monsters/${encodeURIComponent(m.key)}`, { credentials: 'same-origin' }).then(x => x.json()) as Monster
        const dex = Math.floor(((r.abil?.[1] ?? 10) - 10) / 2)
        const res = await roll(`1d20${dex >= 0 ? '+' + dex : dex}`, { label: `${m.name}: initiative`, kind: 'init', quiet: true })
        const n = f.combatants.filter(c => c.ref === m.key).length
        push({ ...f, combatants: [...f.combatants, { id: 'c' + Math.random().toString(36).slice(2, 8), kind: 'monster', ref: m.key, name: n ? `${m.name} ${n + 1}` : m.name, init: res?.result.total ?? 10, init_bonus: dex, ac: m.ac, hp_max: m.hp, hp: m.hp, temp: 0, conditions: [], conc: false, hidden: false, note: '', saves: [0, 0], out: false }] }, { sort: true, log: `${m.name} joins the fight.` })
        setTimeout(reload, 600)
      }} />}
      {adding === 'other' && <AddOther onClose={() => setAdding('')} onAdd={c => { setAdding(''); push({ ...f, combatants: [...f.combatants, c] }, { sort: true, log: `${c.name} joins the fight.` }) }} />}
      {finish && <FinishDialog e={e} f={f} onClose={() => setFinish(false)} onDone={async award => {
        await flush()
        try { const r = await api.post<Got & { xp_each: number }>(`${V1}/encounters/${e.id}/finish`, { award }); setFinish(false); setG(r); announceChange(); toast(award && r.xp_each ? `${r.xp_each} XP for each character` : 'The fight is over') } catch (x) { toast(errMsg(x), 'err') }
      }} />}
      <button type="button" className="sr-only" onClick={() => navigate('/encounters')}>All encounters</button>
    </div>
  )
}

function CombatantPanel({ c, done, block, campaignId, upd, onRemove, onRoll }: { c: Combatant; done: boolean; block?: Monster; campaignId: number | null; upd: (id: string, fn: (c: Combatant) => Combatant, log?: string) => void; onRemove: () => void; onRoll: (e: string, l: string) => void }) {
  const [n, setN] = useState('')
  const [conds, setConds] = useState(false)
  const amount = Math.max(0, Math.floor(Number(n) || 0))
  void campaignId
  const hit = (kind: 'dmg' | 'heal' | 'temp') => {
    if (!amount) return
    upd(c.id, x => {
      let hp = x.hp, temp = x.temp
      if (kind === 'temp') temp = Math.max(temp, amount)
      else if (kind === 'heal') hp = Math.min(x.hp_max, Math.max(0, hp) + amount)
      else { let d = amount; const soak = Math.min(temp, d); temp -= soak; d -= soak; hp = x.kind === 'pc' ? Math.max(0, hp - d) : hp - d }
      const down = hp <= 0
      return { ...x, hp, temp, out: x.kind !== 'pc' && down ? true : x.out, saves: kind === 'heal' && hp > 0 ? [0, 0] : x.saves }
    }, kind === 'dmg' ? `${c.name} takes ${amount} damage.${c.conc ? ` Concentration: Constitution save DC ${Math.max(10, Math.floor(amount / 2))}.` : ''}` : kind === 'heal' ? `${c.name} regains ${amount} hit points.` : `${c.name} gets ${amount} temporary hit points.`)
    setN('')
  }
  const legend = block?.legendary?.length ? 3 : 0
  return (
    <section className="card-lite cpanel">
      <div className="sec-head"><h2>{c.name}</h2><span className="muted small">AC {c.ac} · init {c.init} ({signed(c.init_bonus)})</span></div>
      <div className="cp-hp"><b className={`num ${hpTone(c.hp, c.hp_max)}`}>{c.hp}</b><span className="muted">/ {c.hp_max}{c.temp ? ` + ${c.temp} temp` : ''}</span></div>
      <HPBar cur={c.hp} max={c.hp_max} temp={c.temp} size="lg" />
      {!done && <div className="hpbox-ctl">
        <input className="input num" inputMode="numeric" value={n} onChange={x => setN(x.target.value.replace(/[^0-9]/g, ''))} placeholder="0" aria-label="Amount" onKeyDown={x => { if (x.key === 'Enter') hit(x.shiftKey ? 'heal' : 'dmg') }} />
        <button type="button" className="btn sm danger-soft" disabled={!amount} onClick={() => hit('dmg')}>Damage</button>
        <button type="button" className="btn sm ok-soft" disabled={!amount} onClick={() => hit('heal')}>Heal</button>
        <button type="button" className="btn sm" disabled={!amount} onClick={() => hit('temp')}>Temp</button>
      </div>}
      {c.kind === 'pc' && c.hp <= 0 && <div className="death">
        <span className="muted small">Death saves</span>
        <span className="death-row ok">{[1, 2, 3].map(i => <button key={i} type="button" className={`dsave ${c.saves[0] >= i ? 'on' : ''}`} onClick={() => upd(c.id, x => ({ ...x, saves: [x.saves[0] === i ? i - 1 : i, x.saves[1]] }))} aria-label={`Success ${i}`} />)}</span>
        <span className="death-row fail">{[1, 2, 3].map(i => <button key={i} type="button" className={`dsave ${c.saves[1] >= i ? 'on' : ''}`} onClick={() => upd(c.id, x => ({ ...x, saves: [x.saves[0], x.saves[1] === i ? i - 1 : i] }))} aria-label={`Failure ${i}`} />)}</span>
        <button type="button" className="btn sm" onClick={() => onRoll('1d20', 'death saving throw')}>Roll</button>
      </div>}
      {legend > 0 && <div className="row"><span className="small">Legendary actions</span><Pips max={legend} used={legend - (c.legendary ?? legend)} label="legendary actions" onChange={done ? undefined : u => upd(c.id, x => ({ ...x, legendary: legend - u }))} /></div>}
      <div className="cp-conds">
        {c.conditions.map(k => <button key={k} type="button" className="cond on" title={CONDITION_HINTS[k]} disabled={done} onClick={() => upd(c.id, x => ({ ...x, conditions: x.conditions.filter(y => y !== k) }), `${c.name} is no longer ${k}.`)}>{k}<Icon name="x" size={11} /></button>)}
        {!done && <button type="button" className="cond add" onClick={() => setConds(o => !o)}><Icon name={conds ? 'chevron-up' : 'plus'} size={11} />Condition</button>}
      </div>
      {conds && !done && <div className="cond-all">{CONDS.filter(k => !c.conditions.includes(k)).map(k => <button key={k} type="button" className="cond" title={CONDITION_HINTS[k]} onClick={() => { upd(c.id, x => ({ ...x, conditions: [...x.conditions, k] }), `${c.name} is ${k}.`); setConds(false) }}>{k}</button>)}</div>}
      {!done && <div className="cp-flags">
        <label className="row small"><Switch size="sm" checked={c.conc} onChange={v => upd(c.id, x => ({ ...x, conc: v }))} label="Concentrating" />Concentrating</label>
        <label className="row small"><Switch size="sm" checked={c.hidden} onChange={v => upd(c.id, x => ({ ...x, hidden: v }))} label="Hidden from the players" />Hidden from players</label>
        <label className="row small"><Switch size="sm" checked={c.out} onChange={v => upd(c.id, x => ({ ...x, out: v }), v ? `${c.name} is out of the fight.` : `${c.name} is back.`)} label="Out of the fight" />Out of the fight</label>
      </div>}
      <input className="input sm" value={c.note} disabled={done} onChange={x => upd(c.id, y => ({ ...y, note: x.target.value }))} placeholder="A note (where it stands, what it wants)" aria-label="Note" />
      {!done && <button type="button" className="btn ghost sm danger-text" onClick={onRemove}><Icon name="trash" size={13} />Remove from the fight</button>}
    </section>
  )
}

function AddOther({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Combatant) => void }) {
  const [name, setName] = useState('')
  const [init, setInit] = useState(10)
  const [ac, setAc] = useState(12)
  const [hp, setHp] = useState(10)
  const [kind, setKind] = useState<'npc' | 'pc' | 'monster'>('npc')
  return (
    <Modal title="Add someone" onClose={onClose} size="sm" footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!name.trim()} onClick={() => onAdd({ id: 'c' + Math.random().toString(36).slice(2, 8), kind, ref: '', name: name.trim(), init, init_bonus: 0, ac, hp_max: hp, hp, temp: 0, conditions: [], conc: false, hidden: false, note: '', saves: [0, 0], out: false })}>Add</button></>}>
      <Field label="Name"><input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
      <Segmented size="sm" value={kind} onChange={setKind} label="Side" options={[{ value: 'npc', label: 'Ally' }, { value: 'monster', label: 'Enemy' }, { value: 'pc', label: 'A guest player' }]} />
      <div className="form-grid">
        <Field label="Initiative"><input className="input num" inputMode="numeric" value={init} onChange={e => setInit(Number(e.target.value) || 0)} /></Field>
        <Field label="Armour class"><input className="input num" inputMode="numeric" value={ac} onChange={e => setAc(Number(e.target.value) || 0)} /></Field>
        <Field label="Hit points"><input className="input num" inputMode="numeric" value={hp} onChange={e => setHp(Math.max(1, Number(e.target.value) || 1))} /></Field>
      </div>
    </Modal>
  )
}

function FinishDialog({ e, f, onClose, onDone }: { e: Enc; f: Fight; onClose: () => void; onDone: (award: boolean) => void }) {
  const beaten = f.combatants.filter(c => c.kind === 'monster' && (c.out || c.hp <= 0))
  const pcs = f.combatants.filter(c => c.kind === 'pc')
  const [award, setAward] = useState(beaten.length > 0 && pcs.length > 0)
  const xpEach = useMemo(() => 0, [])
  void xpEach; void e
  return (
    <Modal title="End the fight" onClose={onClose} size="sm" footer={<><button type="button" className="btn" onClick={onClose}>Not yet</button><button type="button" className="btn primary" onClick={() => onDone(award)}><Icon name="flag" size={15} />End it</button></>}>
      <p>{beaten.length} of {f.combatants.filter(c => c.kind === 'monster').length} monsters beaten in {f.round} {f.round === 1 ? 'round' : 'rounds'}.</p>
      <label className="row setting-line"><Switch checked={award} onChange={setAward} disabled={!pcs.length || !beaten.length} label="Share the XP" /><span className="grow">Share the beaten monsters' XP among the {pcs.length} player characters (added to their sheets)</span></label>
    </Modal>
  )
}
