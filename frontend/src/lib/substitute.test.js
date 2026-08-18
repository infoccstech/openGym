import { describe, expect, it } from 'vitest'
import { EXIDX, EXDB } from './exercises.js'
import { musclesOf } from './muscles.js'
import { primaryMuscle, similarity, substitutesFor } from './substitute.js'

const BENCH = '0025'   // barbell bench press — chest 1, triceps .4, deltoids .4
const SQUAT = '0043'   // barbell full squat — gluteal 1, quads/hams/calves/abs .4
const ROW = '0027'     // barbell bent over row — upper-back 1, biceps/forearm/deltoids .4

describe('primaryMuscle', () => {
  it('is the target the exercise trains hardest', () => {
    expect(primaryMuscle(EXIDX[BENCH])).toBe('chest')
    expect(primaryMuscle(EXIDX[SQUAT])).toBe('gluteal')
  })
})

describe('similarity', () => {
  it('is 1 for an exercise with itself', () => {
    expect(similarity(EXIDX[BENCH], EXIDX[BENCH])).toBeCloseTo(1)
  })
  it('is 0 when they share no muscles', () => {
    expect(similarity(EXIDX[BENCH], EXIDX[SQUAT])).toBe(0)
  })
  it('is between 0 and 1 when they overlap partially', () => {
    const s = similarity(EXIDX[BENCH], EXIDX[ROW])   // share deltoids only
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('substitutesFor', () => {
  it('never returns the original exercise', () => {
    expect(substitutesFor(BENCH).some(e => e.id === BENCH)).toBe(false)
  })

  it('only returns exercises that still train the original primary muscle', () => {
    const subs = substitutesFor(BENCH)
    expect(subs.length).toBeGreaterThan(0)
    for (const e of subs) expect(musclesOf(e).chest > 0).toBe(true)
  })

  it('restricts to the equipment you have — the "no machine" case', () => {
    const subs = substitutesFor(BENCH, { equipment: 'body weight' })
    expect(subs.length).toBeGreaterThan(0)
    for (const e of subs) expect(e.eq).toBe('body weight')
  })

  it('accepts a list of available equipment', () => {
    const subs = substitutesFor(BENCH, { equipment: ['dumbbell', 'body weight'] })
    expect(subs.length).toBeGreaterThan(0)
    for (const e of subs) expect(['dumbbell', 'body weight']).toContain(e.eq)
  })

  it('trains around a sore muscle — avoid drops anything that loads it', () => {
    const subs = substitutesFor(BENCH, { avoid: 'deltoids' })
    for (const e of subs) expect(musclesOf(e).deltoids || 0).toBeLessThan(0.4)
  })

  it('avoidThreshold 1 only drops candidates whose primary is the sore muscle', () => {
    const subs = substitutesFor(BENCH, { avoid: 'deltoids', avoidThreshold: 1 })
    for (const e of subs) expect(musclesOf(e).deltoids || 0).toBeLessThan(1)
  })

  it('respects the limit', () => {
    expect(substitutesFor(BENCH, { limit: 3 }).length).toBeLessThanOrEqual(3)
  })

  it('does not offer cardio as a swap for a strength lift', () => {
    for (const e of substitutesFor(BENCH)) expect(e.bp).not.toBe('cardio')
  })

  it('returns nothing for an unknown id', () => {
    expect(substitutesFor('not-a-real-id')).toEqual([])
  })

  it('can search a pool that includes the user’s own exercises', () => {
    const custom = { id: 'c1', n: 'my chest thing', bp: 'chest' }   // bp-only → chest via body part
    const subs = substitutesFor(BENCH, { pool: [EXIDX[BENCH], custom, EXIDX[SQUAT]] })
    expect(subs.some(e => e.id === 'c1')).toBe(true)   // a chest custom is a valid chest swap
    expect(subs.some(e => e.id === SQUAT)).toBe(false) // a squat is not
  })
})
