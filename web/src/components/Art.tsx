// Pocket Quest artwork: original heraldic glyphs, polyhedral dice, tokens, crests and a wax seal.
// Pure inline SVG, drawn in currentColor where it is a glyph. Every gradient/mask id is per instance.
import { useId, type JSX, type ReactNode } from 'react'

// ---------------------------------------------------------------- helpers

const T = 0.46 // tonal layer opacity
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'

function useUid(): string {
  return 'qa' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

/** circle as a sub-path (for even-odd cut-outs) */
function ring(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
}

/** star polygon path: n points, outer/inner radius, rotation in degrees (0 = first point up) */
function star(cx: number, cy: number, n: number, r1: number, r2: number, rot = 0): string {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2
    const a = ((rot + (i * 180) / n) - 90) * Math.PI / 180
    d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2)
  }
  return d + 'Z'
}

function poly(pts: number[][]): string {
  return 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z'
}

/** knock a gap out of `children` along the shapes in `cut` (drawn as thick black strokes in a mask) */
function Knock({ id, cut, w = 4, children }: { id: string; cut: ReactNode; w?: number; children: ReactNode }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">
        <rect x="-50" y="-50" width="200" height="200" fill="#fff" />
        <g fill="#000" stroke="#000" strokeWidth={w} strokeLinejoin="round" strokeLinecap="round">{cut}</g>
      </mask>
      <g mask={`url(#${id})`}>{children}</g>
    </>
  )
}

/** mirror a group around the vertical centre line of a box of width w */
function Mirror({ w, children }: { w: number; children: ReactNode }) {
  return <g transform={`translate(${w} 0) scale(-1 1)`}>{children}</g>
}

function parseHex(c: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(x => x + x).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
/** mix a hex colour toward white (amt > 0) or black (amt < 0); non-hex colours pass through */
function shade(c: string, amt: number): string {
  const rgb = parseHex(c)
  if (!rgb) return c
  const t = amt < 0 ? 0 : 255
  const k = Math.abs(amt)
  const out = rgb.map(v => Math.round(v + (t - v) * k))
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = Array.from(parts[0])[0] || ''
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : Array.from(parts[0])[1] || ''
  return (first + (parts.length > 1 ? last : (last || ''))).toUpperCase().slice(0, 2)
}

// ---------------------------------------------------------------- classes

export const CLASS_KEYS: string[] = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']

export const CLASS_COLORS: Record<string, string> = {
  barbarian: '#b4532a',
  bard: '#c0476f',
  cleric: '#c39228',
  druid: '#4f8a3a',
  fighter: '#64758a',
  monk: '#2a8f84',
  paladin: '#2f5db0',
  ranger: '#2e6a4d',
  rogue: '#5a4561',
  sorcerer: '#cf3b2c',
  warlock: '#7b3fb0',
  wizard: '#4146a6',
}

/** the 64×64 class glyph as a group (currentColor); uid makes the internal mask ids unique */
function ClassGlyph({ cls, uid }: { cls: string; uid: string }): JSX.Element {
  switch (cls) {
    case 'barbarian': {
      const blade = (
        <>
          <path d="M36 15.5C40.5 14.5 43.5 11.5 46 8C51.5 11.8 54 16 54 20C54 24 51.5 28.2 46 32C43.5 28.5 40.5 25.5 36 24.5Z" />
          <path d="M47.3 4.6C54.6 9.2 58.2 15 58.2 20C58.2 25 54.6 30.8 47.3 35.4L47.7 32.9C53.4 29 55.8 24.4 55.8 20C55.8 15.6 53.4 11 47.7 7.1Z" />
        </>
      )
      return (
        <g transform="rotate(-32 32 32) translate(0 1) scale(1) ">
          <g transform="translate(32 32) scale(.94) translate(-32 -32)">
            <rect x="29.6" y="7" width="4.8" height="50" rx="2.4" fillOpacity={T} />
            <path d="M32 1.5L35 9.5H29Z" />
            <rect x="27.8" y="12.5" width="8.4" height="15" rx="2.2" />
            <rect x="28.4" y="39" width="7.2" height="2.8" rx="1.2" />
            <rect x="28.4" y="44" width="7.2" height="2.8" rx="1.2" />
            <rect x="28.4" y="49" width="7.2" height="2.8" rx="1.2" />
            <circle cx="32" cy="58" r="3.6" />
            {blade}
            <Mirror w={64}>{blade}</Mirror>
          </g>
        </g>
      )
    }
    case 'bard':
      return (
        <g transform="rotate(32 32 32) translate(32 32.5) scale(1.02) translate(-32 -32)">
          <rect x="29" y="5" width="6" height="22" rx="1.2" fillOpacity={T} />
          <path d="M28.6 8.5L35.4 8.5L41.5 2.8L38.6 0.2L33.6 4.2H28.6Z" />
          <circle cx="37.6" cy="7.6" r="1.6" />
          <circle cx="41" cy="5" r="1.6" />
          <path fillRule="evenodd" d={'M32 22.5C42.6 22.5 48.5 32 48.5 42.5C48.5 52.4 41.4 60 32 60C22.6 60 15.5 52.4 15.5 42.5C15.5 32 21.4 22.5 32 22.5Z' + ring(32, 39.5, 6) + 'M25.5 50h13v2.6h-13Z'} />
          <circle cx="32" cy="39.5" r="2.6" />
        </g>
      )
    case 'cleric':
      return (
        <g>
          <path d={star(32, 22, 8, 13.5, 6, 22.5)} fillOpacity={T} />
          <path fillRule="evenodd" d={star(32, 22, 8, 20.5, 7.5) + ring(32, 22, 7.6) + ring(32, 22, 5.4)} />
          <circle cx="32" cy="22" r="3" />
          <rect x="26.5" y="35" width="11" height="4.4" rx="2" />
          <path fillRule="evenodd" d="M29.4 39H34.6V55H29.4ZM29.4 43.2h5.2v1.6h-5.2ZM29.4 47.4h5.2v1.6h-5.2Z" />
          <circle cx="32" cy="58.2" r="3.8" />
        </g>
      )
    case 'druid': {
      const leaf = 'M30 4C34 4 38 7 38 11C38 13.5 36 14.5 35.5 16C40 15 45 17 45 22C45 26 41 26 39.5 28C44 28 48 31 47 36C46 40 41 39 38.5 41C41 43 41 47 37 48C34 48.5 32 48 31.4 49L28.6 49C28 48 26 48.5 23 48C19 47 19 43 21.5 41C19 39 14 40 13 36C12 31 16 28 20.5 28C19 26 15 26 15 22C15 17 20 15 24.5 16C24 14.5 22 13.5 22 11C22 7 26 4 30 4Z'
      const acorn = (
        <>
          <path d="M41.5 48.5C41.5 55 44 59.5 47.5 60.5C51 59.5 53.5 55 53.5 48.5Z" fillOpacity={T} />
          <path d="M39.6 49.6C39.6 44.4 43.2 41.6 47.5 41.6C51.8 41.6 55.4 44.4 55.4 49.6Z" />
          <rect x="46.6" y="37.4" width="2.2" height="5" rx="1" transform="rotate(18 47.7 40)" />
        </>
      )
      return (
        <g>
          <Knock id={uid + 'd'} w={3.4} cut={<path d="M39.6 49.6C39.6 44.4 43.2 41.6 47.5 41.6C51.8 41.6 55.4 44.4 55.4 49.6C53.5 55 51 59.5 47.5 60.5C44 59.5 41.5 55 39.6 49.6Z" />}>
            <g transform="translate(-3 -1) rotate(-28 30 32)">
              <Knock id={uid + 'v'} w={1.7} cut={<path fill="none" d="M30 11V50M30 21L38.5 17M30 30L42 26M30 39L41 37M30 21L21.5 17M30 30L18 26M30 39L19 37" />}>
                <path d={leaf} />
              </Knock>
              <path d="M28.7 48h2.6l.6 10.5c0 1-1 1.6-1.9 1.6s-1.9-.6-1.9-1.6Z" />
            </g>
          </Knock>
          {acorn}
        </g>
      )
    }
    case 'fighter': {
      const sword = (
        <g transform="rotate(42 32 32)">
          <path fillRule="evenodd" d="M32 1L35.8 7.5V44H28.2V7.5ZM31.2 10H32.8V40H31.2Z" />
          <path d="M20 44.2C20 42.6 21.4 42 23 42.4L32 44L41 42.4C42.6 42 44 42.6 44 44.2C44 45.8 42.6 46.6 41 46.4L32 46.6L23 46.4C21.4 46.6 20 45.8 20 44.2Z" />
          <rect x="29.9" y="46.4" width="4.2" height="9.6" rx="1.4" />
          <circle cx="32" cy="59" r="3.4" />
        </g>
      )
      return (
        <g>
          <Knock id={uid + 'f'} w={4.4} cut={sword}>
            <path fillRule="evenodd" d={ring(32, 33, 23) + ring(32, 33, 19)} />
            <circle cx="32" cy="33" r="19" fillOpacity={T} />
            <circle cx="32" cy="33" r="6.5" />
          </Knock>
          {sword}
        </g>
      )
    }
    case 'monk': {
      const hand = (
        <g>
          <rect x="19.2" y="15" width="5.8" height="24" rx="2.9" />
          <rect x="25.8" y="10" width="6" height="28" rx="3" />
          <rect x="32.6" y="11.5" width="5.8" height="26" rx="2.9" />
          <rect x="39.2" y="17.5" width="5.4" height="21" rx="2.7" />
          <path d="M20.5 47C17 43.5 13.6 39 11.2 34.2C10.2 32 12.4 29.6 14.6 31L22 36.6Z" />
          <path fillRule="evenodd" d={'M19.2 32H44.6V45C44.6 53 39.4 58.5 32 58.5C24.4 58.5 19.2 53 19.2 45Z' + ring(32, 45, 4.6)} />
          <circle cx="32" cy="45" r="2" />
        </g>
      )
      return (
        <g>
          <Knock id={uid + 'm'} w={4} cut={hand}>
            <path fillRule="evenodd" d={ring(32, 31, 27) + ring(32, 31, 23.4)} fillOpacity={T} />
          </Knock>
          {hand}
        </g>
      )
    }
    case 'paladin': {
      const shield = 'M19 9H45V30C45 43 39.5 52 32 58C24.5 52 19 43 19 30Z'
      const wing = <path d="M18 16C13.5 10.5 8 7.4 1.4 6.4C2.2 11.6 4.6 15 8 17.4C5 19 3.2 21.6 2.6 25C7 26.4 11 26.4 14.4 25.6C12.4 28 11.2 31 11.2 34.4C14.4 34.6 16.8 33.6 18.6 32Z" fillOpacity={T} />
      return (
        <g>
          <Knock id={uid + 'p'} w={3.2} cut={<path d={shield} />}>
            {wing}
            <Mirror w={64}>{wing}</Mirror>
          </Knock>
          <Knock id={uid + 'q'} w={1.6} cut={<path fill="none" d="M22.6 12.6H41.4V30C41.4 41 37 48.6 32 53.4C27 48.6 22.6 41 22.6 30Z" />}>
            <path fillRule="evenodd" d={shield + star(32, 30, 4, 12.5, 3.6)} />
          </Knock>
          <path d={star(32, 30, 4, 7.4, 2.6, 45)} fillOpacity={T} />
        </g>
      )
    }
    case 'ranger':
      return (
        <g transform="rotate(-45 32 32) translate(32 32) scale(.95) translate(-32 -32)">
          <rect x="23.6" y="4.4" width="2.2" height="55.2" rx="1.1" fillOpacity={T} />
          <path d="M23 2C10 15 10 49 23 62L27 59C15.6 47 15.6 17 27 5Z" />
          <rect x="11.4" y="25.6" width="8.4" height="12.8" rx="2.6" />
          <rect x="24.4" y="30.3" width="29.6" height="3.4" rx="1.2" />
          <path d="M51 25L62.6 32L51 39L53.8 32Z" />
          <path d="M26.6 30.3H35.2L39.8 24H31.4Z" fillOpacity={T} />
          <path d="M26.6 33.7H35.2L39.8 40H31.4Z" fillOpacity={T} />
        </g>
      )
    case 'rogue': {
      const dagger = (rot: number) => (
        <g transform={`translate(32 47) rotate(${rot})`}>
          <path d="M0 -34L3.2 -27V-1H-3.2V-27Z" />
          <rect x="-8" y="-1.4" width="16" height="4" rx="2" />
          <rect x="-1.9" y="2.4" width="3.8" height="8.6" rx="1.3" />
          <circle cx="0" cy="13.6" r="3" />
        </g>
      )
      const daggers = <>{dagger(-50)}{dagger(50)}</>
      const hood = 'M32 3C40.6 7.4 47 17 47 30C47 41.6 41 49.4 32 53.4C23 49.4 17 41.6 17 30C17 17 23.4 7.4 32 3Z'
      return (
        <g>
          <Knock id={uid + 'r'} w={4.6} cut={daggers}>
            <path fillRule="evenodd" d={hood + 'M32 16C38.4 16 42 22.6 42 29.6C42 37 37.6 43 32 45.6C26.4 43 22 37 22 29.6C22 22.6 25.6 16 32 16Z'} />
            <path fillRule="evenodd" d="M21.6 25.4C26 23.6 38 23.6 42.4 25.4L42 32.4C38.4 34.2 35 33.2 32 31.2C29 33.2 25.6 34.2 22 32.4ZM24.4 27.2L29.6 28.4L28.4 30.4L24.8 29.6ZM39.6 27.2L34.4 28.4L35.6 30.4L39.2 29.6Z" />
          </Knock>
          {daggers}
        </g>
      )
    }
    case 'sorcerer':
      return (
        <g>
          <path d="M32 2C35 10 41 13 45 20C46 15 45.5 12 44.4 8.6C51.4 15 55.4 25 54.6 35.4C53.6 49 44.4 59 32 60.6C19.6 59 10.6 49 9.8 37C9.4 29 12.6 22 17.4 16.6C17.2 21.6 18.6 25 21 27.2C20.4 18.4 25 10 32 2Z" fillOpacity={T} />
          <path fillRule="evenodd" d="M32 13.5C35.2 20 41.6 24 43.6 32.4C45.8 42.4 40.6 52.4 32 54.6C23.4 52.4 18.4 44.4 20.2 35.2C21.2 30 24 27 26.4 24.6C26.8 28 28 30.4 29.6 31.6C28.4 25.4 29.4 19.4 32 13.5ZM24.2 40.2C27.4 35.6 36.6 35.6 39.8 40.2C36.6 44.8 27.4 44.8 24.2 40.2Z" />
          <path d="M32 35.8C33.5 38 33.5 42.4 32 44.6C30.5 42.4 30.5 38 32 35.8Z" />
        </g>
      )
    case 'warlock': {
      const horn = <path d="M18.4 30.6C11.6 25.6 7.6 16.4 9.8 3.6C12.8 12 18.6 17.2 26.4 20.6Z" />
      return (
        <g>
          {horn}
          <Mirror w={64}>{horn}</Mirror>
          <path fillRule="evenodd" d={ring(32, 37, 17.5) + ring(32, 37, 13)} />
          <path fillRule="evenodd" d={'M20.6 37C24.6 30.6 39.4 30.6 43.4 37C39.4 43.4 24.6 43.4 20.6 37Z' + ring(32, 37, 4.6)} />
          <path d="M32 33.4C33.3 35 33.3 39 32 40.6C30.7 39 30.7 35 32 33.4Z" />
          <path d="M27 55.4H37L32 62.6Z" fillOpacity={T} />
          <path d="M6.5 37L11 34.6L11 39.4Z M57.5 37L53 34.6L53 39.4Z" fillOpacity={T} />
        </g>
      )
    }
    case 'wizard':
      return (
        <g>
          <path fillRule="evenodd" d={'M17.5 44C22 35 26 24 29 15C31 9 35.4 5.4 44.6 3.6C40.4 8 38.6 13 38.8 19.4C40.6 28 44 36 46.5 44Z' + star(31, 29, 4, 5.6, 1.7) + star(36.6, 16.4, 4, 3.4, 1.1) + star(25, 38.4, 4, 2.6, 0.9)} />
          <path d="M16.4 40.6H47.6V44.4H16.4Z" fillOpacity={T} />
          <ellipse cx="32" cy="46.6" rx="26" ry="5.2" />
          <rect x="12" y="53.4" width="40" height="3" rx="1.2" />
          <rect x="14" y="56.2" width="36" height="2.6" fillOpacity={T} />
          <rect x="12" y="58.4" width="40" height="3" rx="1.2" />
          <rect x="47" y="51" width="3.2" height="4" fillOpacity={T} />
        </g>
      )
    default:
      return <D20Glyph uid={uid} />
  }
}

function D20Glyph({ uid }: { uid: string }) {
  return (
    <Knock id={uid + 'x'} w={2.6} cut={<path fill="none" d="M32 15L13 46L51 46Z M32 4V15 M8.6 18.5L13 46 M55.4 18.5L51 46 M8.6 18.5L32 15L55.4 18.5 M13 46L32 60 M51 46L32 60" />}>
      <path d="M32 3L56.2 17V47L32 61L7.8 47V17Z" />
    </Knock>
  )
}

export function ClassEmblem({ cls, size = 64, className, title }: { cls: string; size?: number; className?: string; title?: string }): JSX.Element {
  const uid = useUid()
  return (
    <svg className={'art-glyph art-class' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 64 64" fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <ClassGlyph cls={(cls || '').toLowerCase()} uid={uid} />
    </svg>
  )
}

// ---------------------------------------------------------------- creatures

export const CREATURE_TYPES: string[] = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead']

const DRAGON_HEAD = 'M6.5 44C6 36 7.4 28 11.6 21.4C13 19 14.6 17 16.6 15.4C12.6 11 7.4 8.4 2.6 8.2C8.6 5.6 15.4 7 20.6 11C25.6 9.8 30.4 10.4 33.6 12.2L43.6 16.4C46 17.4 46.8 20.4 45 22.2L31.8 25.4L42 30.6C43 32.2 41.6 34 39.6 33.8L27.4 32.6C23.6 35.2 21.4 39.6 21 44Z'
const DRAGON_EYE = 'M22.6 16.6C25 15 28.6 15.2 30.6 17C28 18.8 24.8 18.8 22.6 16.6Z'
function DragonHead() {
  return (
    <g>
      <g fillOpacity={T}>
        <path d="M7.4 37L1.6 35.4L7 31.6Z" />
        <path d="M8.8 28.6L3 25.4L10 24Z" />
        <path d="M12.4 20.8L7.6 16.4L14.6 17.4Z" />
        <path d="M23.4 29.6L13.6 31.2L21.6 35.6Z" />
      </g>
      <path fillRule="evenodd" d={DRAGON_HEAD + DRAGON_EYE} />
      <path d="M40.6 23L40 26.4L38.2 23.6Z M35.8 24.2L35.2 27.2L33.6 24.6Z M36.6 30.6L37.6 27.8L38.8 31Z" />
    </g>
  )
}

function CreatureGlyph({ type, uid }: { type: string; uid: string }): JSX.Element {
  const t = type.toLowerCase()
  const key = CREATURE_TYPES.find(k => t.includes(k)) || 'beast'
  switch (key) {
    case 'aberration':
      return (
        <g>
          <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
            <path d="M14.6 26C11.6 32 6 32 5 38.6" strokeOpacity={T} />
            <path d="M19.6 29C18.8 36 14 39 15 44.4" />
            <path d="M24 30.4C24 37 27.2 40 24 45" />
            <path d="M28.4 29C29.6 36 34.6 38.6 33 44" />
            <path d="M33.4 26C36.4 32 42 32 43 38.6" strokeOpacity={T} />
          </g>
          <path fillRule="evenodd" d={ring(24, 18, 14) + ring(24, 18, 7.6)} />
          <circle cx="24" cy="18" r="4.2" />
        </g>
      )
    case 'beast':
      return (
        <g>
          <path d="M24 44.5C16.6 44.5 12.6 40.6 12.6 36C12.6 31.6 16 29 19.4 27.4C21.6 26.4 22.6 25 24 25C25.4 25 26.4 26.4 28.6 27.4C32 29 35.4 31.6 35.4 36C35.4 40.6 31.4 44.5 24 44.5Z" />
          <ellipse cx="10" cy="23.6" rx="4.2" ry="5.4" transform="rotate(-24 10 23.6)" />
          <ellipse cx="18.6" cy="14.6" rx="4.4" ry="5.8" transform="rotate(-8 18.6 14.6)" />
          <ellipse cx="29.4" cy="14.6" rx="4.4" ry="5.8" transform="rotate(8 29.4 14.6)" />
          <ellipse cx="38" cy="23.6" rx="4.2" ry="5.4" transform="rotate(24 38 23.6)" />
          <g fillOpacity={T}>
            <path d="M5.4 17.4L6 11.6L9.2 16.4Z" />
            <path d="M16 7.6L18 2.6L20 7.4Z" />
            <path d="M28 7.4L30 2.6L32 7.6Z" />
            <path d="M38.8 16.4L42 11.6L42.6 17.4Z" />
          </g>
        </g>
      )
    case 'celestial': {
      const wing = <path d="M21 23C16.6 17 10 13.6 2.4 13.4C3.4 17.4 5.6 20.2 8.4 21.8C5.8 22.8 4.2 24.8 3.6 27.6C7.2 28.6 10.6 28.6 13.4 28C11.6 30 10.6 32.6 10.6 35.6C14.6 35.2 18.4 33 21.2 29.6Z" fillOpacity={T} />
      return (
        <g>
          {wing}
          <Mirror w={48}>{wing}</Mirror>
          <path d={star(24, 28.4, 4, 13.6, 3)} />
          <path fillRule="evenodd" d="M24 4.2C30 4.2 34.4 6.2 34.4 8.8C34.4 11.4 30 13.4 24 13.4C18 13.4 13.6 11.4 13.6 8.8C13.6 6.2 18 4.2 24 4.2ZM24 7C20 7 17.2 7.8 17.2 8.8C17.2 9.8 20 10.6 24 10.6C28 10.6 30.8 9.8 30.8 8.8C30.8 7.8 28 7 24 7Z" />
        </g>
      )
    }
    case 'construct': {
      let gear = ''
      for (let i = 0; i < 10; i++) {
        const a0 = (i * 36 - 8) * Math.PI / 180, a1 = (i * 36 + 8) * Math.PI / 180
        const a2 = (i * 36 + 13) * Math.PI / 180, a3 = (i * 36 + 23) * Math.PI / 180
        const R = 21.5, r = 17.6
        gear += (i === 0 ? 'M' : 'L') + `${24 + R * Math.cos(a0)} ${24 + R * Math.sin(a0)}L${24 + R * Math.cos(a1)} ${24 + R * Math.sin(a1)}L${24 + r * Math.cos(a2)} ${24 + r * Math.sin(a2)}L${24 + r * Math.cos(a3)} ${24 + r * Math.sin(a3)}`
      }
      return (
        <g>
          <path fillRule="evenodd" d={gear + 'Z' + ring(24, 24, 13.2)} fillOpacity={T} />
          <path fillRule="evenodd" d="M16.6 14.6H31.4C33 14.6 34 15.6 34 17.2V31C34 33.6 32 35.4 29.4 35.4H18.6C16 35.4 14 33.6 14 31V17.2C14 15.6 15 14.6 16.6 14.6ZM17.4 20.4V24.2H22.2V20.4ZM25.8 20.4V24.2H30.6V20.4ZM18.4 28V31.6H20.2V28ZM21.8 28V31.6H23.2V28ZM24.8 28V31.6H26.2V28ZM27.8 28V31.6H29.6V28Z" />
          <rect x="22.6" y="9.6" width="2.8" height="5.4" />
        </g>
      )
    }
    case 'dragon':
      return (
        <g>
          <DragonHead />
        </g>
      )
    case 'elemental':
      return (
        <g>
          <path d="M13 2.6C15.6 8 20.6 10.6 20.6 17.4C20.6 20 19.6 22.2 18 23.8C14.8 24.6 11.8 26.2 9.4 28.4C6.6 26.8 5 24 5 20.6C5 16.4 7.4 14 8.4 10.4C9.6 13.6 10.8 15 12.6 15.6C11.8 11.6 11.8 6.8 13 2.6Z" />
          <circle cx="40.6" cy="17.4" r="2.4" fillOpacity={T} /><circle cx="35" cy="13" r="1.6" fillOpacity={T} />
          <path d="M3 45.4C3.4 33 12 23.4 24.6 21.6C35.4 20 44.4 25.6 45 34C45.4 39.6 41.4 43.6 36.4 43.6C31.6 43.6 28.4 40.4 28.6 36.4C28.8 33 31.6 30.6 35 31.2C33 28 29 26.8 24.8 27.6C16.4 29.2 11 36.4 11.2 45.4Z" />
        </g>
      )
    case 'fey':
      return (
        <g>
          <path fillRule="evenodd" d={'M22.4 21C17.4 10.6 9.4 5.6 4.6 7.6C1.6 9 1.6 14.4 5 19C8 23 14 25.2 22 25.4Z' + ring(10.6, 14.6, 2.6) + 'M25.6 21C30.6 10.6 38.6 5.6 43.4 7.6C46.4 9 46.4 14.4 43 19C40 23 34 25.2 26 25.4Z' + ring(37.4, 14.6, 2.6)} />
          <path d="M22.2 27.4C15.6 27.6 9.2 30.6 8.2 36C7.4 40.4 11.6 43.4 16 41.4C19.6 39.8 21.8 35 22.2 30Z M25.8 27.4C32.4 27.6 38.8 30.6 39.8 36C40.6 40.4 36.4 43.4 32 41.4C28.4 39.8 26.2 35 25.8 30Z" fillOpacity={T} />
          <ellipse cx="24" cy="28.4" rx="2.3" ry="11.6" />
          <circle cx="24" cy="14.6" r="2.8" />
          <path d="M23 12.4C21.6 8.6 19 5.6 16.4 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M25 12.4C26.4 8.6 29 5.6 31.6 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )
    case 'fiend': {
      const horn = <path d="M14.4 17.6C8.6 14 5.4 8.6 6.6 2C9.4 7.4 13.4 10.2 19.4 12.4Z" />
      return (
        <g>
          {horn}
          <Mirror w={48}>{horn}</Mirror>
          <path fillRule="evenodd" d="M24 45C15.8 40.6 10.6 32.6 10.6 24.6C10.6 17.4 15.6 13 24 13C32.4 13 37.4 17.4 37.4 24.6C37.4 32.6 32.2 40.6 24 45ZM14.6 23.6L22 26.6L21 29.6L15.8 27.8ZM33.4 23.6L26 26.6L27 29.6L32.2 27.8ZM17 34.4C21.6 36.8 26.4 36.8 31 34.4L29.6 37.8L27.6 36.6L26 39.2L24 37.4L22 39.2L20.4 36.6L18.4 37.8Z" />
        </g>
      )
    }
    case 'giant':
      return (
        <g>
          <path d="M14 36H33.6V47H14Z" fillOpacity={T} />
          <Knock id={uid + 'g'} w={1.8} cut={<path fill="none" d="M17.6 9.4V22M25.4 8.6V22M33 9.4V22M8.6 23.4C13 21.4 20 21.6 25 24.2" />}>
            <path d="M8.2 13.4C8.2 10.4 10.6 8 13.4 8C14.6 6.2 16.6 5 19 5C20.8 5 22.4 5.6 23.6 6.8C24.8 5.6 26.6 5 28.4 5C31 5 33 6.4 34 8.4C34.6 8.2 35.2 8 36 8C38.8 8 41 10.4 41 13.4V27.6C41 33.6 37.6 37.4 32.4 37.4H16C11.4 37.4 8.2 34 8.2 29.4Z" />
          </Knock>
          <path d="M5.4 22.6C5.4 19.8 7.6 18.6 10 19.2L24.4 22.6C27 23.2 27.6 26.8 25 27.6L14.4 30.4C9.4 31.6 5.4 28.4 5.4 22.6Z" />
        </g>
      )
    case 'humanoid':
      return (
        <g>
          <path d="M3 46.6C4 41.4 8.6 38.4 14 38.4H34C39.4 38.4 44 41.4 45 46.6Z" fillOpacity={T} />
          <path fillRule="evenodd" d="M24 3.4C32.6 3.4 38.6 9.8 38.6 19V33.4C38.6 35.4 37 36.8 35 36.6L29.4 36V27H18.6V36L13 36.6C11 36.8 9.4 35.4 9.4 33.4V19C9.4 9.8 15.4 3.4 24 3.4ZM13 19.6V23.4H35V19.6ZM22.6 6.2V17.8H25.4V6.2Z" />
          <path d="M20.6 27H27.4V40H20.6Z" />
        </g>
      )
    case 'monstrosity': {
      const talon = (x: number, y: number, r: number, s = 1) => (
        <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M-3.4 0C-3.6 -9 0 -17.4 8 -22C4.2 -15.4 3.2 -8 3.4 0Z" />
      )
      return (
        <g>
          {talon(9.6, 25, -26, 0.82)}
          {talon(18.4, 21, -8)}
          {talon(28.4, 21, 8)}
          {talon(37.4, 25, 26, 0.82)}
          <path fillRule="evenodd" d="M4.8 28C4.8 24.6 7.4 22.6 10.4 22.8H37.6C40.6 22.6 43.2 24.6 43.2 28C43.2 33.4 40 37.8 35.4 40.2L33.8 46H14.2L12.6 40.2C8 37.8 4.8 33.4 4.8 28ZM10.6 28.4L16.2 31L11.4 33.8ZM37.4 28.4L31.8 31L36.6 33.8ZM20.6 29.4L24 32.6L27.4 29.4L24 35.2Z" />
        </g>
      )
    }
    case 'ooze':
      return (
        <g>
          <ellipse cx="24" cy="43.6" rx="20" ry="3" fillOpacity={T} />
          <path fillRule="evenodd" d={'M5.4 36C5 24 12.6 9.6 24 9.6C35.4 9.6 43 24 42.6 36C42.6 38.4 41.4 39.4 39.6 39.4C38.2 39.4 37.6 40.4 37.6 42C37.6 43.6 36.6 44.4 35.4 44.4C34.2 44.4 33.4 43.6 33.4 42V40.6C33.4 39.6 32.6 39.4 31.6 39.4H16.4C15.4 39.4 14.6 40.2 14.6 41.4V43C14.6 44.6 13.6 45.4 12.4 45.4C11.2 45.4 10.2 44.6 10.2 43V41C10.2 39.8 9 39.4 7.8 39.4C6.4 39.4 5.4 38 5.4 36Z' + ring(17.4, 22, 3.4) + ring(29, 17.4, 2) + ring(29.6, 29, 4.2) + ring(16, 32.4, 1.6)} />
          <circle cx="29.6" cy="29" r="1.8" fillOpacity={T} />
        </g>
      )
    case 'plant':
      return (
        <g>
          <path fillRule="evenodd" d={'M3.6 24.4C3.6 12.4 12.6 4.4 24 4.4C35.4 4.4 44.4 12.4 44.4 24.4C44.4 26.4 42.6 27.4 40.4 26.6C34.6 24.6 13.4 24.6 7.6 26.6C5.4 27.4 3.6 26.4 3.6 24.4Z' + ring(14, 15.6, 3.2) + ring(24, 10.4, 2.4) + ring(33.6, 16.2, 3.4) + ring(23.4, 19.4, 1.8)} />
          <path d="M18.2 27.4C18.4 34 17 39.6 14.8 44.6H33.2C31 39.6 29.6 34 29.8 27.4C26 26.8 22 26.8 18.2 27.4Z" fillOpacity={T} />
          <path d="M14 45C9 44.6 5 41 3.6 35.6C8.6 35.4 12.6 38.6 14 45Z" />
          <path d="M34 45C39 44.6 43 41 44.4 35.6C39.4 35.4 35.4 38.6 34 45Z" />
        </g>
      )
    case 'undead':
      return (
        <g>
          <path fillRule="evenodd" d="M24 3.6C34 3.6 41 10.6 41 20.4C41 26 38.4 29.6 35.6 31.4V35.2C35.6 37 34.2 38.4 32.4 38.4H15.6C13.8 38.4 12.4 37 12.4 35.2V31.4C9.6 29.6 7 26 7 20.4C7 10.6 14 3.6 24 3.6ZM12.8 21.2C12.8 17.6 15.6 15.8 18.8 16.2C22 16.6 22.8 19.6 21.8 22.8C20.8 26 18.2 27.2 16 26.6C13.6 26 12.8 24 12.8 21.2ZM35.2 21.2C35.2 17.6 32.4 15.8 29.2 16.2C26 16.6 25.2 19.6 26.2 22.8C27.2 26 29.8 27.2 32 26.6C34.4 26 35.2 24 35.2 21.2ZM24 25.4L26.4 30.6H21.6ZM18.6 33V38.4H20.4V33ZM23.1 33V38.4H24.9V33ZM27.6 33V38.4H29.4V33Z" />
          <path d="M15 40.4H33L31.6 44.4H16.4Z" fillOpacity={T} />
        </g>
      )
    default:
      return <g />
  }
}

export function CreatureIcon({ type, size = 48, className }: { type: string; size?: number; className?: string }): JSX.Element {
  const uid = useUid()
  return (
    <svg className={'art-glyph art-creature' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
      <CreatureGlyph type={type || ''} uid={uid} />
    </svg>
  )
}

// ---------------------------------------------------------------- campaign emblems

export const EMBLEMS: string[] = ['dragon', 'castle', 'crown', 'skull', 'tree', 'ship', 'moon', 'sun', 'tower', 'sword', 'eye', 'mountain', 'compass', 'chalice', 'rune', 'wolf']

function EmblemGlyph({ emblem, uid }: { emblem: string; uid: string }): JSX.Element {
  switch (emblem) {
    case 'dragon':
      return (
        <g>
          <Knock id={uid + 'w'} w={3.6} cut={<g transform="translate(6 7) scale(1.18)"><path d={DRAGON_HEAD} /></g>}>
            <path d="M16 40L3 6.6C8 9.6 11.6 10.4 15.4 9.4L17.4 2.6C20 8.6 23.6 11.6 28 12.6L31.6 7.6C32.4 15.4 30 24 22 40Z" fillOpacity={T} />
          </Knock>
          <g transform="translate(6 7) scale(1.18)"><DragonHead /></g>
        </g>
      )
    case 'castle':
      return (
        <g>
          <path d="M23 30V13H25.6V10H28.4V13H30.6V10H33.4V13H35.6V10H38.4V13H41V30Z" fillOpacity={T} />
          <path d="M32 2V9" stroke="currentColor" strokeWidth="1.8" fillOpacity={T} />
          <path d="M32.9 2.2L40 4.4L32.9 6.6Z" fillOpacity={T} />
          <path fillRule="evenodd" d="M5 59V17H8V13H11.4V17H14V13H17.4V17H20V13H23.4V17H24V28H40V17H40.6V13H44V17H46.6V13H50V17H52.6V13H56V17H59V59ZM26.4 59V48.4C26.4 45 28.8 42.4 32 42.4C35.2 42.4 37.6 45 37.6 48.4V59ZM12.4 26V32H15.6V26ZM48.4 26V32H51.6V26ZM12.4 41V47H15.6V41ZM48.4 41V47H51.6V41Z" />
        </g>
      )
    case 'crown':
      return (
        <g>
          <path fillRule="evenodd" d="M10.6 45L7 18.6L20.2 31L32 12.4L43.8 31L57 18.6L53.4 45ZM32 25.6L27.6 33L32 40.4L36.4 33Z" />
          <circle cx="7" cy="17" r="3.6" />
          <circle cx="57" cy="17" r="3.6" />
          <circle cx="32" cy="10.4" r="3.8" />
          <path fillRule="evenodd" d={'M10 47.4H54C55.4 47.4 56 48.4 56 49.6V53.8C56 55 55.4 56 54 56H10C8.6 56 8 55 8 53.8V49.6C8 48.4 8.6 47.4 10 47.4Z' + ring(19, 51.7, 2) + ring(45, 51.7, 2) + 'M32 49L34.8 51.7L32 54.4L29.2 51.7Z'} />
          <path d="M11 58.4H53V61H11Z" fillOpacity={T} />
        </g>
      )
    case 'skull': {
      const bone = (r: number) => (
        <g transform={`rotate(${r} 32 32)`} fillOpacity={T}>
          <rect x="4" y="29.6" width="56" height="4.8" rx="2" />
          <circle cx="4.6" cy="28.6" r="3.4" /><circle cx="4.6" cy="35.4" r="3.4" />
          <circle cx="59.4" cy="28.6" r="3.4" /><circle cx="59.4" cy="35.4" r="3.4" />
        </g>
      )
      return (
        <g>
          <Knock id={uid + 's'} w={4} cut={<path d="M32 9C42.6 9 50 16.4 50 26.8C50 32.6 47.2 36.4 44.2 38.4V42.6C44.2 44.6 42.6 46 40.8 46H23.2C21.4 46 19.8 44.6 19.8 42.6V38.4C16.8 36.4 14 32.6 14 26.8C14 16.4 21.4 9 32 9Z" />}>
            {bone(35)}
            {bone(-35)}
          </Knock>
          <path fillRule="evenodd" d="M32 9C42.6 9 50 16.4 50 26.8C50 32.6 47.2 36.4 44.2 38.4V42.6C44.2 44.6 42.6 46 40.8 46H23.2C21.4 46 19.8 44.6 19.8 42.6V38.4C16.8 36.4 14 32.6 14 26.8C14 16.4 21.4 9 32 9ZM20.2 27.6C20.2 23.8 23.2 21.8 26.6 22.2C30 22.6 30.8 25.8 29.8 29.2C28.8 32.6 26 33.8 23.6 33.2C21 32.6 20.2 30.6 20.2 27.6ZM43.8 27.6C43.8 23.8 40.8 21.8 37.4 22.2C34 22.6 33.2 25.8 34.2 29.2C35.2 32.6 38 33.8 40.4 33.2C43 32.6 43.8 30.6 43.8 27.6ZM32 32.4L34.6 38H29.4ZM26.2 40.2V46H28.2V40.2ZM31 40.2V46H33V40.2ZM35.8 40.2V46H37.8V40.2Z" />
        </g>
      )
    }
    case 'tree':
      return (
        <g>
          <g fillOpacity={T}>
            <circle cx="16" cy="28" r="10" />
            <circle cx="48" cy="28" r="10" />
          </g>
          <Knock id={uid + 't'} w={2} cut={<path fill="none" d="M32 40L24 30M32 36L41 27M32 30V18" />}>
            <path d="M32 4.6C40 4.6 45.6 10 45.8 16.6C51 17.6 54 21.6 53.6 26.6C53.2 31.6 49 35 44 35C43 39.6 38.6 42.4 32 42.4C25.4 42.4 21 39.6 20 35C15 35 10.8 31.6 10.4 26.6C10 21.6 13 17.6 18.2 16.6C18.4 10 24 4.6 32 4.6Z" />
          </Knock>
          <path d="M28.4 40H35.6L36.4 51C38.6 54.6 43 56.6 49 57.6V60.4H15V57.6C21 56.6 25.4 54.6 27.6 51Z" />
          <path d="M8 60.4H56V62.6H8Z" fillOpacity={T} />
        </g>
      )
    case 'ship':
      return (
        <g>
          <rect x="30.8" y="3" width="2.6" height="40" rx="1" />
          <path d="M33.4 3.4L42 6L33.4 8.6Z" />
          <path d="M20 10.6C26 12 38 12 44 10.6C45 14 45 18 44 20.6C38 22 26 22 20 20.6C19 18 19 14 20 10.6Z" fillOpacity={T} />
          <path d="M15.6 24C24 25.8 40 25.8 48.4 24C50 29 50 34.6 48.4 39C40 40.8 24 40.8 15.6 39C14 34.6 14 29 15.6 24Z" />
          <path fillRule="evenodd" d={'M4 42.4H60L55 53.6H14.4C10 53.6 6 49 4 42.4Z' + ring(20, 47.4, 1.7) + ring(29, 47.4, 1.7) + ring(38, 47.4, 1.7) + ring(47, 47.4, 1.7)} />
          <path d="M2 58.4C6 56 10 56 14 58.4C18 60.8 22 60.8 26 58.4C30 56 34 56 38 58.4C42 60.8 46 60.8 50 58.4C54 56 58 56 62 58.4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeOpacity={T} />
        </g>
      )
    case 'moon':
      return (
        <g>
          <mask id={uid + 'n'} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
            <rect width="64" height="64" fill="#fff" />
            <circle cx="40" cy="25" r="20" fill="#000" />
          </mask>
          <circle cx="29" cy="33" r="25" mask={`url(#${uid}n)`} />
          <path d={star(45, 39, 4, 6.4, 1.8)} fillOpacity={T} />
          <path d={star(51, 20, 4, 4, 1.2)} />
          <path d={star(36.6, 15, 4, 3, 0.9)} fillOpacity={T} />
        </g>
      )
    case 'sun':
      return (
        <g>
          <path d={star(32, 32, 12, 24, 13, 15)} fillOpacity={T} />
          <Knock id={uid + 'o'} w={2.4} cut={<g fill="none"><circle cx="32" cy="32" r="15.4" /><circle cx="32" cy="32" r="9.6" strokeWidth="2" /></g>}>
            <path d={star(32, 32, 12, 30.5, 14.5)} />
            <circle cx="32" cy="32" r="16" />
          </Knock>
        </g>
      )
    case 'tower':
      return (
        <g>
          <path d="M32 2L46.8 23H17.2Z" />
          <path fillRule="evenodd" d="M21 25H43V54H21ZM29.2 54V46C29.2 44 30.4 42.6 32 42.6C33.6 42.6 34.8 44 34.8 46V54ZM30.4 29.4V34.6C30.4 35.6 31 36.2 32 36.2C33 36.2 33.6 35.6 33.6 34.6V29.4C33.6 28.4 33 27.8 32 27.8C31 27.8 30.4 28.4 30.4 29.4Z" />
          <path d="M17 24.6H47V27.4H17Z" fillOpacity={T} />
          <path d="M16 54H48L51 60.4H13Z" fillOpacity={T} />
        </g>
      )
    case 'sword':
      return (
        <g>
          <path fillRule="evenodd" d="M32 1.4L36.6 8.4V43H27.4V8.4ZM31.1 11H32.9V39.6H31.1Z" />
          <path d="M14 41.6C14 39.6 16 38.6 18 39.4L26 42.6H38L46 39.4C48 38.6 50 39.6 50 41.6C50 43.6 48.4 46.4 45 46.4H19C15.6 46.4 14 43.6 14 41.6Z" />
          <path fillRule="evenodd" d="M29.4 46.4H34.6V55.4H29.4ZM29.4 48.8H34.6V49.8H29.4ZM29.4 51.6H34.6V52.6H29.4Z" fillOpacity={T} />
          <path d="M32 54.2L36 58.2L32 62.6L28 58.2Z" />
        </g>
      )
    case 'eye':
      return (
        <g>
          <g fillOpacity={T}>
            <path d="M30.4 2.4H33.6L32 11Z" />
            <path d="M12.4 8.4L14.8 6.6L19.4 14.2Z" />
            <path d="M51.6 8.4L49.2 6.6L44.6 14.2Z" />
            <path d="M3.4 20.2L4.8 17.6L11.8 21.6Z" />
            <path d="M60.6 20.2L59.2 17.6L52.2 21.6Z" />
          </g>
          <path fillRule="evenodd" d={'M3 37C10 25 22 19 32 19C42 19 54 25 61 37C54 49 42 55 32 55C22 55 10 49 3 37Z' + ring(32, 37, 12.6)} />
          <path fillRule="evenodd" d={ring(32, 37, 9.4) + ring(28.6, 33.6, 2.4)} />
        </g>
      )
    case 'mountain':
      return (
        <g>
          <path d="M33 56L47 22L62 56Z" fillOpacity={T} />
          <path fillRule="evenodd" d="M2 56L24.6 10L47.4 56ZM24.6 10L16.6 26.4L21 23.8L24.2 27.6L28 23.4L32.6 26.4Z" />
          <path d="M2 59H62V61.6H2Z" fillOpacity={T} />
          <path d="M47 22L42.8 32.2L46.2 30.4L48.8 33.2L51.4 31Z" />
        </g>
      )
    case 'compass': {
      const pt = (rot: number, len: number, w: number, o: number) => (
        <g transform={`rotate(${rot} 32 32)`}>
          <path d={`M32 ${32 - len}L${32 + w} 32H32Z`} />
          <path d={`M32 ${32 - len}L${32 - w} 32H32Z`} fillOpacity={o} />
        </g>
      )
      return (
        <g>
          <path fillRule="evenodd" d={ring(32, 32, 22) + ring(32, 32, 19)} fillOpacity={T} />
          {pt(45, 21, 4.4, T)}{pt(135, 21, 4.4, T)}{pt(225, 21, 4.4, T)}{pt(315, 21, 4.4, T)}
          {pt(0, 30, 6.6, 0.55)}{pt(90, 30, 6.6, 0.55)}{pt(180, 30, 6.6, 0.55)}{pt(270, 30, 6.6, 0.55)}
          <circle cx="32" cy="32" r="3.4" />
        </g>
      )
    }
    case 'chalice':
      return (
        <g>
          <path fillRule="evenodd" d={'M12.6 6.4H51.4C51.8 22.8 44 34.4 32 34.4C20 34.4 12.2 22.8 12.6 6.4Z' + 'M16.4 10.4H47.6V11.2H16.4Z' + 'M32 16.6L35.4 20.6L32 24.6L28.6 20.6Z'} />
          <path d="M29.4 34H34.6V48H29.4Z" fillOpacity={T} />
          <ellipse cx="32" cy="40.6" rx="5.6" ry="3.6" />
          <path d="M17 58.6C17.6 53.4 23.6 49.6 29.6 47.6H34.4C40.4 49.6 46.4 53.4 47 58.6Z" />
          <path d="M13 59.6H51V62H13Z" fillOpacity={T} />
        </g>
      )
    case 'rune':
      return (
        <g>
          <ellipse cx="32" cy="58.6" rx="24" ry="3.4" fillOpacity={T} />
          <Knock id={uid + 'u'} w={4} cut={<path fill="none" d="M32 15V49M32 23L41 16.6M32 33L23.4 26.6M32 33L40.6 39.4" />}>
            <path d="M17.6 57.6L13.4 22.6C12.6 12.6 21 5.4 32 5.4C43 5.4 51.4 12.6 50.6 22.6L46.4 57.6Z" />
          </Knock>
          <path d="M50.4 24.6L56.6 23.4M51.4 31.4L58.6 32" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeOpacity={T} />
          <path d="M13.6 24.6L7.4 23.4M12.6 31.4L5.4 32" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeOpacity={T} />
        </g>
      )
    case 'wolf':
      return (
        <g>
          <path fillRule="evenodd" d="M32 60C28.4 58.4 26 55 24.6 50.6L18.4 44.6C16.4 42.8 12.6 42 9.6 39.8L13.2 38.4C11.2 36.6 9.6 33.6 9.2 30.6L12.2 31.4C11.4 28 11.6 24.6 12.6 21.6L10.4 4.4L23.4 15C29 13.6 35 13.6 40.6 15L53.6 4.4L51.4 21.6C52.4 24.6 52.6 28 51.8 31.4L54.8 30.6C54.4 33.6 52.8 36.6 50.8 38.4L54.4 39.8C51.4 42 47.6 42.8 45.6 44.6L39.4 50.6C38 55 35.6 58.4 32 60ZM14.6 10.4L15.8 19.6L20.4 16ZM49.4 10.4L48.2 19.6L43.6 16ZM19 29.4L27.4 31.4L26.4 34.4L21.4 33.2ZM45 29.4L36.6 31.4L37.6 34.4L42.6 33.2ZM27.6 49.6C27.6 47.8 29.6 46.8 32 46.8C34.4 46.8 36.4 47.8 36.4 49.6C36.4 51.4 34 52.8 32 54C30 52.8 27.6 51.4 27.6 49.6ZM30.6 36.4L32 46.8L33.4 36.4L32 22Z" />
        </g>
      )
    default:
      return <D20Glyph uid={uid} />
  }
}

export function CampaignEmblem({ emblem, size = 64, className }: { emblem: string; size?: number; className?: string }): JSX.Element {
  const uid = useUid()
  return (
    <svg className={'art-glyph art-emblem' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <EmblemGlyph emblem={emblem} uid={uid} />
    </svg>
  )
}

// ---------------------------------------------------------------- crest (campaign seal on a shield)

const SHIELD = 'M7 9C21 11.4 36 10.4 50 5C64 10.4 79 11.4 93 9V52C93 80 75 98.6 50 110C25 98.6 7 80 7 52Z'
const SHIELD_IN = 'M12.4 14.2C25 16 38 15.2 50 10.8C62 15.2 75 16 87.6 14.2V52C87.6 77 71.6 93.6 50 104C28.4 93.6 12.4 77 12.4 52Z'

export function Crest({ emblem, color, size = 64, className, photo }: { emblem: string; color: string; size?: number; className?: string; photo?: string }): JSX.Element {
  const uid = useUid()
  const c = color || '#9f1d35'
  return (
    <svg className={'art-crest' + (className ? ' ' + className : '')} width={size} height={Math.round(size * 1.15)} viewBox="0 0 100 115" aria-hidden="true">
      <defs>
        <linearGradient id={uid + 'g'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(c, 0.12)} />
          <stop offset=".5" stopColor={c} />
          <stop offset="1" stopColor={shade(c, -0.5)} />
        </linearGradient>
        <radialGradient id={uid + 'h'} cx=".28" cy=".18" r=".6">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={uid + 'b'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc8e" />
          <stop offset=".45" stopColor="#c4943a" />
          <stop offset=".7" stopColor="#f0cf78" />
          <stop offset="1" stopColor="#8a6320" />
        </linearGradient>
        <clipPath id={uid + 'c'}><path d={SHIELD} /></clipPath>
      </defs>
      <path d={SHIELD} transform="translate(0 2)" fill="#000" fillOpacity=".18" />
      <path d={SHIELD} fill={`url(#${uid}g)`} />
      {photo ? (
        <g clipPath={`url(#${uid}c)`}>
          <image href={photo} x="0" y="0" width="100" height="115" preserveAspectRatio="xMidYMid slice" />
          <rect width="100" height="115" fill={`url(#${uid}h)`} opacity=".6" />
        </g>
      ) : (
        <>
          <path d={SHIELD} fill={`url(#${uid}h)`} />
          <g transform="translate(23 30) scale(.84)" fill="#000" fillOpacity=".32">
            <g transform="translate(0 1.8)"><EmblemGlyph emblem={emblem} uid={uid + 's'} /></g>
          </g>
          <g transform="translate(23 30) scale(.84)" fill="#f6ecd6" style={{ color: '#f6ecd6' }}>
            <EmblemGlyph emblem={emblem} uid={uid + 'e'} />
          </g>
        </>
      )}
      <path d={SHIELD_IN} fill="none" stroke={`url(#${uid}b)`} strokeWidth="2.2" />
      <path d={SHIELD} fill="none" stroke={shade(c, -0.62)} strokeOpacity=".9" strokeWidth="2" />
    </svg>
  )
}

// ---------------------------------------------------------------- dice

type Facet = { p: string; f: 'a' | 'b' | 'c'; s?: number }
type DieShape = { facets: Facet[]; outline: string; face: [number, number]; fs: number }

function dieShape(sides: number): DieShape {
  switch (sides) {
    case 4:
      return {
        facets: [
          { p: poly([[30, 5], [5, 55], [47, 55]]), f: 'b' },
          { p: poly([[30, 5], [47, 55], [59, 45]]), f: 'c' },
        ],
        outline: poly([[30, 5], [5, 55], [47, 55], [59, 45]]),
        face: [27.5, 40], fs: 22,
      }
    case 6:
      return {
        facets: [
          { p: poly([[7, 19], [19, 8], [57, 8], [45, 19]]), f: 'a' },
          { p: poly([[45, 19], [57, 8], [57, 45], [45, 57]]), f: 'c' },
          { p: poly([[7, 19], [45, 19], [45, 57], [7, 57]]), f: 'b' },
        ],
        outline: poly([[7, 19], [19, 8], [57, 8], [57, 45], [45, 57], [7, 57]]),
        face: [26, 38], fs: 24,
      }
    case 8:
      return {
        facets: [
          { p: poly([[32, 3], [5, 30], [12, 44]]), f: 'a' },
          { p: poly([[32, 3], [52, 44], [59, 30]]), f: 'c' },
          { p: poly([[32, 3], [12, 44], [52, 44]]), f: 'b' },
          { p: poly([[5, 30], [12, 44], [32, 61]]), f: 'c', s: 0.08 },
          { p: poly([[12, 44], [52, 44], [32, 61]]), f: 'c' },
          { p: poly([[52, 44], [59, 30], [32, 61]]), f: 'c', s: 0.2 },
        ],
        outline: poly([[32, 3], [59, 30], [32, 61], [5, 30]]),
        face: [32, 32], fs: 18,
      }
    case 10:
    case 100:
      return {
        facets: [
          { p: poly([[32, 3], [5, 26], [15, 32]]), f: 'a' },
          { p: poly([[32, 3], [49, 32], [59, 26]]), f: 'c' },
          { p: poly([[32, 3], [15, 32], [32, 46], [49, 32]]), f: 'b' },
          { p: poly([[5, 26], [5, 37], [32, 61], [32, 46], [15, 32]]), f: 'c', s: 0.06 },
          { p: poly([[59, 26], [59, 37], [32, 61], [32, 46], [49, 32]]), f: 'c', s: 0.2 },
        ],
        outline: poly([[32, 3], [59, 26], [59, 37], [32, 61], [5, 37], [5, 26]]),
        face: [32, 30], fs: 18,
      }
    case 12: {
      const P: number[][] = [], O: number[][] = []
      const cx = 32, cy = 33
      for (let i = 0; i < 5; i++) { const a = (-90 + i * 72) * Math.PI / 180; P.push([cx + 15 * Math.cos(a), cy + 15 * Math.sin(a)]) }
      for (let i = 0; i < 10; i++) { const a = (-90 + i * 36) * Math.PI / 180; const r = i % 2 === 0 ? 29.5 : 27.5; O.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
      const facets: Facet[] = []
      const tones: Facet['f'][] = ['a', 'c', 'c', 'c', 'a']
      const sh = [0, 0, 0.18, 0.08, 0.1]
      for (let k = 0; k < 5; k++) {
        facets.push({ p: poly([P[k], O[(2 * k) % 10], O[(2 * k + 1) % 10], O[(2 * k + 2) % 10], P[(k + 1) % 5]]), f: tones[k], s: sh[k] })
      }
      facets.push({ p: poly(P), f: 'b' })
      return { facets, outline: poly(O), face: [32, 34], fs: 18 }
    }
    default: {
      const V = [[32, 3], [57, 17.5], [57, 46.5], [32, 61], [7, 46.5], [7, 17.5]]
      const A = [32, 12.5], L = [11.5, 47], R = [52.5, 47]
      return {
        facets: [
          { p: poly([V[5], V[0], A]), f: 'a' },
          { p: poly([V[0], V[1], A]), f: 'a', s: 0.07 },
          { p: poly([V[5], A, L]), f: 'a', s: 0.12 },
          { p: poly([V[5], L, V[4]]), f: 'c', s: 0 },
          { p: poly([V[1], R, A]), f: 'c' },
          { p: poly([V[1], V[2], R]), f: 'c', s: 0.14 },
          { p: poly([L, R, V[3]]), f: 'c', s: 0.08 },
          { p: poly([V[4], L, V[3]]), f: 'c', s: 0.16 },
          { p: poly([V[2], V[3], R]), f: 'c', s: 0.24 },
          { p: poly([A, L, R]), f: 'b' },
        ],
        outline: poly(V),
        face: [32, 36.5], fs: 19.5,
      }
    }
  }
}

const DIE_FILL = { a: 'var(--die-a, #fffaf0)', b: 'var(--die-b, #f1e6cf)', c: 'var(--die-c, #cdb995)' }

export function Die({ sides, size = 40, value, rolling, tone = 'plain', className, title }: { sides: 4 | 6 | 8 | 10 | 12 | 20 | 100; size?: number; value?: number | string; rolling?: boolean; tone?: 'plain' | 'crit' | 'fumble' | 'accent'; className?: string; title?: string }): JSX.Element {
  const s = dieShape(sides)
  const text = value === undefined || value === null ? '' : String(value)
  const len = Array.from(text).length
  const fs = s.fs * (len <= 1 ? 1.2 : len === 2 ? 1.02 : 0.74)
  const cls = ['die', 'art-die', 'tone-' + tone, rolling ? 'is-rolling' : '', className || ''].filter(Boolean).join(' ')
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      <g strokeLinejoin="round">
        {s.facets.map((f, i) => (
          <g key={i}>
            <path d={f.p} style={{ fill: DIE_FILL[f.f], stroke: DIE_FILL[f.f] }} strokeWidth=".6" />
            {f.s ? <path d={f.p} fill="#000" fillOpacity={f.s} /> : null}
          </g>
        ))}
        <g fill="none" style={{ stroke: 'var(--die-edge, #7d6a4c)' }} strokeOpacity=".55" strokeWidth="1.1">
          {s.facets.map((f, i) => <path key={i} d={f.p} />)}
        </g>
        <path d={s.outline} fill="none" style={{ stroke: 'var(--die-edge, #7d6a4c)' }} strokeWidth="2.2" />
      </g>
      {text && (
        <text x={s.face[0]} y={s.face[1]} dy=".36em" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={fs.toFixed(1)} style={{ fill: 'var(--die-ink, #2b1d12)' }} letterSpacing={len > 1 ? '-0.04em' : undefined}>{text}</text>
      )}
      {sides === 100 && (
        <text x="45" y="44" dy=".36em" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="9" style={{ fill: 'var(--die-ink, #2b1d12)' }} opacity=".8">%</text>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------- tokens

const METALS: Record<string, string[]> = {
  gold: ['#fff2bd', '#e2b54c', '#9a6a1a', '#f6d77c', '#7c5410'],
  silver: ['#ffffff', '#cfd4db', '#7f8793', '#eceef2', '#5c6370'],
  bronze: ['#f7cda2', '#c27c40', '#7a431c', '#e6a670', '#56300f'],
  iron: ['#aab0b8', '#636970', '#2f3338', '#848b94', '#1e2125'],
  pewter: ['#ebe8e2', '#aeaba4', '#6f6c66', '#cfccc5', '#54514b'],
}

function hpColor(frac: number): string {
  return frac > 0.5 ? '#2fa35a' : frac >= 0.25 ? '#e0a020' : '#d63a3a'
}

export function Token({ name, color, emblem, frame = '', photo, size = 64, level, hp, state = '', className, title }: { name: string; color?: string; emblem?: string; frame?: '' | 'gold' | 'silver' | 'bronze' | 'iron'; photo?: string; size?: number; level?: number; hp?: { cur: number; max: number }; state?: '' | 'down' | 'dead'; className?: string; title?: string }): JSX.Element {
  const uid = useUid()
  const em = (emblem || '').toLowerCase()
  const base = color || CLASS_COLORS[em] || '#9f1d35'
  const m = METALS[frame || 'pewter'] || METALS.pewter
  const small = size < 48
  const isClass = !!em && CLASS_KEYS.includes(em)
  const ini = initials(name || '')
  const frac = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.cur / hp.max)) : 0
  const C = 2 * Math.PI * 47
  const br = small ? 15.5 : 12.5
  const cls = ['art-token', state ? 'is-' + state : '', className || ''].filter(Boolean).join(' ')
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title || name}>
      <title>{title || name}</title>
      <defs>
        <linearGradient id={uid + 'm'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m[0]} />
          <stop offset=".3" stopColor={m[1]} />
          <stop offset=".55" stopColor={m[2]} />
          <stop offset=".75" stopColor={m[3]} />
          <stop offset="1" stopColor={m[4]} />
        </linearGradient>
        <linearGradient id={uid + 'n'} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={m[0]} />
          <stop offset=".45" stopColor={m[1]} />
          <stop offset="1" stopColor={m[4]} />
        </linearGradient>
        <radialGradient id={uid + 'd'} cx=".36" cy=".3" r=".78">
          <stop offset="0" stopColor={shade(base, 0.28)} />
          <stop offset=".55" stopColor={base} />
          <stop offset="1" stopColor={shade(base, -0.45)} />
        </radialGradient>
        <radialGradient id={uid + 'h'} cx=".3" cy=".2" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={uid + 'c'}><circle cx="50" cy="50" r="34.5" /></clipPath>
      </defs>
      {hp && (
        <g fill="none" strokeWidth="4.6">
          <circle cx="50" cy="50" r="47" stroke="currentColor" strokeOpacity=".16" />
          {frac > 0 && <circle cx="50" cy="50" r="47" stroke={hpColor(frac)} strokeLinecap="round" strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 50 50)" />}
        </g>
      )}
      <circle cx="50" cy="51.4" r="43.5" fill="#000" fillOpacity=".22" />
      <circle cx="50" cy="50" r="43.5" fill={`url(#${uid}m)`} />
      <circle cx="50" cy="50" r="43.5" fill={`url(#${uid}h)`} />
      <circle cx="50" cy="50" r="38.6" fill={`url(#${uid}n)`} />
      <circle cx="50" cy="50" r="36.4" fill="#16110c" fillOpacity=".78" />
      <circle cx="50" cy="50" r="34.5" fill={`url(#${uid}d)`} />
      {photo ? (
        <image href={photo} x="15.5" y="15.5" width="69" height="69" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}c)`} />
      ) : isClass ? (
        <>
          <g transform="translate(25.7 27.3) scale(.76)" fill="#000" fillOpacity=".3"><ClassGlyph cls={em} uid={uid + 's'} /></g>
          <g transform="translate(25.7 25.7) scale(.76)" fill="#f8efdc" style={{ color: '#f8efdc' }}><ClassGlyph cls={em} uid={uid + 'e'} /></g>
        </>
      ) : (
        <>
          <text x="50" y="51.6" dy=".35em" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={ini.length > 1 ? 30 : 36} fill="#000" fillOpacity=".3">{ini}</text>
          <text x="50" y="50" dy=".35em" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={ini.length > 1 ? 30 : 36} fill="#fbf3e2">{ini}</text>
        </>
      )}
      <path d="M22 36A31 31 0 0 1 64 19.4" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="2.4" strokeLinecap="round" />
      {state === 'down' && <circle cx="50" cy="50" r="34.5" fill="#5a0b14" fillOpacity=".42" />}
      {state === 'dead' && (
        <g>
          <circle cx="50" cy="50" r="34.5" fill="#000" fillOpacity=".38" />
          <circle cx="78.3" cy="21.7" r={br} fill="#1b1a18" stroke="#d9d4ca" strokeWidth="1.8" />
          <g transform={`translate(${78.3 - br * 0.62} ${21.7 - br * 0.62}) scale(${(br * 1.24) / 48})`} fill="#ece6da"><CreatureGlyph type="undead" uid={uid + 'k'} /></g>
        </g>
      )}
      {level !== undefined && level !== null && (
        <g>
          <circle cx="78.3" cy="78.3" r={br} fill="#1c1916" stroke={`url(#${uid}m)`} strokeWidth="2.2" />
          <text x="78.3" y="78.3" dy=".36em" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={(small ? 19 : 15) * (String(level).length > 1 ? 0.86 : 1)} fill="#fbf3e2">{level}</text>
        </g>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------- wax seal

export function Seal({ size = 48, className }: { size?: number; className?: string }): JSX.Element {
  const uid = useUid()
  let blob = ''
  const n = 15
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? 29.2 + ((i * 7) % 5) * 0.28 : 27.4 - ((i * 3) % 4) * 0.3
    const x = 32 + r * Math.cos(a), y = 32 + r * Math.sin(a)
    blob += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2)
  }
  const d20 = 'M32 19L43.3 25.5V38.5L32 45L20.7 38.5V25.5Z'
  const d20in = 'M32 24.4L24.6 37.2H39.4Z M32 19V24.4 M20.7 25.5L24.6 37.2 M43.3 25.5L39.4 37.2 M24.6 37.2L32 45 M39.4 37.2L32 45'
  return (
    <svg className={'art-seal' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={uid + 'w'} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#d8485d" />
          <stop offset=".5" stopColor="#a51f37" />
          <stop offset="1" stopColor="#5c0a19" />
        </radialGradient>
        <radialGradient id={uid + 'i'} cx=".6" cy=".66" r=".7">
          <stop offset="0" stopColor="#b52a42" />
          <stop offset="1" stopColor="#7a1124" />
        </radialGradient>
      </defs>
      <path d={blob} transform="translate(0 1.4)" fill="#000" fillOpacity=".2" />
      <path d={blob} fill={`url(#${uid}w)`} stroke="#7d1022" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="20.5" fill={`url(#${uid}i)`} />
      <path d="M17 24A16.5 16.5 0 0 1 40 14.5" fill="none" stroke="#000" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
      <path d="M47 40A16.5 16.5 0 0 1 24 49.5" fill="none" stroke="#ffb3bf" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        <g transform="translate(.8 .9)" stroke="#3e0510" strokeOpacity=".55" strokeWidth="2.4"><path d={d20} /><path d={d20in} strokeWidth="1.8" /></g>
        <g transform="translate(-.5 -.6)" stroke="#ff9fae" strokeOpacity=".55" strokeWidth="2.2"><path d={d20} /><path d={d20in} strokeWidth="1.6" /></g>
        <g stroke="#b8293f" strokeWidth="2.2"><path d={d20} /><path d={d20in} strokeWidth="1.6" /></g>
      </g>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * 45 + 22.5) * Math.PI / 180
        const x = 32 + 17.2 * Math.sin(a), y = 32 - 17.2 * Math.cos(a)
        return <path key={i} d={star(x, y, 4, 1.9, 0.6)} fill="#e7768a" fillOpacity=".7" />
      })}
    </svg>
  )
}
