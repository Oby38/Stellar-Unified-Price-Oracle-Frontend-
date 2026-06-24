import { memo, useEffect, useState } from 'react'
import type { ProbeResult } from '../probes/healthProbes'
import type { HealingRecord } from '../healing/selfHealing'
import { getCircuitStatus } from '../healing/selfHealing'
import { tracer } from '../instrumentation/tracer'

interface Props {
  probes: ProbeResult[]
  overallHealth: 'healthy' | 'degraded' | 'unhealthy'
  healingHistory: HealingRecord[]
  onForceHeal: (reason: string) => void
}

const STATUS_STYLES = {
  healthy: 'text-green-400',
  degraded: 'text-amber-400',
  unhealthy: 'text-red-400',
}

const STATUS_DOT = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-red-500',
}

function ProbeRow({ probe }: { probe: ProbeResult }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[probe.status]}`} aria-hidden="true" />
        <span className="text-gray-300 font-medium">{probe.name}</span>
      </div>
      <div className="flex items-center gap-3 text-gray-500">
        <span>{probe.message}</span>
        {probe.latencyMs !== undefined && <span>{probe.latencyMs.toFixed(1)}ms</span>}
      </div>
    </div>
  )
}

export const ObservabilityDashboard = memo(function ObservabilityDashboard({
  probes,
  overallHealth,
  healingHistory,
  onForceHeal,
}: Props) {
  const [recentSpans, setRecentSpans] = useState(tracer.getSpans().slice(0, 10))

  useEffect(() => {
    const id = setInterval(() => setRecentSpans(tracer.getSpans().slice(0, 10)), 2_000)
    return () => clearInterval(id)
  }, [])

  const circuits = getCircuitStatus()

  return (
    <div
      role="dialog"
      aria-label="Observability Dashboard"
      className="fixed bottom-4 right-4 w-96 max-h-[80vh] overflow-y-auto z-50 rounded-xl border border-gray-700 bg-gray-950/95 backdrop-blur-sm shadow-2xl text-xs"
    >
      {/* Header */}
      <div className="sticky top-0 bg-gray-950/95 border-b border-gray-800 px-4 py-3 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[overallHealth]}`} aria-hidden="true" />
        <span className={`font-semibold text-sm ${STATUS_STYLES[overallHealth]}`}>
          System {overallHealth}
        </span>
        <span className="text-gray-600 text-xs ml-auto">Ctrl+Shift+O to close</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Health Probes */}
        <section aria-labelledby="probes-heading">
          <h3 id="probes-heading" className="text-gray-400 font-medium mb-2">Health Probes</h3>
          {probes.length === 0 ? (
            <p className="text-gray-600">Initialising…</p>
          ) : (
            probes.map((p) => <ProbeRow key={p.name} probe={p} />)
          )}
        </section>

        {/* Circuit Breakers */}
        <section aria-labelledby="circuits-heading">
          <h3 id="circuits-heading" className="text-gray-400 font-medium mb-2">Circuit Breakers</h3>
          {Object.entries(circuits).map(([action, state]) => (
            <div key={action} className="flex items-center justify-between py-1">
              <span className="text-gray-300">{action}</span>
              <span className={state.open ? 'text-red-400' : 'text-green-400'}>
                {state.open ? `OPEN (${state.failures} fails)` : `closed (${state.failures} fails)`}
              </span>
            </div>
          ))}
        </section>

        {/* Recent Traces */}
        {recentSpans.length > 0 && (
          <section aria-labelledby="traces-heading">
            <h3 id="traces-heading" className="text-gray-400 font-medium mb-2">Recent Traces</h3>
            <div className="space-y-1">
              {recentSpans.map((span) => (
                <div key={span.spanId} className="flex items-center justify-between py-0.5">
                  <span className={span.status === 'error' ? 'text-red-400' : 'text-gray-300'}>
                    {span.name}
                  </span>
                  <span className="text-gray-600">
                    {span.endTime !== undefined ? `${(span.endTime - span.startTime).toFixed(1)}ms` : 'in-flight'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Healing History */}
        {healingHistory.length > 0 && (
          <section aria-labelledby="healing-heading">
            <h3 id="healing-heading" className="text-gray-400 font-medium mb-2">Recovery Actions</h3>
            <div className="space-y-1">
              {healingHistory.slice(0, 5).map((h, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span className={h.success ? 'text-green-400' : 'text-red-400'}>{h.action}</span>
                  <span className="text-gray-600">{new Date(h.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Manual heal button */}
        <button
          type="button"
          onClick={() => onForceHeal('manual trigger')}
          className="w-full text-xs py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
        >
          Force refetch state
        </button>
      </div>
    </div>
  )
})
