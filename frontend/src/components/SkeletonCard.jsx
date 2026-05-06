export default function SkeletonCard({ className = '' }) {
  return (
    <div className={`card animate-pulse p-6 ${className}`}>
      <div className="h-4 w-2/3 bg-white/[0.06] rounded mb-3" />
      <div className="flex flex-col gap-2">
        <div className="h-3 w-full bg-white/[0.04] rounded" />
        <div className="h-3 w-full bg-white/[0.04] rounded" />
      </div>
    </div>
  )
}
