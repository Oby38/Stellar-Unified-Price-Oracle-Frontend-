// #115 — Anomaly Detection Engine
// Runs statistical + heuristic models in-browser; no external ML deps needed.

export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface AnomalyEvent {
  id: string
  assetPair: string
  type: string
  severity: AnomalySeverity
  score: number // 0–1
  description: string
  timestamp: number
  modelContributions: Record<string, number>
  isFalsePositive?: boolean
}

interface PricePoint {
  price: number
  confidence: number
  timestamp: number
  sources: string[]
}

// Rolling window of price points per asset pair
const windows = new Map<string, PricePoint[]>()
const WINDOW_SIZE = 60
const DEDUP_WINDOW_MS = 5 * 60 * 1000

// Per-pair last-event times for deduplication
const lastEventTime = new Map<string, Map<string, number>>()

function getWindow(pair: string): PricePoint[] {
  if (!windows.has(pair)) windows.set(pair, [])
  return windows.get(pair)!
}

function push(pair: string, point: PricePoint) {
  const w = getWindow(pair)
  w.push(point)
  if (w.length > WINDOW_SIZE) w.shift()
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[], mu?: number): number {
  const m = mu ?? mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// --- Statistical models ---

function zScoreModel(w: PricePoint[], latest: PricePoint): number {
  if (w.length < 10) return 0
  const prices = w.map((p) => p.price)
  const m = mean(prices)
  const sd = stddev(prices, m)
  if (sd === 0) return 0
  const z = Math.abs((latest.price - m) / sd)
  return Math.min(z / 5, 1) // normalise: z=5 -> score=1
}

function cusumModel(w: PricePoint[]): number {
  if (w.length < 10) return 0
  const prices = w.map((p) => p.price)
  const m = mean(prices)
  const sd = stddev(prices, m)
  if (sd === 0) return 0
  let cusum = 0
  for (const p of prices.slice(-10)) {
    cusum += (p - m) / sd
  }
  return Math.min(Math.abs(cusum) / 10, 1)
}

function ewmaModel(w: PricePoint[], latest: PricePoint): number {
  if (w.length < 5) return 0
  const alpha = 0.3
  let ewma = w[0].price
  for (const p of w) ewma = alpha * p.price + (1 - alpha) * ewma
  const prices = w.map((p) => p.price)
  const sd = stddev(prices)
  if (sd === 0) return 0
  return Math.min(Math.abs(latest.price - ewma) / (3 * sd), 1)
}

// --- Heuristic models ---

function flashCrashModel(w: PricePoint[], latest: PricePoint): number {
  if (w.length < 2) return 0
  const prev = w[w.length - 1]
  const secsDiff = (latest.timestamp - prev.timestamp) / 1000
  if (secsDiff > 60) return 0
  const pctChange = Math.abs((latest.price - prev.price) / prev.price)
  // >5% in <60s → approaching critical
  return Math.min(pctChange / 0.05, 1)
}

function confidenceDropModel(w: PricePoint[], latest: PricePoint): number {
  if (w.length < 5) return 0
  const prev = w.slice(-5)
  const avgConf = mean(prev.map((p) => p.confidence))
  const drop = avgConf - latest.confidence
  return drop > 0 ? Math.min(drop / 0.3, 1) : 0
}

function staleSourceModel(w: PricePoint[], latest: PricePoint): number {
  if (w.length < 2) return 0
  const prev = w[w.length - 1]
  const minutesStale = (latest.timestamp - prev.timestamp) / 60000
  return minutesStale > 5 ? Math.min((minutesStale - 5) / 10, 1) : 0
}

function oracleManipulationModel(_w: PricePoint[], latest: PricePoint, allCurrentPrices: PricePoint[]): number {
  if (allCurrentPrices.length < 3) return 0
  const prices = allCurrentPrices.map((p) => p.price)
  const m = median(prices)
  const sd = stddev(prices)
  if (sd === 0) return 0
  const devFromMedian = Math.abs(latest.price - m) / sd
  return devFromMedian > 2 ? Math.min((devFromMedian - 2) / 2, 1) : 0
}

// --- Ensemble scoring ---

const MODEL_WEIGHTS: Record<string, number> = {
  zScore: 0.25,
  cusum: 0.15,
  ewma: 0.15,
  flashCrash: 0.2,
  confidenceDrop: 0.1,
  staleSource: 0.05,
  oracleManipulation: 0.1,
}

function severity(score: number): AnomalySeverity {
  if (score >= 0.7) return 'critical'
  if (score >= 0.4) return 'warning'
  return 'info'
}

function describe(type: string, score: number, pair: string): string {
  const map: Record<string, string> = {
    zScore: `Price deviation beyond 3σ on ${pair}`,
    cusum: `Cumulative drift detected on ${pair}`,
    ewma: `EWMA level shift detected on ${pair}`,
    flashCrash: `Rapid price movement on ${pair}`,
    confidenceDrop: `Confidence score dropped on ${pair}`,
    staleSource: `Feed appears stale on ${pair}`,
    oracleManipulation: `Price diverges from oracle median on ${pair}`,
    ensemble: `Multiple anomaly signals on ${pair}`,
  }
  return map[type] ?? `Anomaly detected on ${pair} (score ${score.toFixed(2)})`
}

function shouldSuppress(pair: string, type: string): boolean {
  const pairMap = lastEventTime.get(pair)
  if (!pairMap) return false
  const last = pairMap.get(type)
  if (!last) return false
  return Date.now() - last < DEDUP_WINDOW_MS
}

function recordEvent(pair: string, type: string) {
  if (!lastEventTime.has(pair)) lastEventTime.set(pair, new Map())
  lastEventTime.get(pair)!.set(type, Date.now())
}

export function processDataPoint(
  pair: string,
  latest: PricePoint,
  allCurrentPrices: PricePoint[],
): AnomalyEvent | null {
  const w = getWindow(pair)
  push(pair, latest)

  if (w.length < 5) return null

  const contributions: Record<string, number> = {
    zScore: zScoreModel(w, latest),
    cusum: cusumModel(w),
    ewma: ewmaModel(w, latest),
    flashCrash: flashCrashModel(w, latest),
    confidenceDrop: confidenceDropModel(w, latest),
    staleSource: staleSourceModel(w, latest),
    oracleManipulation: oracleManipulationModel(w, latest, allCurrentPrices),
  }

  const ensembleScore = Object.entries(contributions).reduce(
    (s, [k, v]) => s + v * (MODEL_WEIGHTS[k] ?? 0),
    0,
  )

  // Only emit events for meaningful anomalies
  if (ensembleScore < 0.3) return null

  // Pick dominant model for labelling
  const dominant = Object.entries(contributions).sort((a, b) => b[1] - a[1])[0][0]
  const eventType = ensembleScore >= 0.5 ? 'ensemble' : dominant

  if (shouldSuppress(pair, eventType)) return null
  recordEvent(pair, eventType)

  return {
    id: crypto.randomUUID(),
    assetPair: pair,
    type: eventType,
    severity: severity(ensembleScore),
    score: ensembleScore,
    description: describe(eventType, ensembleScore, pair),
    timestamp: latest.timestamp,
    modelContributions: contributions,
  }
}

export function clearWindow(pair: string) {
  windows.delete(pair)
  lastEventTime.delete(pair)
}
