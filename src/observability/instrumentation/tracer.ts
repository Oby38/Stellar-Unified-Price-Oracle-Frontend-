// #117 — Instrumentation layer
// OpenTelemetry-compatible span model; zero-dep, tree-shaken in prod via DEV guard.

export interface Span {
  traceId: string
  spanId: string
  parentId?: string
  name: string
  startTime: number
  endTime?: number
  attributes: Record<string, string | number | boolean>
  status: 'ok' | 'error'
  error?: string
}

export interface Metric {
  name: string
  value: number
  timestamp: number
  labels?: Record<string, string>
}

class Tracer {
  private spans: Span[] = []
  private readonly maxSpans = 1000

  startSpan(name: string, attributes: Span['attributes'] = {}, parentId?: string): Span {
    const span: Span = {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID(),
      parentId,
      name,
      startTime: performance.now(),
      attributes,
      status: 'ok',
    }
    return span
  }

  endSpan(span: Span, error?: Error): void {
    span.endTime = performance.now()
    if (error) {
      span.status = 'error'
      span.error = error.message
    }
    this.spans.unshift(span)
    if (this.spans.length > this.maxSpans) this.spans.length = this.maxSpans
  }

  getSpans(): Span[] {
    return this.spans
  }

  clear(): void {
    this.spans = []
  }
}

class MetricsCollector {
  private metrics: Metric[] = []
  private readonly maxMetrics = 5000

  record(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.unshift({ name, value, timestamp: Date.now(), labels })
    if (this.metrics.length > this.maxMetrics) this.metrics.length = this.maxMetrics
  }

  getAll(): Metric[] {
    return this.metrics
  }

  getLatest(name: string): Metric | undefined {
    return this.metrics.find((m) => m.name === name)
  }

  clear(): void {
    this.metrics = []
  }
}

export const tracer = new Tracer()
export const metrics = new MetricsCollector()

// Convenience wrapper: times an async fn and records a span
export async function traced<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Span['attributes'],
): Promise<T> {
  const span = tracer.startSpan(name, attributes)
  try {
    const result = await fn(span)
    tracer.endSpan(span)
    return result
  } catch (err) {
    tracer.endSpan(span, err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
