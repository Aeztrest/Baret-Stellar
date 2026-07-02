/**
 * Baret hard-hat mark + wordmark. The glyph path is the single source of
 * truth at packages/ui/src/brand/Mark.tsx (docs/brand.md §2); mirrored here
 * as a static path rather than importing that React component, since this
 * app runs React 19 against packages/ui's React 18 peer dependency.
 */
export function Logo(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 156 24" aria-hidden="true" {...props}>
      <path d="M5 15.5a7 7 0 0 1 14 0Z" fill="#FF6B00" />
      <rect x="10.8" y="6.2" width="2.4" height="4.6" rx="1.2" fill="#FFFFFF" />
      <rect x="3.2" y="16.2" width="17.6" height="2.4" rx="1.2" fill="#FF6B00" />
      <text
        x="28"
        y="17"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="2"
        className="fill-zinc-900 dark:fill-white"
      >
        BARET
      </text>
    </svg>
  )
}
