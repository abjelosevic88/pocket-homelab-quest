// Levelling up by the rules: pick the class (multiclassing needs the
// ability scores), take the average hit points or roll, choose a subclass
// when the class reaches it, take an ability score improvement, and see
// what the level brings.
import { useMemo, useState } from 'react'
import { useRoll } from '../lib/dice'
import { addLevel, avgHitDie, classLevel, featuresAt, isASILevel, meetsMulticlass, scores, subclassLevel, totalLevel, type Derived } from '../lib/rules'
import type { Rules } from '../lib/srd'
import type { Ability, Character, Sheet } from '../lib/types'
import { ABILITIES, ABILITY_NAMES } from '../lib/types'
import { useApp } from '../lib/app-context'
import { ClassEmblem, CLASS_COLORS } from './Art'
import { Markdown } from './Markdown'
import { Icon } from './icons'
import { Modal, Segmented } from './ui'
import { Select } from './Select'

export function LevelUp({ c, s, r, d, onClose, onDone }: { c: Character; s: Sheet; r: Rules; d: Derived; onClose: () => void; onDone: (s: Sheet) => void }) {
  const { settings } = useApp()
  const roll = useRoll()
  const sc = scores(s, r)
  const current = s.classes.map(x => x.key)
  const firstLevel = s.classes.length === 0
  const canMulti = current.every(k => r.classBy[k] && meetsMulticlass(r.classBy[k], sc))
  const [cls, setCls] = useState(current[0] || 'fighter')
  const k = r.classBy[cls]
  const newLevel = classLevel(s, cls) + 1
  const [hpMode, setHpMode] = useState<'average' | 'roll'>(settings?.hp_on_level || 'average')
  const [rolled, setRolled] = useState<number | null>(null)
  const [sub, setSub] = useState(s.classes.find(x => x.key === cls)?.sub || '')
  const [asiKind, setAsiKind] = useState<'two' | 'split' | 'feat'>('two')
  const [a1, setA1] = useState<Ability>(k?.casting?.ability || 'str')
  const [a2, setA2] = useState<Ability>('con')
  const [feat, setFeat] = useState('')
  const needSub = !!k && newLevel === subclassLevel(k) && k.subclasses.length > 0
  const asi = !!k && isASILevel(k, newLevel)
  const feats = useMemo(() => (k ? featuresAt(k, needSub ? sub : s.classes.find(x => x.key === cls)?.sub || '', newLevel, r) : []), [k, needSub, sub, s.classes, cls, newLevel, r])
  if (!k) return null
  const avg = avgHitDie(k.hd)
  const hp = firstLevel ? k.hd : hpMode === 'roll' && rolled != null ? rolled : avg
  const options = r.classes.map(x => {
    const has = current.includes(x.key)
    const ok = firstLevel || has || (canMulti && meetsMulticlass(x, sc))
    return { value: x.key, label: x.name + (has ? ` (now ${classLevel(s, x.key)})` : ''), disabled: !ok, hint: ok ? `d${x.hd}` : `needs ${x.mc_prereq.map(any => any.map(([a, n]) => `${a.toUpperCase()} ${n}`).join(' or ')).join(' and ')}` }
  })
  const capped = (a: Ability, add: number) => sc[a] + add > 20
  const done = () => {
    let n = addLevel(s, cls, firstLevel ? 0 : hp, needSub ? sub : undefined)
    if (asi) {
      if (asiKind === 'feat') n = { ...n, feats: feat && feat !== 'custom' ? [...n.feats, feat] : n.feats, asi: [...n.asi, { class: cls, level: newLevel, feat: feat || 'custom' }] }
      else n = { ...n, asi: [...n.asi, { class: cls, level: newLevel, a: a1, b: asiKind === 'two' ? a1 : a2 }] }
    }
    // a new class's level-one hit points come in full, its first level's average otherwise
    if (!firstLevel) n = { ...n, hp: { ...n.hp, cur: Math.min(n.hp.cur, d.hpMax) + Math.max(1, hp + d.mods.con) } }
    else n = { ...n, hp: { ...n.hp, cur: k.hd + d.mods.con } }
    // XP stays as it is; at a milestone table it doesn't matter
    onDone(n)
  }
  const ready = (!needSub || !!sub) && (!asi || asiKind === 'feat' || (asiKind === 'two' ? !capped(a1, 2) : a1 !== a2 && !capped(a1, 1) && !capped(a2, 1)))
  const total = totalLevel(s) + (firstLevel ? 0 : 1)
  return (
    <Modal title={firstLevel ? `${c.name}'s class` : `${c.name} reaches level ${total}`} onClose={onClose} size="lg"
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!ready} onClick={done}><Icon name="trending-up" size={15} />{firstLevel ? 'Take the class' : 'Level up'}</button></>}>
      <div className="levelup">
        <div className="levelup-class" style={{ ['--cls' as string]: CLASS_COLORS[cls] }}>
          <span className="levelup-emblem"><ClassEmblem cls={cls} size={56} /></span>
          <div className="grow">
            <Select value={cls} onChange={v => { setCls(v); setSub(s.classes.find(x => x.key === v)?.sub || ''); setRolled(null) }} options={options} ariaLabel="Class" />
            <p className="muted small">{k.name} {newLevel} · hit die d{k.hd}{current.length && !current.includes(cls) ? ' · multiclassing: you need 13 in the class ability, and so does your current class' : ''}</p>
          </div>
        </div>

        {!firstLevel && <section className="levelup-sec">
          <h4>Hit points</h4>
          <div className="row wrap">
            <Segmented value={hpMode} onChange={setHpMode} options={[{ value: 'average', label: `Average (${avg})` }, { value: 'roll', label: 'Roll' }]} label="Hit points" />
            {hpMode === 'roll' && <button type="button" className="btn sm" onClick={async () => { const x = await roll(`1d${k.hd}`, { label: `${c.name}: hit points for level ${total}`, kind: 'hit_die', character_id: c.id }); if (x) setRolled(x.result.total) }}>
              <Icon name="d20" size={14} />{rolled == null ? `Roll a d${k.hd}` : `Rolled ${rolled} — again`}</button>}
            <span className="muted">+ {d.mods.con} Constitution = <b>{Math.max(1, hp + d.mods.con)}</b> more hit points</span>
          </div>
        </section>}

        {needSub && <section className="levelup-sec">
          <h4>{r.features[k.levels[newLevel - 1]?.features.find(f => f.includes('archetype') || f.includes('path') || f.includes('college') || f.includes('domain') || f.includes('circle') || f.includes('tradition') || f.includes('oath') || f.includes('origin') || f.includes('patron')) || '']?.name || 'Subclass'}</h4>
          <div className="choice-cards">
            {k.subclasses.map(x => (
              <button key={x.key} type="button" className={`choice-card ${sub === x.key ? 'on' : ''}`} onClick={() => setSub(x.key)} aria-pressed={sub === x.key}>
                <b>{x.name}</b><span className="muted small">{x.flavor}</span><span className="small">{x.desc.slice(0, 220)}{x.desc.length > 220 ? '…' : ''}</span>
              </button>
            ))}
          </div>
          <p className="muted small">The open rules (SRD) have one subclass per class; your table may allow others — add their features under Features → Your own.</p>
        </section>}

        {asi && <section className="levelup-sec">
          <h4>Ability score improvement</h4>
          <Segmented value={asiKind} onChange={setAsiKind} options={[{ value: 'two', label: '+2 to one' }, { value: 'split', label: '+1 to two' }, { value: 'feat', label: 'A feat instead' }]} label="Improvement" />
          {asiKind !== 'feat' ? <div className="row wrap">
            <AbilityPick value={a1} onChange={setA1} sc={sc} add={asiKind === 'two' ? 2 : 1} />
            {asiKind === 'split' && <AbilityPick value={a2} onChange={setA2} sc={sc} add={1} />}
            <span className="muted small">A score can't go above 20.</span>
          </div> : <div className="row wrap">
            <Select value={feat} onChange={setFeat} options={[...r.feats.map(f => ({ value: f.key, label: f.name, hint: f.prereq.map(p => `${p.ability.toUpperCase()} ${p.min}`).join(', ') })), { value: 'custom', label: 'Another feat (write it under Features → Your own)' }]} ariaLabel="Feat" placeholder="Choose a feat" />
          </div>}
        </section>}

        <section className="levelup-sec">
          <h4>What this level brings</h4>
          {feats.length === 0 && !asi && <p className="muted">No new features at this level{k.casting ? ' — but check your spell slots and spells known' : ''}.</p>}
          {feats.map(({ key, f }) => <details key={key} className="lu-feature"><summary><b>{f.name}</b>{f.sub ? <span className="muted small"> · {k.subclasses.find(x => x.key === f.sub)?.name}</span> : null}</summary><Markdown text={f.desc} /></details>)}
          {k.casting && <p className="small"><Icon name="wand" size={13} /> {k.name} spells: {(() => { const row = k.levels[newLevel - 1]; const sl = row?.slots || []; return `${row?.cantrips || 0} cantrips${row?.known ? `, ${row.known} spells known` : ''}${sl.some(x => x) ? `, slots ${sl.filter(x => x).join('/')}` : ''}` })()}. Add new spells on the Spells tab.</p>}
        </section>
      </div>
    </Modal>
  )
}

function AbilityPick({ value, onChange, sc, add }: { value: Ability; onChange: (a: Ability) => void; sc: Record<Ability, number>; add: number }) {
  return <Select value={value} onChange={v => onChange(v as Ability)} ariaLabel="Ability" options={ABILITIES.map(a => ({ value: a, label: `${ABILITY_NAMES[a]} ${sc[a]} → ${sc[a] + add}`, disabled: sc[a] + add > 20 }))} />
}
