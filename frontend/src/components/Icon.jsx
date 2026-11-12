// Icons8 iOS outline icons (bundled PNGs, so they work offline), drawn as a CSS mask
// so they take the text colour of whatever they sit in. Each icon is exported from
// Icons8 at 2x of every size the UI uses (16/20/24) instead of being scaled in CSS.
const urls = import.meta.glob('../assets/icons/*.png', { eager: true, query: '?url', import: 'default' })
const SIZES = [16, 20, 24]

export function Icon({ name, size = 20, className = '' }) {
  const exported = SIZES.includes(size) ? size : SIZES.find((s) => s >= size) ?? 24
  const url = urls[`../assets/icons/${name}-${exported}.png`]
  const mask = `url("${url}") center / contain no-repeat`
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: exported, height: exported, mask, WebkitMask: mask }}
    />
  )
}
