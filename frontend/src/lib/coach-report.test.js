import { describe, expect, it } from 'vitest'
import { buildDemoState } from './demoSeed.js'
import { buildClientReport } from './coach-report.js'

const S = buildDemoState()

describe('buildClientReport', () => {
  it('summarizes bodyweight, workouts and bests from real state', () => {
    const r = buildClientReport(S, { name: 'Ana', at: '2026-08-19' })
    expect(r.opengym_report_body).toBe(1)
    expect(r.name).toBe('Ana')
    expect(r.generatedAt).toBe('2026-08-19')
    expect(r.workouts.count).toBeGreaterThan(0)
    expect(r.workouts.recent.length).toBeGreaterThan(0)
    expect(r.workouts.recent.length).toBeLessThanOrEqual(8)
    for (const b of r.bests) {
      expect(b.name).toBeTruthy()
      expect(b.best >= 0).toBe(true)
    }
  })
  it('is JSON round-trippable — this is exactly what the crypto layer encrypts', () => {
    const r = buildClientReport(S, { at: '2026-08-19' })
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })
  it('handles empty state without throwing', () => {
    const r = buildClientReport({}, { at: '2026-08-19' })
    expect(r.workouts.count).toBe(0)
    expect(r.bests).toEqual([])
    expect(r.bodyweight).toBeNull()
  })
})
