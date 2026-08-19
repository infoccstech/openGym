import { describe, expect, it } from 'vitest'
import {
  PHASE_TYPES, PERIODIZATION_PRESETS,
  blockWeeks, phaseForWeek, prescribe, prescribeForWeek,
} from './periodization.js'

describe('phase model', () => {
  it('every phase type carries a band, a rep range and a cue', () => {
    for (const t of Object.values(PHASE_TYPES)) {
      expect(t.pct1rm).toHaveLength(2)
      expect(t.pct1rm[0]).toBeLessThan(t.pct1rm[1])
      expect(t.reps).toHaveLength(2)
      expect(typeof t.cue).toBe('string')
    }
  })
  it('the linear preset spans 9 contiguous weeks', () => {
    expect(blockWeeks(PERIODIZATION_PRESETS.linear9)).toBe(9)
  })
})

describe('phaseForWeek', () => {
  const block = PERIODIZATION_PRESETS.linear9
  it('maps a week to the phase that covers it', () => {
    expect(phaseForWeek(block, 1).type).toBe('anatomical')
    expect(phaseForWeek(block, 5).type).toBe('hypertrophy')
    expect(phaseForWeek(block, 8).type).toBe('strength')
    expect(phaseForWeek(block, 9).type).toBe('deload')
  })
  it('is null outside the block', () => {
    expect(phaseForWeek(block, 0)).toBeNull()
    expect(phaseForWeek(block, 99)).toBeNull()
  })
})

describe('prescription', () => {
  it('turns a band into a load range at the plate step', () => {
    expect(prescribe(100, [70, 80], 2.5)).toEqual({ low: 70, high: 80, pct: [70, 80] })
  })
  it('prescribeForWeek reads the phase then the load', () => {
    const p = prescribeForWeek(PERIODIZATION_PRESETS.linear9, 8, 120)
    expect(p.phase.type).toBe('strength')
    expect(p.low).toBeGreaterThan(0)
    expect(p.high).toBeGreaterThan(p.low)
    expect(p.high).toBeLessThanOrEqual(120)   // never above the max within the block
  })
  it('is null off-block', () => {
    expect(prescribeForWeek(PERIODIZATION_PRESETS.linear9, 20, 120)).toBeNull()
  })
  it('a higher 1RM prescribes proportionally heavier loads', () => {
    const a = prescribeForWeek(PERIODIZATION_PRESETS.linear9, 5, 100)
    const b = prescribeForWeek(PERIODIZATION_PRESETS.linear9, 5, 140)
    expect(b.low).toBeGreaterThan(a.low)
  })
})
