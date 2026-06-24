import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line } from 'recharts'
import { useMonitoring } from '../hooks/useMonitoring'
import { exportDiagnosticsBundle, setConsoleSuppressionPatterns, setLatencyThreshold } from '../utils/monitoring'

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
  return sorted[index]
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function downloadDiagnostics() {
  const bundle = exportDiagnosticsBundle()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `diagnostics-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function OpsDashboard() {
  const { consoleWarnings, latencyHistory, websocketAnalytics, errorHistory, latestLatencyMs, threshold } = useMonitoring()
  const [suppressionInput, setSuppressionInput] = useState('ResizeObserver loop limit exceeded')
  const [latencyThresholdInput, setLatencyThresholdInput] = useState(String(threshold))

  const latencyValues = latencyHistory.map((sample) => sample.latencyMs)
  const p50 = percentile(latencyValues, 0.5)
  const p95 = percentile(latencyValues, 0.95)
  const p99 = percentile(latencyValues, 0.99)
  const highLatencyCount = latencyHistory.filter((sample) => sample.exceededThreshold).length

  const latencyChartData = latencyHistory.slice(-12).map((sample) => ({
    label: formatTimestamp(sample.timestamp),
    latency: sample.latencyMs,
  }))

  const errorChartData = errorHistory.slice(-12).map((sample) => ({
    label: formatTimestamp(sample.timestamp),
    errors: sample.count,
  }))

  const memoryUsage = useMemo(() => {
    const perf = window.performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }
    const memory = perf.memory
    if (!memory?.usedJSHeapSize) return null
    return Math.round(memory.usedJSHeapSize / 1024 / 1024)
  }, [latencyHistory.length])

  const applySuppression = () => {
    const patterns = suppressionInput
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    setConsoleSuppressionPatterns(patterns)
  }

  const applyThreshold = () => {
    const parsed = Number.parseInt(latencyThresholdInput, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      setLatencyThreshold(parsed)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-700 bg-gray-900/80 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">Admin Operations</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Operational Metrics Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Monitor API health, connection stability, console warnings, and client-side performance in one view.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadDiagnostics}
            className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/10"
          >
            Export diagnostics
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'API latency', value: `${latestLatencyMs.toFixed(0)} ms`, tone: 'text-cyan-300' },
          { label: 'p95 latency', value: `${p95.toFixed(0)} ms`, tone: 'text-emerald-300' },
          { label: 'Disconnections', value: `${websocketAnalytics.disconnectCount}`, tone: 'text-amber-300' },
          { label: 'Memory usage', value: memoryUsage ? `${memoryUsage} MB` : 'n/a', tone: 'text-fuchsia-300' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
            <p className="text-sm text-gray-400">{item.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">API latency histogram</h2>
              <p className="text-sm text-gray-400">p50 {p50.toFixed(0)} ms • p95 {p95.toFixed(0)} ms • p99 {p99.toFixed(0)} ms</p>
            </div>
            <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-300">Threshold {threshold} ms</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Bar dataKey="latency" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Error rate over time</h2>
              <p className="text-sm text-gray-400">{highLatencyCount} high-latency samples captured</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={errorChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Line type="monotone" dataKey="errors" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
          <h2 className="text-lg font-semibold text-white">WebSocket timeline</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-300">
            {websocketAnalytics.events.slice(-8).reverse().map((event) => (
              <li key={event.id} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/40 px-3 py-2">
                <span className="font-medium uppercase tracking-wide text-gray-400">{event.type}</span>
                <span>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-4">
          <h2 className="text-lg font-semibold text-white">Aggregated warnings</h2>
          <div className="mt-4 space-y-3">
            {consoleWarnings.length === 0 ? (
              <p className="text-sm text-gray-400">No warnings captured yet.</p>
            ) : consoleWarnings.slice(0, 8).map((warning) => (
              <div key={warning.id} className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-100">{warning.message}</p>
                  <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">{warning.count}x</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="latency-threshold" className="text-sm text-gray-400">High latency threshold (ms)</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="latency-threshold"
                  value={latencyThresholdInput}
                  onChange={(event) => setLatencyThresholdInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                  placeholder="250"
                />
                <button
                  type="button"
                  onClick={applyThreshold}
                  className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300"
                >
                  Apply
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="suppress-patterns" className="text-sm text-gray-400">Suppress known benign warnings</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="suppress-patterns"
                  value={suppressionInput}
                  onChange={(event) => setSuppressionInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                  placeholder="Comma-separated warning fragments"
                />
                <button
                  type="button"
                  onClick={applySuppression}
                  className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-300"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
