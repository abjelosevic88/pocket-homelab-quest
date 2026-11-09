// Every character: the active ones first, by campaign.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useOnChange } from '../lib/data'
import type { Character } from '../lib/types'
import { CharacterCard } from '../components/Game'
import { Icon } from '../components/icons'
import { Empty, Loading, Segmented } from '../components/ui'
import { Seal } from '../components/Art'

export default function Characters() {
  const navigate = useNavigate()
  const [list, setList] = useState<Character[] | null>(null)
  const [show, setShow] = useState<'active' | 'all'>('active')
  const load = useCallback(() => { api.get<{ characters: Character[] }>(`${V1}/characters`).then(r => setList(r.characters)).catch(() => setList([])) }, [])
  useEffect(() => { load() }, [load])
  useOnChange(load)
  if (!list) return <Loading />
  const shown = list.filter(c => show === 'all' || c.status === 'active')
  const groups = [...new Set(shown.map(c => c.campaign_name || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Characters</h1><p className="muted">{list.filter(c => c.status === 'active').length} active · tap one for the whole sheet</p></div>
        <Segmented size="sm" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'Everyone' }]} label="Show" />
        <button type="button" className="btn primary" onClick={() => navigate('/characters/new')}><Icon name="plus" size={15} />New character</button>
      </div>
      {list.length === 0 ? <div className="empty-hero"><Seal size={72} /><Empty title="No characters yet">Build one step by step: species, class, ability scores, background, skills, equipment and spells — by the rules.</Empty>
        <button type="button" className="btn primary" onClick={() => navigate('/characters/new')}><Icon name="plus" size={15} />Build a character</button></div> : groups.map(g => (
        <section key={g || 'none'} className="char-group">
          <h2 className="group-h">{g || 'No campaign'}</h2>
          <div className="char-grid">{shown.filter(c => (c.campaign_name || '') === g).map(c => <CharacterCard key={c.id} c={c} />)}</div>
        </section>
      ))}
    </div>
  )
}
