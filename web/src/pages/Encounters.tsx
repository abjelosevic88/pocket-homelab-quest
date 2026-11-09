// Every encounter: fights in progress first, then the ones ready, then the past.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useOnChange } from '../lib/data'
import type { Encounter } from '../lib/types'
import { RatingBadge } from '../components/Game'
import { Icon } from '../components/icons'
import { Empty, Loading, errMsg, useToast } from '../components/ui'

export default function Encounters() {
  const navigate = useNavigate()
  const [list, setList] = useState<Encounter[] | null>(null)
  const load = useCallback(() => { api.get<{ encounters: Encounter[] }>(`${V1}/encounters`).then(r => setList(r.encounters)).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])
  useOnChange(load)
  if (!list) return <Loading />
  const groups: [Encounter['status'], string][] = [['running', 'In progress'], ['plan', 'Ready'], ['done', 'Fought']]
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Encounters</h1><p className="muted">Build a fight with the official difficulty budget, then run it with the initiative tracker.</p></div>
        <button type="button" className="btn primary" onClick={() => navigate('/encounters/new')}><Icon name="plus" size={15} />Build an encounter</button>
      </div>
      {list.length === 0 && <Empty title="No encounters yet" icon="swords">Pick monsters from the bestiary, see how hard the fight is for your party, and run it round by round.</Empty>}
      {groups.map(([st, label]) => {
        const l = list.filter(e => e.status === st)
        if (!l.length) return null
        return <section key={st}><h2 className="group-h">{label}</h2>
          <ul className="enc-list">{l.map(e => (
            <li key={e.id}><button type="button" className={`enc-row ${e.status}`} onClick={() => navigate(`/encounters/${e.id}`)}>
              <Icon name="swords" size={16} />
              <span className="grow"><b>{e.name}</b><span className="muted small">{[e.campaign_name, e.place, e.plan.map(x => `${x.n} × ${x.name}`).join(', ')].filter(Boolean).join(' · ')}</span></span>
              {e.status === 'running' ? <span className="state running">Round {e.state.round}</span> : e.rating ? <RatingBadge rating={e.rating} /> : null}
            </button></li>
          ))}</ul>
        </section>
      })}
    </div>
  )
}

/** /encounters/new: make one and open it. */
export function NewEncounter() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { toast } = useToast()
  useEffect(() => {
    let done = false
    const camp = Number(params.get('campaign')) || null
    const sess = Number(params.get('session')) || null
    const make = async () => {
      let campaign_id = camp
      if (!campaign_id) {
        const r = await api.get<{ campaigns: { id: number; status: string }[] }>(`${V1}/campaigns`).catch(() => ({ campaigns: [] }))
        campaign_id = r.campaigns.find(c => c.status === 'active')?.id || null
      }
      const e = await api.post<{ encounter: Encounter }>(`${V1}/encounters`, { name: 'A new encounter', campaign_id, session_id: sess })
      if (!done) navigate(`/encounters/${e.encounter.id}?new=1`, { replace: true })
    }
    make().catch(e => toast(errMsg(e), 'err'))
    return () => { done = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Loading />
}
