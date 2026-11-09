// Every campaign as its seal, and starting a new one.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { announceChange, useOnChange } from '../lib/data'
import type { Campaign } from '../lib/types'
import { CampaignCard } from '../components/Game'
import { Crest, EMBLEMS, Seal } from '../components/Art'
import { Icon } from '../components/icons'
import { Empty, Field, Loading, Modal, Segmented, errMsg, useToast } from '../components/ui'

export const CAMPAIGN_COLORS = ['#9f1d35', '#1d5f8a', '#3f7d4e', '#6b3fa0', '#b8892e', '#2f8f7a', '#7a4a2a', '#444b57', '#c0508a', '#a8323e']

export default function Campaigns() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState<Campaign[] | null>(null)
  const [make, setMake] = useState(false)
  const load = useCallback(() => { api.get<{ campaigns: Campaign[] }>(`${V1}/campaigns`).then(r => setList(r.campaigns)).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])
  useOnChange(load)
  // "plan a game night" from the menu: straight into the active campaign
  useEffect(() => {
    if (params.get('plan') && list) {
      const c = list.find(x => x.status === 'active')
      setParams({}, { replace: true })
      if (c) navigate(`/campaigns/${c.id}?tab=sessions&plan=1`)
      else setMake(true)
    }
  }, [params, list, navigate, setParams])
  if (!list) return <Loading />
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Campaigns</h1><p className="muted">Each with its world, its party, its game nights and its secrets.</p></div>
        <button type="button" className="btn primary" onClick={() => setMake(true)}><Icon name="plus" size={15} />New campaign</button>
      </div>
      {list.length === 0 ? <div className="empty-hero"><Seal size={72} /><Empty title="No campaign yet">Start one for your table — or a one-shot. Add the party, plan the first game night, write down who lives in your world.</Empty>
        <button type="button" className="btn primary" onClick={() => setMake(true)}><Icon name="plus" size={15} />Start a campaign</button></div>
        : <div className="camp-grid">{list.map(c => <CampaignCard key={c.id} c={c} />)}</div>}
      {make && <NewCampaign onClose={() => setMake(false)} />}
    </div>
  )
}

export function NewCampaign({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [world, setWorld] = useState('')
  const [emblem, setEmblem] = useState('dragon')
  const [color, setColor] = useState(CAMPAIGN_COLORS[0])
  const [adv, setAdv] = useState<'xp' | 'milestone'>('xp')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const c = await api.post<Campaign>(`${V1}/campaigns`, { name: name.trim(), tagline, world, emblem, color, advancement: adv })
      announceChange(); onClose(); navigate(`/campaigns/${c.id}`)
    } catch (e) { toast(errMsg(e), 'err'); setBusy(false) }
  }
  return (
    <Modal title="A new campaign" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save} disabled={!name.trim() || busy}>Start it</button></>}>
      <div className="new-camp">
        <div className="new-camp-crest"><Crest emblem={emblem} color={color} size={96} /></div>
        <div className="form-grid grow">
          <Field label="Name"><input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="The Ember Crown" /></Field>
          <Field label="In one line"><input className="input" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A dead king's crown, a city of soot…" /></Field>
          <Field label="World or setting"><input className="input" value={world} onChange={e => setWorld(e.target.value)} placeholder="Your own world's name" /></Field>
          <Field label="Characters level up by" group><Segmented value={adv} onChange={setAdv} options={[{ value: 'xp', label: 'Experience points' }, { value: 'milestone', label: 'Milestones' }]} label="Advancement" /></Field>
        </div>
      </div>
      <Field label="Emblem" group><div className="emblem-pick">{EMBLEMS.map(e => <button key={e} type="button" className={`emblem-btn ${emblem === e ? 'on' : ''}`} onClick={() => setEmblem(e)} aria-label={e} title={e}><Crest emblem={e} color={color} size={34} /></button>)}</div></Field>
      <Field label="Colour" group><div className="swatches">{CAMPAIGN_COLORS.map(c => <button key={c} type="button" className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div></Field>
    </Modal>
  )
}
