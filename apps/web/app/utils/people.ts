/** Up to two initials for an avatar. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const letters =
    words.length === 1 ? [...words[0]!].slice(0, 2) : [words[0]!, words.at(-1)!].map((w) => [...w][0])
  return letters.join('').toUpperCase()
}

/** Stable hue (0–359) for a person, so the same user always gets the same avatar tint. */
export function hueOf(seed: string | null | undefined): number {
  let hash = 0
  for (const char of seed ?? '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}
