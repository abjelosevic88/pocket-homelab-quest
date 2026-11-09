// One codex entry: a person, a place, a faction, an item, lore or a handout.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { announceChange } from '../lib/data'
import { loadMonster, useLoad } from '../lib/srd'
import type { Campaign, Entry } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { Markdown } from '../components/Markdown'
import { StatBlock } from '../components/StatBlock'
import { EntryEditor, ENTRY_KINDS } from '../components/CodexEditors'
import { Icon } from '../components/icons'
import { Confirm, Loading, Switch, errMsg, useToast } from '../components/ui'

export default function CodexEntry() {
  const { id, eid } = useParams()
  const navigate = useNavigate()
  const { settings } = useApp()
  const { toast } = useToast()
  const [e, setE] = useState<Entry | null>(null)
  const [camp, setCamp] = useState<Campaign | null>(null)
  const [places, setPlaces] = useState<Entry[]>([])
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [secret, setSecret] = useState(!!settings?.show_secrets)
  const [read, setRead] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    api.get<Entry>(`${V1}/codex/${eid}`).then(setE).catch(x => toast(errMsg(x), 'err'))
    api.get<{ campaign: Campaign; codex: Entry[] }>(`${V1}/campaigns/${id}`).then(r => { setCamp(r.campaign); setPlaces(r.codex.filter(x => x.kind === 'place')) }).catch(() => {})
  }, [eid, id, toast])
  useEffect(() => { load() }, [load])
  useCrumb(e?.name, `/campaigns/${id}?tab=codex`)
  const block = useLoad(() => (e?.monster ? loadMonster(e.monster) : Promise.resolve(null)), [e?.monster])
  if (!e || !camp) return <Loading />
  const reveal = async (v: boolean) => { try { setE(await api.put<Entry>(`${V1}/codex/${e.id}`, { revealed: v })); announceChange() } catch (x) { toast(errMsg(x), 'err') } }
  const readaloud = async () => { setBusy(true); try { setRead((await api.post<{ text: string }>(`${V1}/ai/readaloud`, { entry_id: e.id })).text) } catch (x) { toast(errMsg(x), 'err') } finally { setBusy(false) } }
  const share = async () => { try { toast((await api.post<{ text: string }>(`${V1}/apps/chat`, { entry_id: e.id })).text) } catch (x) { toast(errMsg(x), 'err') } }
  const k = ENTRY_KINDS[e.kind]
  return (
    <div className={`page entry-page ${e.kind}`}>
      <header className="entry-head">
        {e.photo_url ? <img src={e.photo_url} alt="" className="entry-photo" /> : <span className="entry-ico"><Icon name={k.icon} size={30} /></span>}
        <div className="grow">
          <span className="kicker">{k.one}{e.place_name ? ` · ${e.place_name}` : ''}</span>
          <h1 className="entry-name">{e.name}</h1>
          {e.subtitle && <p className="entry-sub">{e.subtitle}</p>}
          <div className="row wrap">
            {e.attitude && <span className={`att ${e.attitude}`}>{e.attitude}</span>}
            {e.status && e.status !== 'alive' && <span className="tag">{e.status}</span>}
            {e.tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        </div>
        <div className="col right">
          <label className="row small"><Switch checked={e.revealed} onChange={reveal} label="Revealed to the players" />{e.revealed ? 'Players can see it' : 'Hidden from players'}</label>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setEdit(true)}><Icon name="edit" size={14} />Edit</button>
            <button type="button" className="btn sm" onClick={share} title="Send to the party chat"><Icon name="message" size={14} /></button>
            <button type="button" className="btn ghost sm danger-text" onClick={() => setDel(true)} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </div>
        </div>
      </header>
      <div className={e.kind === 'handout' ? 'handout' : 'entry-body'}>
        {e.body ? <Markdown text={e.body} /> : <p className="muted">Nothing written yet.</p>}
      </div>
      {e.secret && <section className={`secret ${secret ? 'open' : ''}`}>
        <button type="button" className="secret-head" onClick={() => setSecret(s => !s)}><Icon name={secret ? 'eye' : 'eye-off'} size={13} />Game master only</button>
        {secret && <Markdown text={e.secret} />}
      </section>}
      {e.kind === 'place' && <section className="card-lite">
        <div className="sec-head"><h2>Read aloud</h2><span className="spacer" /><button type="button" className="btn ghost sm" onClick={readaloud} disabled={busy}><Icon name="sparkles" size={14} />{busy ? 'Writing…' : 'Write it (AI)'}</button></div>
        {read ? <blockquote className="readaloud">{read}</blockquote> : <p className="muted small">Boxed text for when the party arrives.</p>}
      </section>}
      {block && <section className="entry-block"><StatBlock m={block} campaignId={camp.id} who={e.name} /></section>}
      {edit && <EntryEditor campaign={camp} kind={e.kind} entry={e} places={places} onClose={() => setEdit(false)} onSaved={n => { setE(n); setEdit(false) }} />}
      {del && <Confirm title={`Delete ${e.name}?`} message="It leaves the codex and the players' page." confirmLabel="Delete" onCancel={() => setDel(false)}
        onConfirm={async () => { await api.del(`${V1}/codex/${e.id}`); announceChange(); navigate(`/campaigns/${id}?tab=codex`) }} />}
    </div>
  )
}
