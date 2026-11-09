// Making and editing what is in a campaign: codex entries and quests.
import { useState } from 'react'
import { api, V1 } from '../lib/api'
import { announceChange } from '../lib/data'
import { shrink, uploadPhoto } from '../lib/photo'
import type { Campaign, Entry, EntryKind, Objective, Quest } from '../lib/types'
import { Icon } from './icons'
import { Field, Modal, Segmented, Switch, errMsg, useToast } from './ui'
import { Select } from './Select'

export const ENTRY_KINDS: Record<EntryKind, { one: string; plural: string; icon: string }> = {
  npc: { one: 'Person', plural: 'People', icon: 'user' }, place: { one: 'Place', plural: 'Places', icon: 'map' }, faction: { one: 'Faction', plural: 'Factions', icon: 'flag' },
  item: { one: 'Item', plural: 'Items', icon: 'gift' }, lore: { one: 'Lore', plural: 'Lore', icon: 'book-open' }, handout: { one: 'Handout', plural: 'Handouts', icon: 'scroll' },
}

type Draft = Pick<Entry, 'name' | 'subtitle' | 'body' | 'secret' | 'status' | 'attitude' | 'monster' | 'revealed' | 'pinned' | 'tags'> & { place_id: number | null; photo_id: number | null; photo_url: string }

export function EntryEditor({ campaign, kind, entry, places, onClose, onSaved }: { campaign: Campaign; kind: EntryKind; entry?: Entry; places: Entry[]; onClose: () => void; onSaved: (e: Entry) => void }) {
  const { toast } = useToast()
  const [d, setD] = useState<Draft>(() => entry ? { ...entry, photo_url: entry.thumb_url } : { name: '', subtitle: '', body: '', secret: '', status: kind === 'npc' ? 'alive' : '', attitude: '', monster: '', revealed: false, pinned: false, tags: [], place_id: null, photo_id: null, photo_url: '' })
  const [k, setK] = useState<EntryKind>(entry?.kind || kind)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState<'' | 'ai' | 'save' | 'photo'>('')
  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => setD(x => ({ ...x, [key]: v }))
  const ai = async () => {
    setBusy('ai')
    try {
      const r = await api.post<{ entry: { name: string; subtitle: string; body: string; secret: string; attitude: Draft['attitude']; tags: string[] } }>(`${V1}/ai/npc`, { campaign_id: campaign.id, kind: k, hint: hint || d.name })
      setD(x => ({ ...x, name: x.name || r.entry.name, subtitle: r.entry.subtitle, body: r.entry.body, secret: r.entry.secret, attitude: r.entry.attitude || x.attitude, tags: r.entry.tags || x.tags }))
    } catch (e) { toast(errMsg(e), 'err') } finally { setBusy('') }
  }
  const nameIt = async () => {
    const kindQ = k === 'place' ? (/inn|tavern/i.test(d.subtitle) ? 'tavern' : 'place') : 'human'
    try { const r = await api.get<{ names: string[] }>(`${V1}/names?kind=${kindQ}&n=1`); set('name', r.names[0] || '') } catch { /* offline */ }
  }
  const photo = async (f: File) => {
    setBusy('photo')
    try { const p = await uploadPhoto(await shrink(f), k === 'place' ? 'place' : k === 'npc' ? 'npc' : 'handout'); setD(x => ({ ...x, photo_id: p.id, photo_url: p.thumb_url })) } catch (e) { toast(errMsg(e), 'err') } finally { setBusy('') }
  }
  const save = async () => {
    setBusy('save')
    const body = { campaign_id: campaign.id, kind: k, name: d.name, subtitle: d.subtitle, body: d.body, secret: d.secret, status: k === 'npc' ? d.status : '', attitude: d.attitude, monster: d.monster,
      revealed: d.revealed, pinned: d.pinned, tags: d.tags, place_id: d.place_id, photo_id: d.photo_id }
    try {
      const e = entry ? await api.put<Entry>(`${V1}/codex/${entry.id}`, body) : await api.post<Entry>(`${V1}/codex`, body)
      announceChange(); onSaved(e)
    } catch (e) { toast(errMsg(e), 'err'); setBusy('') }
  }
  return (
    <Modal title={entry ? `Edit ${entry.name}` : `A new ${ENTRY_KINDS[k].one.toLowerCase()}`} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!d.name.trim() || !!busy} onClick={save}>Save</button></>}>
      {!entry && <Segmented size="sm" value={k} onChange={setK} label="Kind" options={(Object.keys(ENTRY_KINDS) as EntryKind[]).map(x => ({ value: x, label: ENTRY_KINDS[x].one }))} />}
      <div className="ai-row">
        <input className="input grow" value={hint} onChange={e => setHint(e.target.value)} placeholder={k === 'npc' ? 'e.g. a nervous blacksmith who owes the cult money' : 'a few words, and the AI fills it in'} aria-label="What you want" />
        <button type="button" className="btn" onClick={ai} disabled={busy === 'ai'}><Icon name="sparkles" size={14} />{busy === 'ai' ? 'Writing…' : 'Make it up (AI)'}</button>
      </div>
      <div className="form-grid">
        <Field label="Name"><div className="row"><input className="input grow" value={d.name} onChange={e => set('name', e.target.value)} />{(k === 'npc' || k === 'place') && <button type="button" className="btn" onClick={nameIt} title="Suggest a name"><Icon name="shuffle" size={14} /></button>}</div></Field>
        <Field label={k === 'npc' ? 'Who they are' : 'What it is'}><input className="input" value={d.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder={k === 'npc' ? 'Innkeeper of the Gilded Goose' : ''} /></Field>
        {k === 'npc' && <Field label="Alive?" group><Segmented size="sm" value={d.status} onChange={v => set('status', v)} label="State" options={[{ value: 'alive', label: 'Alive' }, { value: 'missing', label: 'Missing' }, { value: 'dead', label: 'Dead' }]} /></Field>}
        {(k === 'npc' || k === 'faction') && <Field label="Towards the party" group><Segmented size="sm" value={d.attitude} onChange={v => set('attitude', v)} label="Attitude" options={[{ value: '', label: '—' }, { value: 'friendly', label: 'Friendly' }, { value: 'neutral', label: 'Neutral' }, { value: 'hostile', label: 'Hostile' }]} /></Field>}
        {k !== 'place' || places.length > 1 ? <Field label={k === 'place' ? 'Inside' : 'Where'}><Select value={d.place_id ? String(d.place_id) : ''} onChange={v => set('place_id', v ? Number(v) : null)} ariaLabel="Place"
          options={[{ value: '', label: '—' }, ...places.filter(p => p.id !== entry?.id).map(p => ({ value: String(p.id), label: p.name }))]} /></Field> : null}
        {k === 'npc' && <Field label="Stat block" help="srd:veteran, srd:mage… or one of yours (my:3)"><input className="input" value={d.monster} onChange={e => set('monster', e.target.value)} placeholder="srd:veteran" /></Field>}
      </div>
      <Field label="What the players may learn" help="Shown on the players' page once you reveal it."><textarea className="input" rows={5} value={d.body} onChange={e => set('body', e.target.value)} /></Field>
      <Field label="Game master only"><textarea className="input secret-input" rows={3} value={d.secret} onChange={e => set('secret', e.target.value)} /></Field>
      <div className="row wrap">
        <label className="row"><Switch checked={d.revealed} onChange={v => set('revealed', v)} label="Revealed" />Revealed to the players</label>
        <label className="row"><Switch checked={d.pinned} onChange={v => set('pinned', v)} label="Pinned" />Pinned</label>
        <label className="btn sm"><Icon name="camera" size={14} />{d.photo_id ? 'Another picture' : 'A picture'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void photo(f) }} /></label>
        {d.photo_url && <img src={d.photo_url} alt="" className="thumb-sm" />}
        {d.photo_id && <button type="button" className="btn ghost sm" onClick={() => setD(x => ({ ...x, photo_id: null, photo_url: '' }))}>No picture</button>}
      </div>
      <Field label="Tags"><input className="input" value={d.tags.join(', ')} onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} placeholder="ally, priest" /></Field>
    </Modal>
  )
}

export function QuestEditor({ campaign, quest, codex, onClose, onSaved }: { campaign: Campaign; quest: Quest | null; codex: Entry[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [q, setQ] = useState(() => quest ? { ...quest } : { title: '', status: 'active' as Quest['status'], summary: '', secret: '', reward: '', objectives: [] as Objective[], revealed: true, giver_id: null as number | null, place_id: null as number | null })
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const body = { campaign_id: campaign.id, title: q.title, status: q.status, summary: q.summary, secret: q.secret, reward: q.reward, objectives: q.objectives, revealed: q.revealed, giver_id: q.giver_id, place_id: q.place_id }
    try { if (quest) await api.put(`${V1}/quests/${quest.id}`, body); else await api.post(`${V1}/quests`, body); announceChange(); onSaved() } catch (e) { toast(errMsg(e), 'err'); setBusy(false) }
  }
  const remove = async () => { if (!quest) return; await api.del(`${V1}/quests/${quest.id}`); announceChange(); onSaved() }
  const add = () => { if (line.trim()) { setQ(x => ({ ...x, objectives: [...x.objectives, { text: line.trim(), done: false }] })); setLine('') } }
  return (
    <Modal title={quest ? quest.title : 'A new quest'} onClose={onClose} size="lg"
      footer={<>{quest && <button type="button" className="btn ghost danger-text" onClick={remove}><Icon name="trash" size={14} />Delete</button>}<span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!q.title.trim() || busy} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Quest"><input className="input" autoFocus value={q.title} onChange={e => setQ(x => ({ ...x, title: e.target.value }))} placeholder="Recover the Ember Crown" /></Field>
        <Field label="State" group><Segmented size="sm" value={q.status} onChange={v => setQ(x => ({ ...x, status: v }))} label="State" options={[{ value: 'rumour', label: 'Rumour' }, { value: 'active', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'failed', label: 'Failed' }]} /></Field>
        <Field label="Given by"><Select value={q.giver_id ? String(q.giver_id) : ''} onChange={v => setQ(x => ({ ...x, giver_id: v ? Number(v) : null }))} ariaLabel="Given by" options={[{ value: '', label: '—' }, ...codex.filter(e => e.kind === 'npc' || e.kind === 'faction').map(e => ({ value: String(e.id), label: e.name }))]} /></Field>
        <Field label="Where"><Select value={q.place_id ? String(q.place_id) : ''} onChange={v => setQ(x => ({ ...x, place_id: v ? Number(v) : null }))} ariaLabel="Where" options={[{ value: '', label: '—' }, ...codex.filter(e => e.kind === 'place').map(e => ({ value: String(e.id), label: e.name }))]} /></Field>
        <Field label="Reward"><input className="input" value={q.reward} onChange={e => setQ(x => ({ ...x, reward: e.target.value }))} placeholder="200 gp" /></Field>
      </div>
      <Field label="What the party knows"><textarea className="input" rows={3} value={q.summary} onChange={e => setQ(x => ({ ...x, summary: e.target.value }))} /></Field>
      <Field label="Steps" group>
        <ul className="objectives edit">{q.objectives.map((o, i) => (
          <li key={i}><button type="button" className={`obj ${o.done ? 'done' : ''}`} onClick={() => setQ(x => ({ ...x, objectives: x.objectives.map((y, j) => (j === i ? { ...y, done: !y.done } : y)) }))}><span className="obj-box">{o.done && <Icon name="check" size={11} strokeWidth={3} />}</span>{o.text}</button>
            <button type="button" className="btn ghost sm icon-only" onClick={() => setQ(x => ({ ...x, objectives: x.objectives.filter((_, j) => j !== i) }))} aria-label="Remove the step"><Icon name="x" size={13} /></button></li>
        ))}</ul>
        <div className="row"><input className="input grow" value={line} onChange={e => setLine(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="A step: find the map" /><button type="button" className="btn sm" onClick={add} disabled={!line.trim()}>Add</button></div>
      </Field>
      <Field label="Game master only"><textarea className="input secret-input" rows={2} value={q.secret} onChange={e => setQ(x => ({ ...x, secret: e.target.value }))} /></Field>
      <label className="row"><Switch checked={q.revealed} onChange={v => setQ(x => ({ ...x, revealed: v }))} label="On the players' page" />On the players' page</label>
    </Modal>
  )
}
