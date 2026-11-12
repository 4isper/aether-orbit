/** The brand mark: a planet on an inclined orbit. */
export function OrbitMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="20" cy="20" rx="17" ry="8.5" transform="rotate(-35 20 20)" stroke="currentColor" strokeWidth="1" />
      <circle cx="32.5" cy="10.5" r="1.8" fill="currentColor" />
    </svg>
  )
}
