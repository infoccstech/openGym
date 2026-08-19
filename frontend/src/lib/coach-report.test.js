import { describe, expect, it } from 'vitest'
import { buildDemoState } from './demoSeed.js'
import { buildClientReport, clientReportHTML } from './coach-report.js'

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

describe('clientReportHTML', () => {
  const report = buildClientReport(S, { name: 'Ana', at: '2026-08-19' })
  const client = { name: 'Ana', at: '2026-08-19', report }

  it('renders a self-contained HTML document branded for the coach', () => {
    const html = clientReportHTML(client, { coachName: 'Coach D', accent: '#84cc16' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Ana')
    expect(html).toContain('Coach D')
    expect(html).toContain('progress report')
    expect(html).toContain('Recent sessions')
  })
  it('escapes user text (no injection through a name)', () => {
    const html = clientReportHTML({ name: '<script>x</script>', at: '2026-08-19', report }, {})
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;')
  })
  it('degrades gracefully with an empty report', () => {
    const html = clientReportHTML({ name: 'Nobody', at: '2026-08-19', report: {} }, {})
    expect(html).toContain('No sessions logged.')
  })
})
