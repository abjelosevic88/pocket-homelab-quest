// Building a character by the rules, one step at a time: species, class,
// ability scores (standard array, point buy, rolled or typed), background,
// skills and languages, equipment, spells, and who they are.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { announceChange } from '../lib/data'
import { useRoll } from '../lib/dice'
import { columns, compute, expectedResources, newId, newSheet, POINT_BUY, raceTraits, setSpellIndex, STANDARD_ARRAY, subclassSpells, PREPARES, fmtMod } from '../lib/rules'
import { keyName, loadSpells, mod, SCHOOL_COLORS, useLoad, useRules, type Rules } from '../lib/srd'
import type { Ability, Campaign, Character, EquipOption, InvItem, Klass, Sheet, Spell } from '../lib/types'
import { ABILITIES, ABILITY_NAMES } from '../lib/types'
import { useCrumb } from '../components/Layout'
import { ClassEmblem, CLASS_COLORS, Token } from '../components/Art'
import { Markdown } from '../components/Markdown'
import { Icon } from '../components/icons'
import { Field, Loading, Segmented, errMsg, useToast } from '../components/ui'
import { Select } from '../components/Select'

type Step = 'species' | 'class' | 'scores' | 'background' | 'skills' | 'equipment' | 'spells' | 'details'
const STEPS: { id: Step; label: string }[] = [
  { id: 'species', label: 'Species' }, { id: 'class', label: 'Class' }, { id: 'scores', label: 'Ability scores' }, { id: 'background', label: 'Background' },
  { id: 'skills', label: 'Skills' }, { id: 'equipment', label: 'Equipment' }, { id: 'spells', label: 'Spells' }, { id: 'details', label: 'Who they are' },
]
const PRIMARY: Record<string, string> = { barbarian: 'Strength', bard: 'Charisma', cleric: 'Wisdom', druid: 'Wisdom', fighter: 'Strength or Dexterity', monk: 'Dexterity and Wisdom', paladin: 'Strength and Charisma', ranger: 'Dexterity and Wisdom', rogue: 'Dexterity', sorcerer: 'Charisma', warlock: 'Charisma', wizard: 'Intelligence' }
const BLURB: Record<string, string> = {
  barbarian: 'A fierce warrior who fights in a battle rage.', bard: 'A performer whose music and words weave magic.', cleric: 'A priest who wields divine magic for a god.',
  druid: 'A keeper of the old faith, with the power of nature.', fighter: 'A master of weapons, armour and tactics.', monk: 'A martial artist who channels ki.',
  paladin: 'A holy warrior bound by a sacred oath.', ranger: 'A hunter and tracker at home in the wilds.', rogue: 'A scoundrel who uses stealth and trickery.',
  sorcerer: 'A spellcaster with magic in the blood.', warlock: 'A wielder of magic from a pact with a patron.', wizard: 'A scholar of arcane magic.',
}
const SPECIES_BLURB: Record<string, string> = {
  dwarf: 'Bold and hardy, known as skilled warriors, miners, and workers of stone and metal.', elf: 'A magical people of otherworldly grace, living in the world but not entirely part of it.',
  halfling: 'Small, cheerful and lucky: the comforts of home are their goal.', human: 'The most adaptable and ambitious people among the common species.',
  dragonborn: 'Born of dragons, proud and honourable, with a breath weapon of their ancestry.', gnome: 'Energetic, curious tinkerers and enthusiastic inventors.',
  'half-elf': 'Walking in two worlds, with the best of both.', 'half-orc': 'Strong, enduring and fierce; some walk with orcs, some with humans.',
  tiefling: 'Touched by an infernal bloodline that marks their looks and gives them a little magic.',
}

type Method = 'array' | 'buy' | 'roll' | 'manual'

export default function Builder() {
  const rules = useRules()
  const spells = useLoad(loadSpells)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { toast } = useToast()
  const roll = useRoll()
  useCrumb('New character')
  const [step, setStep] = useState<Step>('species')
  const [s, setS] = useState<Sheet>(() => newSheet())
  const [cls, setCls] = useState('')
  const [sub, setSub] = useState('')
  const [method, setMethod] = useState<Method>('array')
  const [assign, setAssign] = useState<Record<Ability, number | null>>({ str: null, dex: null, con: null, int: null, wis: null, cha: null })
  const [pool, setPool] = useState<number[]>(STANDARD_ARRAY)
  const [buy, setBuy] = useState<Record<Ability, number>>({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })
  const [manual, setManual] = useState<Record<Ability, number>>({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })
  const [classSkills, setClassSkills] = useState<string[]>([])
  const [equip, setEquip] = useState<Record<number, number>>({})
  const [anyPick, setAnyPick] = useState<Record<string, string>>({})
  const [gold, setGold] = useState(false)
  const [goldAmount, setGoldAmount] = useState(100)
  const [chosenSpells, setChosenSpells] = useState<string[]>([])
  const [name, setName] = useState('')
  const [player, setPlayer] = useState('')
  const [camps, setCamps] = useState<Campaign[]>([])
  const [camp, setCamp] = useState(params.get('campaign') || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get<{ campaigns: Campaign[] }>(`${V1}/campaigns`).then(r => setCamps(r.campaigns)).catch(() => {}) }, [])
  useEffect(() => { if (spells) setSpellIndex(spells) }, [spells])

  const k = rules?.classBy[cls]
  const race = rules?.raceBy[s.species]
  const base: Record<Ability, number> = method === 'buy' ? buy : method === 'manual' ? manual : Object.fromEntries(ABILITIES.map(a => [a, assign[a] ?? 8])) as Record<Ability, number>
  const sheet: Sheet = useMemo(() => ({ ...s, abilities: base, classes: cls ? [{ key: cls, level: 1, sub, hp: [] }] : [] }), [s, base, cls, sub]) // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => (rules ? compute(sheet, rules) : null), [sheet, rules])
  if (!rules || !d) return <Loading />

  const at = STEPS.findIndex(x => x.id === step)
  const casts = !!k?.casting && (k.casting.level || 1) <= 1
  const steps = STEPS.filter(x => x.id !== 'spells' || casts)
  const go = (dir: number) => { const i = steps.findIndex(x => x.id === step) + dir; if (i >= 0 && i < steps.length) setStep(steps[i].id) }
  const spent = ABILITIES.reduce((n, a) => n + (POINT_BUY[buy[a]] ?? 99), 0)
  const scoresReady = method === 'buy' ? spent <= 27 : method === 'manual' ? true : ABILITIES.every(a => assign[a] != null)
  const ok: Record<Step, boolean> = {
    species: !!race && (!race.subraces.length || !!s.subspecies) && (!race.bonus_choice || s.bonus_choice.length === race.bonus_choice.choose),
    class: !!k && (!needsSubAt1(k) || !!sub),
    scores: scoresReady, background: !!(s.background || s.background_name), skills: !!k && classSkills.length === (k.prof_choices[0]?.n || 0),
    equipment: true, spells: true, details: !!name.trim(),
  }
  const ready = steps.every(x => ok[x.id])

  const create = async () => {
    if (!k) return
    setSaving(true)
    try {
      // the skills: class picks + background + trait picks
      const bg = rules.backgrounds.find(b => b.key === s.background)
      const skills = new Set<string>([...s.skills, ...classSkills.map(x => x.replace(/^skill-/, ''))])
      for (const x of bg?.skills || []) skills.add(x.replace(/^skill-/, ''))
      // the equipment
      const inv: InvItem[] = []
      const addItem = (key: string, n: number) => {
        const e = rules.equipBy[key]
        if (!e) return
        if (e.contents && e.gear === 'equipment-packs') { inv.push({ id: newId(), key, name: e.name, kind: 'gear', qty: 1, w: 0 }); for (const [ck, cn] of e.contents) addItem(ck, cn); return }
        const kind = e.weapon ? 'weapon' : e.armor ? (e.armor.cat === 'shield' ? 'shield' : 'armor') : e.cat === 'tools' ? 'tool' : 'gear'
        const had = inv.find(i => i.key === key && kind !== 'weapon')
        if (had) had.qty += n * (e.qty || 1)
        else inv.push({ id: newId(), key, name: e.name, kind, qty: n * (e.qty || 1), w: e.w, equipped: kind === 'weapon' || kind === 'armor' || kind === 'shield' })
      }
      const coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
      if (gold) coins.gp = goldAmount
      else {
        for (const [key, n] of k.equipment) addItem(key, n)
        k.equip_choices.forEach((ch, i) => {
          const opt = ch.options[equip[i] ?? 0]
          for (const [kind, key, n] of opt || []) {
            if (kind === 'item') addItem(key, n)
            else { const pick = anyPick[`${i}:${key}`]; if (pick) addItem(pick, n) }
          }
        })
      }
      for (const [key, n] of bg?.equipment || []) addItem(key, n)
      for (const cat of bg?.equip_any || []) { const pick = anyPick[`bg:${cat}`]; if (pick) addItem(pick, 1) }
      if (bg) coins.gp += bg.gold
      // only one suit of armour worn
      let wore = false
      for (const it of inv) if (it.kind === 'armor') { it.equipped = !wore; wore = true }
      // spells (+ the high elf's or the tiefling's)
      const spellRefs = chosenSpells.map(key => ({ key, cls, prepared: true }))
      for (const key of subclassSpells(k, sub, 1)) if (!spellRefs.some(x => x.key === key)) spellRefs.push({ key, cls, prepared: true, always: true } as never)
      for (const t of raceTraits(s, rules)) {
        const tr = rules.traits[t]
        if (tr?.spells) for (const key of s.choices[t] || []) spellRefs.push({ key, cls: s.species, prepared: true, always: true } as never)
      }
      if (s.species === 'tiefling') spellRefs.push({ key: 'thaumaturgy', cls: 'tiefling', prepared: true, always: true } as never)
      let full: Sheet = { ...sheet, skills: [...skills], inventory: inv, coins, spells: spellRefs, xp: 0 }
      if (bg && !full.background_name) full.background_name = bg.name
      full = { ...full, resources: expectedResources(full, rules) }
      const dd = compute(full, rules)
      full.hp = { cur: dd.hpMax, temp: 0, bonus: 0 }
      const body = { ...columns(full, dd), name: name.trim(), player: player.trim(), campaign_id: camp ? Number(camp) : null, sheet: full, token: { color: CLASS_COLORS[cls], emblem: cls, frame: 'bronze' } }
      const c = await api.post<Character>(`${V1}/characters`, body)
      announceChange()
      navigate(`/characters/${c.id}`, { replace: true })
    } catch (e) { toast(errMsg(e), 'err'); setSaving(false) }
  }

  return (
    <div className="page builder">
      <div className="builder-head">
        <Token name={name || '?'} color={CLASS_COLORS[cls]} emblem={cls} frame="bronze" size={64} level={1} />
        <div className="grow">
          <h1 className="page-title">{name || 'A new adventurer'}</h1>
          <p className="muted">{[d.speciesName, k?.name, d.backgroundName].filter(Boolean).join(' · ') || 'Start with a species'}</p>
        </div>
        {k && <div className="builder-nums">
          <span><small>HP</small><b>{d.hpMax}</b></span><span><small>AC</small><b>{d.ac}</b></span><span><small>Speed</small><b>{d.speed}</b></span>
        </div>}
      </div>
      <nav className="steps" aria-label="Steps">
        {steps.map((x, i) => (
          <button key={x.id} type="button" className={`step ${x.id === step ? 'on' : ''} ${ok[x.id] ? 'done' : ''}`} onClick={() => setStep(x.id)}>
            <span className="step-n">{ok[x.id] && x.id !== step ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}</span>{x.label}
          </button>
        ))}
      </nav>

      <div className="builder-body">
        {step === 'species' && <SpeciesStep r={rules} s={s} setS={setS} />}
        {step === 'class' && <ClassStep r={rules} cls={cls} setCls={c => { setCls(c); setSub(''); setClassSkills([]); setEquip({}); setChosenSpells([]) }} sub={sub} setSub={setSub} />}
        {step === 'scores' && <div className="step-pane">
          <h2 className="step-h">Ability scores</h2>
          <p className="muted">Six numbers from 3 to 20. {k ? `${k.name}s want a high ${PRIMARY[cls]}.` : ''} Species bonuses come on top.</p>
          <Segmented value={method} onChange={m => { setMethod(m); if (m === 'array') setPool(STANDARD_ARRAY) }} label="Method"
            options={[{ value: 'array', label: 'Standard array' }, { value: 'buy', label: 'Point buy' }, { value: 'roll', label: 'Roll 4d6' }, { value: 'manual', label: 'Type them' }]} />
          {method === 'roll' && <div className="row wrap">
            <button type="button" className="btn" onClick={async () => {
              const out: number[] = []
              for (let i = 0; i < 6; i++) { const x = await roll('4d6kh3', { label: `Ability score ${i + 1}`, quiet: true }); if (x) out.push(x.result.total) }
              setPool(out.sort((a, b) => b - a)); setAssign({ str: null, dex: null, con: null, int: null, wis: null, cha: null })
            }}><Icon name="d20" size={15} />Roll six scores (4d6, drop the lowest)</button>
            {pool !== STANDARD_ARRAY && <span className="muted">Rolled: {pool.join(', ')}</span>}
          </div>}
          {method === 'buy' && <p className={spent > 27 ? 'danger-ink' : 'muted'}>{27 - spent} of 27 points left · scores 8 to 15, a 14 costs 7 and a 15 costs 9.</p>}
          <div className="score-grid">
            {ABILITIES.map(a => {
              const bonus = d.scores[a] - base[a]
              return (
                <div key={a} className="score-card">
                  <span className="score-k">{ABILITY_NAMES[a]}</span>
                  {(method === 'array' || method === 'roll') && <Select value={assign[a] == null ? '' : String(assign[a])} ariaLabel={ABILITY_NAMES[a]} placeholder="—"
                    onChange={v => setAssign(x => ({ ...x, [a]: v === '' ? null : Number(v) }))}
                    options={[{ value: '', label: '—' }, ...[...new Set(pool)].map(v => ({ value: String(v), label: String(v), disabled: pool.filter(p => p === v).length <= ABILITIES.filter(b => b !== a && assign[b] === v).length }))]} />}
                  {method === 'buy' && <span className="stepper">
                    <button type="button" className="btn ghost sm icon-only" disabled={buy[a] <= 8} onClick={() => setBuy(x => ({ ...x, [a]: x[a] - 1 }))} aria-label="Lower"><Icon name="minus" size={13} /></button>
                    <b>{buy[a]}</b>
                    <button type="button" className="btn ghost sm icon-only" disabled={buy[a] >= 15 || spent - (POINT_BUY[buy[a]] || 0) + (POINT_BUY[buy[a] + 1] || 99) > 27} onClick={() => setBuy(x => ({ ...x, [a]: x[a] + 1 }))} aria-label="Raise"><Icon name="plus" size={13} /></button>
                  </span>}
                  {method === 'manual' && <input className="input num" inputMode="numeric" value={manual[a]} onChange={e => setManual(x => ({ ...x, [a]: Math.max(3, Math.min(20, Number(e.target.value) || 3)) }))} aria-label={ABILITY_NAMES[a]} />}
                  <span className="score-total"><b>{d.scores[a]}</b><span className="muted">{fmtMod(mod(d.scores[a]))}</span></span>
                  {bonus > 0 && <span className="score-bonus">+{bonus} {race?.name}</span>}
                </div>
              )
            })}
          </div>
        </div>}
        {step === 'background' && <BackgroundStep r={rules} s={s} setS={setS} />}
        {step === 'skills' && k && <SkillsStep r={rules} k={k} s={s} setS={setS} picked={classSkills} setPicked={setClassSkills} />}
        {step === 'skills' && !k && <p className="muted">Choose a class first.</p>}
        {step === 'equipment' && k && <EquipmentStep r={rules} k={k} s={s} equip={equip} setEquip={setEquip} anyPick={anyPick} setAnyPick={setAnyPick} gold={gold} setGold={setGold} goldAmount={goldAmount} setGoldAmount={setGoldAmount} />}
        {step === 'equipment' && !k && <p className="muted">Choose a class first.</p>}
        {step === 'spells' && k && spells && <SpellsStep k={k} sub={sub} spells={spells} d={d} chosen={chosenSpells} setChosen={setChosenSpells} r={rules} s={s} setS={setS} />}
        {step === 'details' && <div className="step-pane">
          <h2 className="step-h">Who they are</h2>
          <div className="form-grid">
            <Field label="Name"><div className="row"><input className="input grow" value={name} onChange={e => setName(e.target.value)} placeholder="What do they call themselves?" autoFocus />
              <button type="button" className="btn" title="Suggest a name" onClick={async () => { const r2 = await api.get<{ names: string[] }>(`${V1}/names?kind=${s.species || 'human'}&n=1`); setName(r2.names[0] || '') }}><Icon name="shuffle" size={15} /></button></div></Field>
            <Field label="Played by"><input className="input" value={player} onChange={e => setPlayer(e.target.value)} placeholder="Your name, or the player's" /></Field>
            <Field label="Campaign"><Select value={camp} onChange={setCamp} options={[{ value: '', label: 'Not in a campaign yet' }, ...camps.map(c => ({ value: String(c.id), label: c.name }))]} ariaLabel="Campaign" /></Field>
            <Field label="Alignment"><Select value={s.alignment} onChange={v => setS(x => ({ ...x, alignment: v }))} options={[{ value: '', label: 'None' }, ...rules.alignments.map(a => ({ value: a.key, label: a.name }))]} ariaLabel="Alignment" /></Field>
          </div>
          <TraitsPick r={rules} s={s} setS={setS} />
        </div>}
      </div>

      <div className="builder-foot">
        <button type="button" className="btn" onClick={() => go(-1)} disabled={at === 0}><Icon name="chevron-left" size={15} />Back</button>
        <span className="muted small">{steps.filter(x => !ok[x.id]).map(x => x.label).join(', ') ? `Still to do: ${steps.filter(x => !ok[x.id]).map(x => x.label).join(', ')}` : 'Ready'}</span>
        {step !== 'details' ? <button type="button" className="btn primary" onClick={() => go(1)}>Next<Icon name="chevron-right" size={15} /></button>
          : <button type="button" className="btn primary" onClick={create} disabled={!ready || saving}><Icon name="check" size={15} />{saving ? 'Creating…' : 'Create the character'}</button>}
      </div>
    </div>
  )
}

const needsSubAt1 = (k: Klass) => k.subclasses.some(x => x.levels[0]?.level === 1)

function SpeciesStep({ r, s, setS }: { r: Rules; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>> }) {
  const race = r.raceBy[s.species]
  return (
    <div className="step-pane">
      <h2 className="step-h">Species</h2>
      <div className="choice-cards wide">
        {r.races.map(x => {
          const b = Object.entries(x.bonus).map(([a, n]) => `${a.toUpperCase()} +${n}`).join(', ')
          return (
            <button key={x.key} type="button" className={`choice-card ${s.species === x.key ? 'on' : ''}`} onClick={() => setS(y => ({ ...y, species: x.key, subspecies: x.subraces.length === 1 ? x.subraces[0].key : '', bonus_choice: [], choices: {}, langs: ['common'] }))} aria-pressed={s.species === x.key}>
              <b>{x.name}</b><span className="small">{SPECIES_BLURB[x.key]}</span>
              <span className="muted small">{b}{x.bonus_choice ? `, +1 to ${x.bonus_choice.choose} others` : ''} · {x.size} · {x.speed} ft.</span>
            </button>
          )
        })}
      </div>
      {race && <div className="species-detail">
        {race.subraces.length > 0 && <Field label="Subspecies" group><Segmented value={s.subspecies} onChange={v => setS(y => ({ ...y, subspecies: v }))} options={race.subraces.map(x => ({ value: x.key, label: x.name }))} label="Subspecies" /></Field>}
        {race.bonus_choice && <Field label={`+1 to ${race.bonus_choice.choose} abilities`} group>
          <div className="chips">{race.bonus_choice.from.map(a => <button key={a} type="button" className={`chip ${s.bonus_choice.includes(a as Ability) ? 'on' : ''}`}
            onClick={() => setS(y => ({ ...y, bonus_choice: (y.bonus_choice.includes(a as Ability) ? y.bonus_choice.filter(z => z !== a) : [...y.bonus_choice, a as Ability].slice(-race.bonus_choice!.choose)) }))}>{ABILITY_NAMES[a as Ability]}</button>)}</div>
        </Field>}
        <TraitChoices r={r} s={s} setS={setS} />
        <div className="trait-list">
          {raceTraits(s, r).map(t => r.traits[t] && <details key={t}><summary><b>{r.traits[t].name}</b></summary><Markdown text={r.traits[t].desc} /></details>)}
        </div>
        <p className="muted small">{race.age} {race.size_desc}</p>
      </div>}
    </div>
  )
}

/** Choices species traits ask for: a dragon ancestry, a cantrip, two skills, a tool, a language. */
function TraitChoices({ r, s, setS }: { r: Rules; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>> }) {
  const race = r.raceBy[s.species]
  const pick = (t: string, v: string, n: number) => setS(y => {
    const cur = y.choices[t] || []
    return { ...y, choices: { ...y.choices, [t]: cur.includes(v) ? cur.filter(z => z !== v) : [...cur, v].slice(-n) } }
  })
  const extraLangs = (race?.lang_choice?.choose || 0) + raceTraits(s, r).reduce((n, t) => n + (r.traits[t]?.langs || 0), 0)
  return (
    <>
      {raceTraits(s, r).map(t => {
        const tr = r.traits[t]
        if (!tr) return null
        const opts = tr.choose ? tr.choose.map(k => ({ k, name: r.traits[k]?.name.replace(/^.*\((.*)\)$/, '$1') || keyName(k), hint: r.traits[k]?.damage }))
          : tr.spells ? tr.spells.from.map(k => ({ k, name: keyName(k), hint: '' })) : tr.prof_choice ? tr.prof_choice.from.map(k => ({ k, name: r.proficiencies[k]?.name.replace(/^Skill: /, '') || keyName(k), hint: '' })) : null
        if (!opts) return null
        const n = tr.spells?.n || tr.prof_choice?.n || 1
        return (
          <Field key={t} label={`${tr.name}: choose ${n}`} group>
            <div className="chips">{opts.map(o => <button key={o.k} type="button" className={`chip ${(s.choices[t] || []).includes(o.k) ? 'on' : ''}`} onClick={() => pick(t, o.k, n)} title={o.hint}>{o.name}{o.hint ? <span className="muted"> · {o.hint}</span> : null}</button>)}</div>
          </Field>
        )
      })}
      {extraLangs > 0 && <Field label={`Languages: choose ${extraLangs} more`} group>
        <div className="chips">{r.languages.filter(l => !(race?.langs || []).includes(l.key)).map(l => {
          const on = s.langs.includes(l.key)
          return <button key={l.key} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setS(y => {
            const fixed = ['common', ...(race?.langs || [])]
            const extra = y.langs.filter(z => !fixed.includes(z))
            const next = on ? extra.filter(z => z !== l.key) : [...extra, l.key].slice(-extraLangs)
            return { ...y, langs: [...new Set([...fixed, ...next])] }
          })}>{l.name}</button>
        })}</div>
      </Field>}
    </>
  )
}

function ClassStep({ r, cls, setCls, sub, setSub }: { r: Rules; cls: string; setCls: (c: string) => void; sub: string; setSub: (s: string) => void }) {
  const k = r.classBy[cls]
  return (
    <div className="step-pane">
      <h2 className="step-h">Class</h2>
      <div className="class-grid">
        {r.classes.map(x => (
          <button key={x.key} type="button" className={`class-card ${cls === x.key ? 'on' : ''}`} style={{ ['--cls' as string]: CLASS_COLORS[x.key] }} onClick={() => setCls(x.key)} aria-pressed={cls === x.key}>
            <span className="class-emblem"><ClassEmblem cls={x.key} size={44} /></span>
            <b>{x.name}</b>
            <span className="small">{BLURB[x.key]}</span>
            <span className="muted small">d{x.hd} · {PRIMARY[x.key]} · saves {x.saves.map(a => a.toUpperCase()).join(', ')}</span>
          </button>
        ))}
      </div>
      {k && needsSubAt1(k) && <Field label={`${k.subclasses[0]?.flavor || 'Subclass'} (chosen at level 1)`} group>
        <div className="choice-cards">{k.subclasses.map(x => <button key={x.key} type="button" className={`choice-card ${sub === x.key ? 'on' : ''}`} onClick={() => setSub(x.key)}><b>{x.name}</b><span className="small">{x.desc.slice(0, 200)}…</span></button>)}</div>
      </Field>}
      {k && <div className="class-detail">
        <p><b>Proficiencies.</b> {k.profs.map(p => r.proficiencies[p]?.name || keyName(p)).join(', ')}.</p>
        <p><b>Level 1.</b> {k.levels[0]?.features.map(f => r.features[f]?.name).filter(Boolean).join(', ')}.</p>
        {k.casting && <p><b>Spellcasting.</b> {ABILITY_NAMES[k.casting.ability]}{k.casting.level > 1 ? `, from level ${k.casting.level}` : ''}.</p>}
      </div>}
    </div>
  )
}

function BackgroundStep({ r, s, setS }: { r: Rules; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>> }) {
  const custom = !s.background
  return (
    <div className="step-pane">
      <h2 className="step-h">Background</h2>
      <p className="muted">Where your character comes from. The open rules have the Acolyte; for anything else (a soldier, an urchin, a sage) write your own: pick two skills on the next step.</p>
      <div className="choice-cards">
        {r.backgrounds.map(b => (
          <button key={b.key} type="button" className={`choice-card ${s.background === b.key ? 'on' : ''}`} onClick={() => setS(y => ({ ...y, background: b.key, background_name: '' }))}>
            <b>{b.name}</b><span className="small">Skills: {b.skills.map(x => keyName(x.replace(/^skill-/, ''))).join(', ')} · {b.langs} languages · {b.gold} gp</span><span className="muted small">{b.feature.name}</span>
          </button>
        ))}
        <button type="button" className={`choice-card ${custom ? 'on' : ''}`} onClick={() => setS(y => ({ ...y, background: '' }))}><b>Your own</b><span className="small">Name it; choose two skills, and two languages or tools.</span></button>
      </div>
      {custom && <Field label="Background name"><input className="input" value={s.background_name || ''} onChange={e => setS(y => ({ ...y, background_name: e.target.value }))} placeholder="Soldier, Urchin, Sage, Noble, Folk Hero…" /></Field>}
      {s.background && (() => { const b = r.backgrounds.find(x => x.key === s.background)!; return <div className="bg-detail"><h4>{b.feature.name}</h4><Markdown text={b.feature.desc} /></div> })()}
    </div>
  )
}

function SkillsStep({ r, k, s, setS, picked, setPicked }: { r: Rules; k: Klass; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>>; picked: string[]; setPicked: (p: string[]) => void }) {
  const ch = k.prof_choices[0]
  const bg = r.backgrounds.find(b => b.key === s.background)
  const fromBg = (bg?.skills || []).map(x => x.replace(/^skill-/, ''))
  const fromTraits = raceTraits(s, r).flatMap(t => [...(r.traits[t]?.profs || []), ...(r.traits[t]?.prof_choice ? s.choices[t] || [] : [])]).filter(x => x.startsWith('skill-')).map(x => x.replace(/^skill-/, ''))
  const fixed = new Set([...fromBg, ...fromTraits])
  const custom = !s.background
  return (
    <div className="step-pane">
      <h2 className="step-h">Skills</h2>
      {ch && <Field label={`${k.name}: choose ${ch.n}`} group>
        <div className="chips">{ch.from.filter(x => x.startsWith('skill-')).map(x => {
          const key = x.replace(/^skill-/, '')
          const on = picked.includes(x)
          return <button key={x} type="button" className={`chip ${on ? 'on' : ''}`} disabled={fixed.has(key)} title={fixed.has(key) ? 'You have it already' : ''}
            onClick={() => setPicked(on ? picked.filter(y => y !== x) : [...picked, x].slice(-ch.n))}>{r.skillBy[key]?.name || keyName(key)}</button>
        })}</div>
      </Field>}
      {k.prof_choices.slice(1).map((pc, i) => <p key={i} className="muted small">{pc.desc} — add these on the sheet under Edit → Proficiencies.</p>)}
      {custom && <Field label="Your background: two skills" group>
        <div className="chips">{r.skills.map(sk => {
          const key = sk.key.replace(/^skill-/, '')
          const on = s.skills.includes(key)
          return <button key={key} type="button" className={`chip ${on ? 'on' : ''}`} disabled={picked.includes('skill-' + key) || fixed.has(key)}
            onClick={() => setS(y => ({ ...y, skills: on ? y.skills.filter(z => z !== key) : [...y.skills, key].slice(-2) }))}>{sk.name}</button>
        })}</div>
      </Field>}
      {fixed.size > 0 && <p className="muted">Already proficient: {[...fixed].map(x => r.skillBy[x]?.name || keyName(x)).join(', ')}.</p>}
      {k.key === 'rogue' && <Field label="Expertise: two of your skills (or thieves' tools) count double" group>
        <div className="chips">{[...new Set([...picked.map(x => x.replace(/^skill-/, '')), ...fixed, ...s.skills])].map(key => {
          const on = s.expertise.includes(key)
          return <button key={key} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setS(y => ({ ...y, expertise: on ? y.expertise.filter(z => z !== key) : [...y.expertise, key].slice(-2) }))}>{r.skillBy[key]?.name || keyName(key)}</button>
        })}</div>
      </Field>}
      {bg && bg.langs > 0 && <Field label={`${bg.name}: ${bg.langs} languages`} group>
        <div className="chips">{r.languages.filter(l => l.key !== 'common').map(l => {
          const on = s.langs.includes(l.key)
          return <button key={l.key} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setS(y => ({ ...y, langs: on ? y.langs.filter(z => z !== l.key) : [...y.langs, l.key] }))}>{l.name}</button>
        })}</div>
      </Field>}
    </div>
  )
}

function EquipmentStep({ r, k, s, equip, setEquip, anyPick, setAnyPick, gold, setGold, goldAmount, setGoldAmount }: {
  r: Rules; k: Klass; s: Sheet; equip: Record<number, number>; setEquip: (e: Record<number, number>) => void; anyPick: Record<string, string>; setAnyPick: (e: Record<string, string>) => void
  gold: boolean; setGold: (b: boolean) => void; goldAmount: number; setGoldAmount: (n: number) => void
}) {
  const bg = r.backgrounds.find(b => b.key === s.background)
  const label = (opt: EquipOption) => opt.map(([kind, key, n]) => kind === 'item' ? `${n > 1 ? n + ' × ' : ''}${r.equipBy[key]?.name || keyName(key)}` : `${n > 1 ? n + ' × ' : ''}any ${(r.equip_cats[key]?.name || 'item').toLowerCase().replace(/s$/, '')}`).join(', ')
  const catPick = (id: string, cat: string) => {
    const items = (r.equip_cats[cat]?.items || []).filter(x => r.equipBy[x])
    return <Select key={id} value={anyPick[id] || ''} onChange={v => setAnyPick({ ...anyPick, [id]: v })} options={items.map(x => ({ value: x, label: r.equipBy[x].name, hint: r.equipBy[x].weapon ? `${r.equipBy[x].weapon!.dmg} ${r.equipBy[x].weapon!.type}` : '' }))} ariaLabel={r.equip_cats[cat]?.name || 'Item'} placeholder={`Choose: ${r.equip_cats[cat]?.name || cat}`} />
  }
  return (
    <div className="step-pane">
      <h2 className="step-h">Equipment</h2>
      <Segmented value={gold ? 'gold' : 'kit'} onChange={v => setGold(v === 'gold')} options={[{ value: 'kit', label: `The ${k.name}'s equipment` }, { value: 'gold', label: 'Buy my own with gold' }]} label="Equipment" />
      {gold ? <Field label="Gold to start with" help="Your table decides how much; you then add what you buy on the Inventory tab."><input className="input num" inputMode="numeric" value={goldAmount} onChange={e => setGoldAmount(Math.max(0, Number(e.target.value) || 0))} style={{ maxWidth: 140 }} /></Field> : <>
        {k.equipment.length > 0 && <p><b>You get:</b> {k.equipment.map(([key, n]) => `${n > 1 ? n + ' × ' : ''}${r.equipBy[key]?.name || keyName(key)}`).join(', ')}.</p>}
        {k.equip_choices.map((ch, i) => (
          <div key={i} className="equip-choice">
            <div className="muted small">{ch.desc}</div>
            <div className="choice-cards tight">{ch.options.map((opt, j) => (
              <button key={j} type="button" className={`choice-card ${(equip[i] ?? 0) === j ? 'on' : ''}`} onClick={() => setEquip({ ...equip, [i]: j })}>{label(opt)}</button>
            ))}</div>
            {(ch.options[equip[i] ?? 0] || []).filter(([kind, key]) => kind === 'any' && key).map(([, key]) => catPick(`${i}:${key}`, key))}
          </div>
        ))}
      </>}
      {bg && <div className="equip-choice"><div className="muted small">From your background ({bg.name}): {bg.equipment.map(([key, n]) => `${n > 1 ? n + ' × ' : ''}${r.equipBy[key]?.name || keyName(key)}`).join(', ')}, {bg.gold} gp</div>
        {bg.equip_any.map(cat => catPick(`bg:${cat}`, cat))}</div>}
    </div>
  )
}

function SpellsStep({ k, sub, spells, d, chosen, setChosen, r, s, setS }: { k: Klass; sub: string; spells: Spell[]; d: ReturnType<typeof compute>; chosen: string[]; setChosen: (c: string[]) => void; r: Rules; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>> }) {
  const row = k.levels[0]
  const c = d.casting.find(x => x.cls === k.key)
  const cantrips = row?.cantrips || 0
  const wizard = k.key === 'wizard'
  const prepares = PREPARES.includes(k.key)
  const level1 = wizard ? 6 : prepares ? (c?.prepared || 1) : row?.known || 0
  const always = subclassSpells(k, sub, 1)
  const list = spells.filter(sp => sp.classes.includes(k.key) && sp.level <= 1)
  const nC = chosen.filter(x => spells.find(sp => sp.key === x)?.level === 0).length
  const n1 = chosen.filter(x => spells.find(sp => sp.key === x)?.level === 1).length
  const toggle = (sp: Spell) => {
    const on = chosen.includes(sp.key)
    if (on) setChosen(chosen.filter(x => x !== sp.key))
    else if (sp.level === 0 ? nC < cantrips : n1 < level1) setChosen([...chosen, sp.key])
  }
  void r; void s; void setS
  return (
    <div className="step-pane">
      <h2 className="step-h">Spells</h2>
      <p className="muted">{cantrips ? `${cantrips} cantrips (${nC} chosen). ` : ''}{wizard ? `Six 1st-level spells for your spellbook (${n1}); you prepare ${c?.prepared} of them each day.` : prepares ? `You can prepare ${level1} 1st-level spells each day (${n1} chosen) — change them after any long rest.` : level1 ? `${level1} 1st-level spells known (${n1} chosen).` : ''}{always.length ? ` Always prepared: ${always.map(keyName).join(', ')}.` : ''}</p>
      {[0, 1].map(lv => (lv === 0 && !cantrips) || (lv === 1 && !level1) ? null : (
        <section key={lv}>
          <h3 className="group-h">{lv === 0 ? 'Cantrips' : '1st level'}</h3>
          <div className="spell-pick">{list.filter(sp => sp.level === lv && !always.includes(sp.key)).map(sp => (
            <button key={sp.key} type="button" className={`spell-chip ${chosen.includes(sp.key) ? 'on' : ''}`} onClick={() => toggle(sp)} title={`${sp.school} · ${sp.time} · ${sp.range}`}>
              <span className="school-dot" style={{ background: SCHOOL_COLORS[sp.school] }} />{sp.name}{sp.conc && <span className="badge">C</span>}{sp.ritual && <span className="badge">R</span>}
            </button>
          ))}</div>
        </section>
      ))}
    </div>
  )
}

function TraitsPick({ r, s, setS }: { r: Rules; s: Sheet; setS: React.Dispatch<React.SetStateAction<Sheet>> }) {
  const bg = r.backgrounds.find(b => b.key === s.background)
  const pick = (l: string[]) => l[Math.floor(Math.random() * l.length)] || ''
  const field = (k: keyof Sheet['traits'], label: string, from: string[]) => (
    <Field label={<span className="row">{label}{from.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setS(y => ({ ...y, traits: { ...y.traits, [k]: pick(from) } }))}><Icon name="shuffle" size={13} />Suggest</button>}</span>} group>
      <textarea className="input" rows={2} value={s.traits[k] || ''} onChange={e => setS(y => ({ ...y, traits: { ...y.traits, [k]: e.target.value } }))} />
    </Field>
  )
  return (
    <div className="form-grid">
      {field('personality', 'Personality', bg?.traits || [])}
      {field('ideals', 'Ideals', bg?.ideals || [])}
      {field('bonds', 'Bonds', bg?.bonds || [])}
      {field('flaws', 'Flaws', bg?.flaws || [])}
      <Field label="Appearance" group><textarea className="input" rows={2} value={s.bio.appearance || ''} onChange={e => setS(y => ({ ...y, bio: { ...y.bio, appearance: e.target.value } }))} /></Field>
      <Field label="Backstory" group help="A few lines; on the sheet's Story tab the AI can write it out."><textarea className="input" rows={3} value={s.bio.backstory || ''} onChange={e => setS(y => ({ ...y, bio: { ...y.bio, backstory: e.target.value } }))} /></Field>
    </div>
  )
}
