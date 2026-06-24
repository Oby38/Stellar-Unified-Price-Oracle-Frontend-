// #117 — Self-healing engine with circuit breaker

export type HealingAction = 'reconnect-ws' | 'refetch-state' | 'reload-page'

interface CircuitBreaker {
  failures: number
  lastFailure: number
  open: boolean
}

const breakers = new Map<HealingAction, CircuitBreaker>()
const FAILURE_THRESHOLD = 5
const COOLDOWN_MS = 60_000

function getBreaker(action: HealingAction): CircuitBreaker {
  if (!breakers.has(action)) {
    breakers.set(action, { failures: 0, lastFailure: 0, open: false })
  }
  return breakers.get(action)!
}

function isCircuitOpen(action: HealingAction): boolean {
  const b = getBreaker(action)
  if (!b.open) return false
  if (Date.now() - b.lastFailure > COOLDOWN_MS) {
    b.open = false // half-open
    b.failures = 0
    return false
  }
  return true
}

function recordSuccess(action: HealingAction) {
  const b = getBreaker(action)
  b.failures = 0
  b.open = false
}

function recordFailure(action: HealingAction) {
  const b = getBreaker(action)
  b.failures += 1
  b.lastFailure = Date.now()
  if (b.failures >= FAILURE_THRESHOLD) b.open = true
}

export interface HealingRecord {
  action: HealingAction
  timestamp: number
  success: boolean
  reason: string
}

const history: HealingRecord[] = []

export function getHealingHistory(): HealingRecord[] {
  return history
}

type Handlers = {
  reconnectWs?: () => void
  refetchState?: () => void
}

export function attemptHealing(action: HealingAction, reason: string, handlers: Handlers): boolean {
  if (isCircuitOpen(action)) {
    console.warn(`[healing] Circuit open for ${action}, skipping`)
    return false
  }

  let success = false

  try {
    if (action === 'reconnect-ws' && handlers.reconnectWs) {
      handlers.reconnectWs()
      success = true
    } else if (action === 'refetch-state' && handlers.refetchState) {
      handlers.refetchState()
      success = true
    } else if (action === 'reload-page') {
      // Last resort — only if circuit hasn't fired yet
      if (getBreaker(action).failures === 0) {
        success = true
        // Defer to give React a chance to clean up
        setTimeout(() => window.location.reload(), 500)
      }
    }
  } catch {
    success = false
  }

  if (success) recordSuccess(action)
  else recordFailure(action)

  history.unshift({ action, timestamp: Date.now(), success, reason })
  if (history.length > 50) history.length = 50

  return success
}

export function getCircuitStatus(): Record<HealingAction, { open: boolean; failures: number }> {
  const actions: HealingAction[] = ['reconnect-ws', 'refetch-state', 'reload-page']
  return Object.fromEntries(
    actions.map((a) => {
      const b = getBreaker(a)
      return [a, { open: b.open, failures: b.failures }]
    }),
  ) as Record<HealingAction, { open: boolean; failures: number }>
}
