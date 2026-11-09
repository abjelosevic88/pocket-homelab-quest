// A character sheet someone shared (/c/<link>): the whole sheet, read only.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { compute, fmtMod, normalizeSheet, setSpellIndex } from '../lib/rules'
import { loadSpells, useRules } from '../lib/srd'
import type { Character } from '../lib/types'
import { ABILITIES } from '../lib/types'
import { CharacterToken, StatBox } from '../components/Game'
import { Seal } from '../components/Art'
import { Loading, Tabs } from '../components/ui'
import { ActionsTab, FeaturesTab, InventoryTab, SpellsTab, StoryTab } from '../components/SheetTabs'
import { AbilityBox, Conditions, HitPoints, SkillsList, type SheetCtx, type SheetTab } from './Character'

export default function SharedSheet() {
  const { token } = useParams()
  const rules = useRules()
  const [c, setC] = useState<Character | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<SheetTab>('actions')
  const [, setReady] = useState(0)
  useEffect(() => { api.get<{ character: Character }>(`${V1}/public/c/${token}`).then(r => { setC(r.character); document.title = r.character.name }).catch(e => setErr((e as Error).message)) }, [token])
  useEffect(() => { loadSpells().then(l => { setSpellIndex(l); setReady(1) }).catch(() => {}) }, [])
  const s = useMemo(() => normalizeSheet(c?.sheet), [c])
  const d = useMemo(() => (rules && c ? compute(s, rules) : null), [rules, c, s])
  if (err) return <div className="player-page"><div className="welcome"><Seal size={80} /><h1 className="page-title">This link does not work</h1><p className="muted">{err}</p></div></div>
  if (!c || !rules || !d) return <div className="player-page"><Loading /></div>
  const ctx: SheetCtx = { c, s, d, r: rules, set: () => {}, roll: () => {}, readOnly: true }
  return (
    <div className="player-page sheet-page shared">
      <header className="hero">
        <span className="hero-token"><CharacterToken c={{ ...c, hp_max: d.hpMax }} size={96} showHP /></span>
        <div className="hero-body"><h1 className="hero-name">{c.name}</h1><div className="hero-line">{d.speciesName} · {d.classesText}</div>
          <div className="hero-meta">{d.backgroundName && <span>{d.backgroundName}</span>}{d.alignmentName && <span>{d.alignmentName}</span>}{c.player && <span>Played by {c.player}</span>}</div></div>
      </header>
      <section className="vitals">
        <StatBox shape="shield" label="Armour" value={d.ac} sub={d.acNote} />
        <HitPoints ctx={ctx} />
        <StatBox label="Initiative" value={fmtMod(d.init)} /><StatBox label="Speed" value={<>{d.speed}<small> ft.</small></>} />
        <StatBox label="Proficiency" value={fmtMod(d.pb)} /><StatBox label="Passive Perc." value={d.pp} />
      </section>
      <Conditions ctx={ctx} />
      <div className="sheet-grid">
        <aside className="sheet-left"><div className="abilities">{ABILITIES.map(a => <AbilityBox key={a} a={a} ctx={ctx} />)}</div><SkillsList ctx={ctx} /></aside>
        <div className="sheet-right">
          <Tabs tabs={[{ id: 'actions', label: 'Actions' }, ...(d.casting.length ? [{ id: 'spells' as const, label: 'Spells' }] : []), { id: 'inventory', label: 'Inventory' }, { id: 'features', label: 'Features' }, { id: 'story', label: 'Story' }]} value={tab} onChange={setTab} />
          {tab === 'actions' && <ActionsTab ctx={ctx} />}{tab === 'spells' && <SpellsTab ctx={ctx} />}{tab === 'inventory' && <InventoryTab ctx={ctx} />}
          {tab === 'features' && <FeaturesTab ctx={ctx} />}{tab === 'story' && <StoryTab ctx={ctx} />}
        </div>
      </div>
      <footer className="player-foot muted small">Pocket Quest · 5E compatible · read only</footer>
    </div>
  )
}
