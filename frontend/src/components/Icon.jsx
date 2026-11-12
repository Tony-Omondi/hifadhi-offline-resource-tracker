// Icons8 iOS outline icons (bundled PNGs, so they work offline), drawn as a CSS mask
// so they take the text colour of whatever they sit in.
const urls = import.meta.glob('../assets/icons/*.png', { eager: true, query: '?url', import: 'default' })

export function Icon({ name, size = 20, className = '' }) {
  const url = urls[`../assets/icons/${name}.png`]
  const mask = `url("${url}") center / contain no-repeat`
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: size, height: size, mask, WebkitMask: mask }}
    />
  )
}
