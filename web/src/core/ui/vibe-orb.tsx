import type { CSSProperties } from 'react'

type Props = {
  seed: string
  dim?: boolean
  size?: 'sm' | 'lg'
  delay?: number
}

/** Abstract avatar orb — no photo, derived from avatar_seed. */
export function VibeOrb({ seed, dim = false, size = 'sm', delay = 0 }: Props) {
  const hue = hashSeed(seed) % 360
  const sizeClass = size === 'lg' ? ' vibe-orb-ring--lg' : ''

  return (
    <div className={`vibe-orb-ring${sizeClass}`} aria-hidden>
      <div
        className={`vibe-orb-core${dim ? ' vibe-orb-core--dim' : ''}${size === 'lg' ? ' vibe-orb-core--lg' : ''}`}
        style={
          {
            '--orb-hue': `${hue}deg`,
            '--orb-delay': `${delay}s`,
          } as CSSProperties
        }
      />
      {size === 'lg' ? <div className="vibe-orb-ring__inner" /> : null}
    </div>
  )
}

function hashSeed(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}
