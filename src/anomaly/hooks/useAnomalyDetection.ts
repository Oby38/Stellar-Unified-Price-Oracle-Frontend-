import { useCallback, useEffect, useRef, useState } from 'react'
import { processDataPoint, type AnomalyEvent } from '../engine/AnomalyEngine'
import type { PriceData } from '../../types'

const MAX_EVENTS = 200

export function useAnomalyDetection(prices: PriceData[]) {
  const [events, setEvents] = useState<AnomalyEvent[]>([])
  const prevPricesRef = useRef<Map<string, PriceData>>(new Map())

  useEffect(() => {
    if (prices.length === 0) return

    const allCurrentPoints = prices.map((p) => ({
      price: p.price,
      confidence: p.confidence,
      timestamp: p.timestamp,
      sources: p.sources,
    }))

    const newEvents: AnomalyEvent[] = []

    for (const price of prices) {
      const prev = prevPricesRef.current.get(price.assetPair)
      // Only process if timestamp changed (new data arrived)
      if (prev && prev.timestamp === price.timestamp) continue

      const event = processDataPoint(
        price.assetPair,
        {
          price: price.price,
          confidence: price.confidence,
          timestamp: price.timestamp,
          sources: price.sources,
        },
        allCurrentPoints,
      )

      if (event) newEvents.push(event)
    }

    // Update previous prices ref
    for (const p of prices) {
      prevPricesRef.current.set(p.assetPair, p)
    }

    if (newEvents.length > 0) {
      setEvents((prev) => {
        const combined = [...newEvents, ...prev]
        return combined.slice(0, MAX_EVENTS)
      })
    }
  }, [prices])

  const markFalsePositive = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isFalsePositive: true } : e))
    )
  }, [])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, markFalsePositive, clearEvents }
}
