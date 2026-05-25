export default function Spinner({ size = 'md' }) {
  const cls = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  return (
    <svg className={`animate-spin ${cls} text-accent`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
