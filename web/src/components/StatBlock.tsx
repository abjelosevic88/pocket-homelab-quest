// A monster's stat block, laid out the classic way: name in small capitals,
// tapered rules, the six abilities in a row, traits, actions. Attack and
// damage numbers are buttons that roll.
import { useRoll } from '../lib/dice'
import { crText, mod, signed, titleCase } from '../lib/srd'
import type { Monster, MonsterAction } from '../lib/types'
import { CreatureIcon } from './Art'

const AB = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

export function StatBlock({ m, campaignId, compact = false, who }: { m: Monster; campaignId?: number | null; compact?: boolean; who?: string }) {
  const roll = useRoll()
  const name = who || m.name
  const r = (expr: string, label: string, kind: string) => roll(expr.replace(/\s/g, ''), { label: `${name}: ${label}`, kind, campaign_id: campaignId })
  const typeLine = `${m.size} ${m.type}${m.sub ? ` (${m.sub})` : ''}${m.align ? `, ${m.align}` : ''}`
  const ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const saves = Object.entries(m.saves || {}).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([k, v]) => <RollBit key={k} onRoll={() => r(`1d20${signed(v).replace('−', '-')}`, `${k.toUpperCase()} save`, 'save')}>{titleCase(k)} {signed(v)}</RollBit>)
  const skills = Object.entries(m.skills || {}).map(([k, v]) => <RollBit key={k} onRoll={() => r(`1d20${signed(v).replace('−', '-')}`, titleCase(k.replace(/-/g, ' ')), 'check')}>{titleCase(k.replace(/-/g, ' '))} {signed(v)}</RollBit>)
  const join = (els: React.ReactNode[]) => els.flatMap((e, i) => (i ? [', ', e] : [e]))
  return (
    <article className={`statblock ${compact ? 'compact' : ''}`}>
      <header className="stb-head">
        <span className="stb-type-ico" aria-hidden="true"><CreatureIcon type={m.type} size={compact ? 30 : 38} /></span>
        <div className="grow">
          <h2 className="stb-name">{m.name}</h2>
          <div className="stb-typeline">{typeLine}</div>
        </div>
      </header>
      <div className="stb-rule" aria-hidden="true" />
      <dl className="stb-props">
        <div><dt>Armor Class</dt><dd>{m.ac}{m.ac_note ? ` (${m.ac_note})` : ''}</dd></div>
        <div><dt>Hit Points</dt><dd>{m.hp}{m.hd ? <> (<RollBit onRoll={() => r(m.hd!, 'hit points', 'roll')}>{m.hd.replace(/\+/g, ' + ')}</RollBit>)</> : null}</dd></div>
        {m.speed && <div><dt>Speed</dt><dd>{m.speed}</dd></div>}
      </dl>
      <div className="stb-rule" aria-hidden="true" />
      <div className="stb-abil">
        {AB.map((a, i) => {
          const v = m.abil[i] ?? 10
          return <button type="button" key={a} className="stb-ab" onClick={() => r(`1d20${signed(mod(v)).replace('−', '-')}`, `${a} check`, 'check')} title={`Roll a ${a} check`}>
            <span className="stb-ab-k">{a}</span><span className="stb-ab-v">{v} ({signed(mod(v))})</span>
          </button>
        })}
      </div>
      <div className="stb-rule" aria-hidden="true" />
      <dl className="stb-props">
        {saves.length > 0 && <div><dt>Saving Throws</dt><dd>{join(saves)}</dd></div>}
        {skills.length > 0 && <div><dt>Skills</dt><dd>{join(skills)}</dd></div>}
        {!!m.vuln?.length && <div><dt>Damage Vulnerabilities</dt><dd>{m.vuln.join(', ')}</dd></div>}
        {!!m.res?.length && <div><dt>Damage Resistances</dt><dd>{m.res.join('; ')}</dd></div>}
        {!!m.imm?.length && <div><dt>Damage Immunities</dt><dd>{m.imm.join('; ')}</dd></div>}
        {!!m.cimm?.length && <div><dt>Condition Immunities</dt><dd>{m.cimm.join(', ')}</dd></div>}
        {m.senses && <div><dt>Senses</dt><dd>{m.senses}</dd></div>}
        <div><dt>Languages</dt><dd>{m.lang || '—'}</dd></div>
        <div className="stb-cr"><div><dt>Challenge</dt><dd>{crText(m.cr)} ({m.xp.toLocaleString()} XP)</dd></div>{m.pb ? <div><dt>Proficiency Bonus</dt><dd>+{m.pb}</dd></div> : null}</div>
      </dl>
      <div className="stb-rule" aria-hidden="true" />
      {m.traits.map((a, i) => <ActionLine key={i} a={a} roll={r} />)}
      {m.actions.length > 0 && <h3 className="stb-sec">Actions</h3>}
      {m.actions.map((a, i) => <ActionLine key={i} a={a} roll={r} />)}
      {!!m.reactions?.length && <><h3 className="stb-sec">Reactions</h3>{m.reactions.map((a, i) => <ActionLine key={i} a={a} roll={r} />)}</>}
      {!!m.legendary?.length && <><h3 className="stb-sec">Legendary Actions</h3>
        <p className="stb-line stb-legend-intro">{`The ${m.name.toLowerCase()} can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. It regains spent legendary actions at the start of its turn.`}</p>
        {m.legendary.map((a, i) => <ActionLine key={i} a={a} roll={r} />)}</>}
      {m.desc && !compact && <p className="stb-line stb-desc">{m.desc}</p>}
    </article>
  )
}

function RollBit({ children, onRoll }: { children: React.ReactNode; onRoll: () => void }) {
  return <button type="button" className="roll-bit" onClick={onRoll} title="Roll">{children}</button>
}

function ActionLine({ a, roll }: { a: MonsterAction; roll: (expr: string, label: string, kind: string) => void }) {
  const name = a.use ? `${a.name} (${a.use})` : a.name
  // make "+4 to hit" and "(1d6 + 2)" in the text roll
  const parts: React.ReactNode[] = []
  const re = /(\+\d+ to hit|Attack Roll: \+\d+|\(\d+d\d+(?: [+−-] \d+)?\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  const text = a.desc
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const t = m[0]
    if (t.includes('to hit') || t.startsWith('Attack Roll')) {
      const n = Number(/\+(\d+)/.exec(t)![1])
      parts.push(<RollBit key={i++} onRoll={() => roll(`1d20+${n}`, `${a.name} (attack)`, 'attack')}>{t}</RollBit>)
    } else {
      const ex = t.slice(1, -1).replace(/\s/g, '').replace('−', '-')
      parts.push(<span key={i++}>(<RollBit onRoll={() => roll(ex, `${a.name} (damage)`, 'damage')}>{t.slice(1, -1)}</RollBit>)</span>)
    }
    last = m.index + t.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return (
    <p className="stb-line">
      <b className="stb-act">{name}.</b> {parts.map((p, j) => (typeof p === 'string' ? p.split('\n').flatMap((s, k) => (k ? [<br key={`${j}-${k}`} />, s] : [s])) : p))}
    </p>
  )
}
