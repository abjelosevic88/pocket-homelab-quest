// Left column: a new character (and the other ways to start), the sections,
// then the next game night and a fight in progress.
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useOnChange } from '../lib/data'
import { fmtDate } from '../lib/format'
import type { Campaign, Session } from '../lib/types'
import { Icon } from './icons'
import { createItems, type CreateKind } from './Layout'
import { type Anchor, Menu, rectOf } from './ui'
import { Crest } from './Art'

interface Side { campaigns: Campaign[]; next: Session[]; fight?: { id: number; name: string; round: number; turn: string }; campaign: Campaign | null; characters: number }

export function Sidebar({ onCreate, onNavigate }: { onCreate: (k: CreateKind) => void; onNavigate: () => void }) {
  const { status, settings } = useApp()
  const navigate = useNavigate()
  const loc = useLocation()
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [side, setSide] = useState<Side | null>(null)
  const load = useCallback(() => { api.get<Side>(`${V1}/home`).then(setSide).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, loc.pathname])
  useOnChange(load)
  const title = settings?.title || status?.title || 'Pocket Quest'
  const path = loc.pathname
  const active = (side?.campaigns || []).filter(c => c.status === 'active')
  const nav: { to: string; label: string; icon: string; active: boolean; count?: number; hint?: string }[] = [
    { to: '/', label: 'The table', icon: 'today', active: path === '/' },
    { to: '/characters', label: 'Characters', icon: 'helmet', active: path.startsWith('/characters'), count: side?.characters || undefined, hint: 'Active characters' },
    { to: '/campaigns', label: 'Campaigns', icon: 'castle', active: path.startsWith('/campaigns'), count: active.length || undefined, hint: 'Running campaigns' },
    { to: '/encounters', label: 'Encounters', icon: 'swords', active: path.startsWith('/encounters') },
    { to: '/dice', label: 'Dice', icon: 'd20', active: path.startsWith('/dice') },
    { to: '/compendium', label: 'Compendium', icon: 'book-open', active: path.startsWith('/compendium') },
  ]
  const next = side?.next?.[0]
  return (
    <aside className="sidebar" aria-label="Pocket Quest">
      <div className="sb-brand">
        <img src="/favicon.svg" alt="" className="sb-logo" />
        <span className="sb-title">{title !== 'Pocket Quest' ? title : <>Pocket <b>Quest</b></>}</span>
        {status?.version && <span className="sb-version" title={`Version ${status.version}`}>{/^v?\d+\.\d+/.test(status.version) ? 'v' + status.version.replace(/^v/, '').replace(/[-+].*$/, '') : status.version}</span>}
      </div>
      <div className="create-split">
        <button type="button" className="btn primary create-btn" onClick={() => onCreate('character')} title="New character (N)">
          <Icon name="plus" size={15} strokeWidth={2.2} />New character
        </button>
        <button type="button" className="btn primary create-more" aria-label="More ways to start" aria-haspopup="menu" aria-expanded={!!menu} onClick={e => setMenu(menu ? null : rectOf(e.currentTarget))}>
          <Icon name="chevron-down" size={15} />
        </button>
      </div>
      {menu && <Menu anchor={menu} items={createItems(onCreate)} onClose={() => setMenu(null)} width={260} />}

      <nav className="sb-nav" aria-label="Sections">
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} onClick={onNavigate} title={n.hint} className={() => `sb-nav-item ${n.active ? 'active' : ''}`}>
            <Icon name={n.icon} size={16} />{n.label}
            {!!n.count && <span className="sb-count" title={n.hint}>{n.count}</span>}
          </NavLink>
        ))}
      </nav>

      {(next || side?.fight) && <section className="sb-sec">
        <h4 className="sb-h">At the table</h4>
        {side?.fight && <button type="button" className={`sb-row sb-list ${path === `/encounters/${side.fight.id}` ? 'active' : ''}`} onClick={() => { onNavigate(); navigate(`/encounters/${side.fight!.id}`) }}>
          <span className="sb-place-ico fight" aria-hidden="true"><Icon name="swords" size={14} /></span>
          <span className="grow ellipsis">{side.fight.name}</span>
          <span className="muted small">round {side.fight.round}</span>
        </button>}
        {next && <button type="button" className={`sb-row sb-list ${path === `/campaigns/${next.campaign_id}/sessions/${next.id}` ? 'active' : ''}`} onClick={() => { onNavigate(); navigate(`/campaigns/${next.campaign_id}/sessions/${next.id}`) }}>
          <span className="sb-place-ico" aria-hidden="true"><Icon name="calendar" size={14} /></span>
          <span className="grow ellipsis">Session {next.number}{next.title ? ` · ${next.title}` : ''}</span>
          <span className="muted small">{fmtDate(next.date, false)}</span>
        </button>}
      </section>}

      {active.length > 0 && <section className="sb-sec">
        <h4 className="sb-h">Campaigns</h4>
        {active.slice(0, 6).map(c => (
          <button key={c.id} type="button" className={`sb-row sb-list ${path.startsWith(`/campaigns/${c.id}`) ? 'active' : ''}`} onClick={() => { onNavigate(); navigate(`/campaigns/${c.id}`) }}>
            <span className="sb-crest" aria-hidden="true"><Crest emblem={c.emblem} color={c.color} size={16} /></span>
            <span className="grow ellipsis">{c.name}</span>
          </button>
        ))}
      </section>}

      <div className="sb-foot">
        <Link to="/settings" className="sb-foot-link" onClick={onNavigate}><Icon name="settings" size={15} />Settings</Link>
        <button type="button" className="sb-foot-link" onClick={() => { onNavigate(); window.dispatchEvent(new CustomEvent('pqst:shortcuts')) }}><Icon name="keyboard" size={15} />Shortcuts</button>
      </div>
    </aside>
  )
}
