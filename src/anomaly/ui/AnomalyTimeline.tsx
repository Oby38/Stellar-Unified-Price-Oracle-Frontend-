import { memo, useState } from 'react'
import type { AnomalyEvent } from '../engine/AnomalyEngine'

interface Props {
  events: AnomalyEvent[]
  onMarkFalsePositive: (id: string) => void
  onClear: () => void
}

const SEVERITY_STYLES = {
  critical: 'bg-red-900/40 border-red-700 text-red-400',
  warning: 'bg-amber-900/40 border-amber-700 text-amber-400',
  info: 'bg-blue-900/40 border-blue-700 text-blue-400',
}

const SEVERITY_DOT = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
}

function ScoreBar({ contributions }: { contributions: Record<string, number> }) {
  return (
    <div className="mt-2 space-y-1">
      {Object.entries(contributions)
        .filter(([, v]) => v > 0.05)
        .sort((a, b) => b[1] - a[1])
        .map(([model, score]) => (
          <div key={model} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 shrink-0">{model}</span>
            <div className="flex-1 bg-gray-800 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-cyan-500"
                style={{ width: `${(score * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-8 text-right">{(score * 100).toFixed(0)}%</span>
          </div>
        ))}
    </div>
  )
}

export const AnomalyTimeline = memo(function AnomalyTimeline({ events, onMarkFalsePositive, onClear }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const visible = events.filter((e) => !e.isFalsePositive)

  return (
    <section aria-label="Anomaly Timeline" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          Anomaly Detection
          {visible.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-900/40 text-red-400 rounded-full">
              {visible.length}
            </span>
          )}
        </h2>
        {visible.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-gray-600 py-2">No anomalies detected.</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto" role="list">
          {visible.map((ev) => (
            <li
              key={ev.id}
              className={`rounded-lg border p-3 text-xs ${SEVERITY_STYLES[ev.severity]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[ev.severity]}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ev.description}</p>
                    <p className="text-gray-500 mt-0.5">
                      {ev.assetPair} &middot; {new Date(ev.timestamp).toLocaleTimeString()} &middot; score {(ev.score * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label="Toggle model breakdown"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={expanded === ev.id ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkFalsePositive(ev.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                    aria-label="Mark as false positive"
                    title="Not an anomaly"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {expanded === ev.id && (
                <ScoreBar contributions={ev.modelContributions} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
})
