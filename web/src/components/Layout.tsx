// The app shell: sidebar, top bar, search palette, shortcuts, the dice — the Pocket Calendar layout.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { DataProvider } from '../lib/data'
import { RollerProvider } from '../lib/dice'
import { Icon } from './icons'
import { Sidebar } from './Sidebar'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { ShortcutsSheet } from './ShortcutsSheet'
import { QuickDice } from './QuickDice'
import { Avatar, type MenuItem, MenuButton, modalOpen, useIsMobile, useMediaQuery } from './ui'
import { AskButton } from './AskButton'
import { NewCampaign } from '../pages/Campaigns'

export { announceChange, useOnChange } from '../lib/data'

const SIDEBAR_KEY = 'pqst-sidebar'

/** The page's own name for the top bar breadcrumb. */
const CrumbCtx = createContext<(t: string, to?: string) => void>(() => {})
export function useCrumb(title: string | undefined, parent?: string) {
  const set = useContext(CrumbCtx)
  useEffect(() => { set(title || '', parent); return () => set('') }, [title, parent, set])
}

export type CreateKind = 'character' | 'campaign' | 'session' | 'encounter' | 'monster' | 'dice'

/** Start something from anywhere (a page's button). */
export const openCreate = (k: CreateKind) => window.dispatchEvent(new CustomEvent('pqst:create', { detail: { kind: k } }))

/** The "new" menu: the sidebar's caret. */
export function createItems(onCreate: (k: CreateKind) => void): MenuItem[] {
  return [
    { label: 'New character', icon: 'helmet', hint: 'N', onSelect: () => onCreate('character') },
    { label: 'New campaign', icon: 'castle', onSelect: () => onCreate('campaign') },
    'sep',
    { label: 'Plan a game night', icon: 'calendar-plus', onSelect: () => onCreate('session') },
    { label: 'Build an encounter', icon: 'swords', onSelect: () => onCreate('encounter') },
    { label: 'Make a monster', icon: 'skull', onSelect: () => onCreate('monster') },
    'sep',
    { label: 'Roll dice', icon: 'd20', hint: 'R', onSelect: () => onCreate('dice') },
  ]
}

export default function Layout() {
  return <DataProvider><RollerProvider><Shell /></RollerProvider></DataProvider>
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const mobile = useIsMobile()
  const narrow = useMediaQuery('(max-width: 1099px)')
  const drawer = mobile || narrow
  const [sidebarOpen, setSidebarOpen] = useState(() => !drawer && localStorage.getItem(SIDEBAR_KEY) !== '0')
  useEffect(() => { setSidebarOpen(!drawer && localStorage.getItem(SIDEBAR_KEY) !== '0') }, [drawer])
  const drawerOpenedAt = useRef(0)
  const toggleSidebar = () => setSidebarOpen(o => { drawerOpenedAt.current = performance.now(); const n = !o; if (!drawer) localStorage.setItem(SIDEBAR_KEY, n ? '1' : '0'); return n })
  const closeDrawer = () => { if (drawer) setSidebarOpen(false) }
  useEffect(() => { document.querySelector('.content')?.scrollTo({ top: 0 }) }, [loc.pathname])

  const [crumb, setCrumbRaw] = useState<{ t: string; to?: string }>({ t: '' })
  const setCrumb = useCallback((t: string, to?: string) => setCrumbRaw({ t, to }), [])

  const [palette, setPalette] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [dice, setDice] = useState(false)
  const [newCampaign, setNewCampaign] = useState(false)

  const create = (k: CreateKind) => {
    closeDrawer()
    switch (k) {
      case 'character': navigate('/characters/new'); break
      case 'campaign': setNewCampaign(true); break
      case 'session': navigate('/campaigns?plan=1'); break
      case 'encounter': navigate('/encounters/new'); break
      case 'monster': navigate('/compendium/monsters/new'); break
      case 'dice': setDice(true); break
    }
  }
  const createRef = useRef(create)
  createRef.current = create

  useEffect(() => {
    const open = () => setShortcuts(true)
    const make = (e: Event) => createRef.current((e as CustomEvent<{ kind: CreateKind }>).detail.kind)
    window.addEventListener('pqst:shortcuts', open)
    window.addEventListener('pqst:create', make)
    return () => { window.removeEventListener('pqst:shortcuts', open); window.removeEventListener('pqst:create', make) }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable="true"]') || modalOpen() || document.querySelector('.menu, .popover, .sel-pop')) return
      const go = (to: string) => { e.preventDefault(); navigate(to) }
      switch (e.key) {
        case '/': e.preventDefault(); setPalette(true); break
        case '?': e.preventDefault(); setShortcuts(true); break
        case 'n': e.preventDefault(); createRef.current('character'); break
        case 'r': e.preventDefault(); setDice(true); break
        case 't': go('/'); break
        case 'c': go('/characters'); break
        case 'g': go('/campaigns'); break
        case 'e': go('/encounters'); break
        case 'd': go('/dice'); break
        case 'b': go('/compendium'); break
        case ',': go('/settings'); break
        case '[': e.preventDefault(); toggleSidebar(); break
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const commands: PaletteCommand[] = [
    { id: 'char', label: 'New character', icon: 'helmet', hint: 'N', keywords: 'create hero build player', run: () => create('character') },
    { id: 'camp', label: 'New campaign', icon: 'castle', keywords: 'game world adventure one-shot', run: () => create('campaign') },
    { id: 'enc', label: 'Build an encounter', icon: 'swords', keywords: 'fight combat monsters difficulty', run: () => create('encounter') },
    { id: 'dice', label: 'Roll dice', icon: 'd20', hint: 'R', keywords: 'd20 roll', run: () => create('dice') },
    { id: 'table', label: 'The table', icon: 'today', hint: 'T', keywords: 'home today', run: () => navigate('/') },
    { id: 'chars', label: 'Characters', icon: 'helmet', hint: 'C', keywords: 'heroes party sheets', run: () => navigate('/characters') },
    { id: 'camps', label: 'Campaigns', icon: 'castle', hint: 'G', keywords: 'games sessions', run: () => navigate('/campaigns') },
    { id: 'encs', label: 'Encounters', icon: 'swords', hint: 'E', keywords: 'fights initiative tracker', run: () => navigate('/encounters') },
    { id: 'dicep', label: 'Dice and the roll log', icon: 'd20', hint: 'D', keywords: 'history names generator', run: () => navigate('/dice') },
    { id: 'monsters', label: 'Monsters', icon: 'skull', hint: 'B', keywords: 'bestiary compendium stat block', run: () => navigate('/compendium/monsters') },
    { id: 'spells', label: 'Spells', icon: 'wand', keywords: 'compendium magic', run: () => navigate('/compendium/spells') },
    { id: 'items', label: 'Equipment and magic items', icon: 'bag', keywords: 'weapons armor gear treasure', run: () => navigate('/compendium/equipment') },
    { id: 'conditions', label: 'Conditions', icon: 'aura', keywords: 'prone stunned poisoned rules', run: () => navigate('/compendium/conditions') },
    { id: 'rules', label: 'Rules', icon: 'book-open', keywords: 'combat cover resting srd', run: () => navigate('/compendium/rules') },
    { id: 'settings', label: 'Settings', icon: 'settings', hint: ',', run: () => navigate('/settings') },
    { id: 'apps', label: 'Settings: connected apps', icon: 'link', keywords: 'calendar notes chat tasks core', run: () => navigate('/settings/apps') },
    { id: 'ai-set', label: 'Settings: AI', icon: 'sparkles', keywords: 'pocket ai openai', run: () => navigate('/settings/ai') },
    { id: 'export', label: 'Settings: export', icon: 'download', keywords: 'backup json csv', run: () => navigate('/settings/data') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => setShortcuts(true) },
  ]

  return (
    <CrumbCtx.Provider value={setCrumb}>
      <div className={`app ${sidebarOpen ? 'with-sidebar' : 'no-sidebar'} ${mobile ? 'is-mobile' : ''} ${drawer ? 'drawer-mode' : ''}`}>
        {drawer && sidebarOpen && <div className="drawer-backdrop" onClick={e => { if (e.timeStamp - drawerOpenedAt.current > 400) setSidebarOpen(false) }} />}
        <div className={`sidebar-wrap ${sidebarOpen ? 'open' : ''}`}>
          <Sidebar onCreate={create} onNavigate={closeDrawer} />
        </div>
        <div className="main">
          <TopBar onMenu={toggleSidebar} onPalette={() => setPalette(true)} onDice={() => setDice(true)} mobile={mobile} compact={narrow} sidebarOpen={sidebarOpen} crumb={crumb} />
          <main className="content"><div className="content-inner"><Outlet /></div></main>
        </div>
        {mobile && !/^\/(settings|characters\/new)/.test(loc.pathname) && <button type="button" className="fab" aria-label="Roll dice" title="Roll dice" onClick={() => setDice(true)}><Icon name="d20" size={26} strokeWidth={1.9} /></button>}
        {palette && <CommandPalette onClose={() => setPalette(false)} commands={commands} />}
        {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
        {dice && <QuickDice onClose={() => setDice(false)} />}
        {newCampaign && <NewCampaign onClose={() => setNewCampaign(false)} />}
      </div>
    </CrumbCtx.Provider>
  )
}

const SECTION: Record<string, [string, string]> = {
  '': ['The table', '/'], characters: ['Characters', '/characters'], campaigns: ['Campaigns', '/campaigns'], encounters: ['Encounters', '/encounters'],
  dice: ['Dice', '/dice'], compendium: ['Compendium', '/compendium'],
}

function TopBar({ onMenu, onPalette, onDice, mobile, compact, sidebarOpen, crumb }: { onMenu: () => void; onPalette: () => void; onDice: () => void; mobile: boolean; compact: boolean; sidebarOpen: boolean; crumb: { t: string; to?: string } }) {
  const { user, themeMode, setThemeMode, status, setUser } = useApp()
  const navigate = useNavigate()
  const loc = useLocation()
  const [section, sectionTo] = SECTION[loc.pathname.split('/')[1] || ''] || ['', '/']
  const signOut = async () => { await api.post(`${V1}/auth/logout`).catch(() => {}); setUser(null); navigate('/login') }
  const avatarMenu = (): MenuItem[] => [
    { heading: user?.name || user?.email || '' },
    { label: 'Profile', icon: 'user', onSelect: () => navigate('/settings/profile') },
    { label: 'Settings', icon: 'settings', onSelect: () => navigate('/settings'), hint: ',' },
    { label: 'Keyboard shortcuts', icon: 'keyboard', onSelect: () => window.dispatchEvent(new CustomEvent('pqst:shortcuts')), hint: '?' },
    'sep',
    { heading: 'Appearance' },
    { label: 'System', checked: themeMode === 'system', onSelect: () => setThemeMode('system') },
    { label: 'Light', checked: themeMode === 'light', onSelect: () => setThemeMode('light') },
    { label: 'Dark', checked: themeMode === 'dark', onSelect: () => setThemeMode('dark') },
    ...(status?.auth_mode === 'local' ? ['sep' as const, { label: 'Sign out', icon: 'log-out', onSelect: signOut }] : []),
  ]
  return (
    <header className="topbar">
      <button type="button" className="btn ghost icon-only" onClick={onMenu} aria-label={sidebarOpen ? 'Hide the sidebar' : 'Show the sidebar'} title="Menu ([)"><Icon name={mobile || compact ? 'menu' : 'sidebar'} size={18} /></button>
      <h1 className="range-title">
        {crumb.t ? <><button type="button" className="crumb" onClick={() => navigate(crumb.to || sectionTo)}>{section}</button><Icon name="chevron-right" size={16} className="crumb-sep" /><span className="ellipsis">{crumb.t}</span></> : section}
      </h1>
      <span className="spacer" />
      {!mobile && <button type="button" className="btn ghost icon-only" onClick={onDice} aria-label="Roll dice" title="Roll dice (R)"><Icon name="d20" size={18} /></button>}
      <button type="button" className="btn ghost icon-only" onClick={onPalette} aria-label="Search" title="Search (⌘K or /)"><Icon name="search" size={18} /></button>
      <AskButton />
      <MenuButton label="Account" className="avatar-btn" align="right" width={220} items={avatarMenu}>
        <Avatar name={user?.name} email={user?.email} size={30} />
      </MenuButton>
    </header>
  )
}
