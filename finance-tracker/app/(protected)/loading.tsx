export default function Loading() {
  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="skeleton h-8 w-40 rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4">
            <div className="skeleton h-4 w-24 mb-3 rounded" />
            <div className="skeleton h-7 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="skeleton h-5 w-36 mb-4 rounded" />
        <div className="skeleton h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}
