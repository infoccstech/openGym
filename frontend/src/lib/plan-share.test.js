import { describe, expect, it } from 'vitest'
import { mergePlan } from './plan-share.js'

// Minimal draft state, the shape store.update hands to mergePlan.
const draft = () => ({ routines: [], week: {}, customEx: [] })

// A parsed bundle (parsePlan's output shape) with one routine and one exercise.
const bundle = () => ({
  name: 'Push day',
  routines: [{ id: 'r1', name: 'Push day', emoji: 'dumbbell', prog: 'double', ex: [{ id: 'ex1', sets: 3, reps: 8 }] }],
  week: {},
  customEx: [],
})

describe('mergePlan — coach read-only stamp', () => {
  it('a friend import (no coach) stays fully editable', () => {
    const s = draft()
    mergePlan(s, bundle())
    expect(s.routines).toHaveLength(1)
    const r = s.routines[0]
    expect(r.locked).toBeUndefined()
    expect(r.coach).toBeUndefined()
    // Fresh id, not the bundle's — importing never overwrites an existing routine.
    expect(r.id).not.toBe('r1')
    expect(r.name).toBe('Push day')
    expect(r.prog).toBe('double')
    expect(r.ex).toHaveLength(1)
  })

  it('a verified coach plan is stamped locked with the coach identity', () => {
    const s = draft()
    const coach = { code: 'CGX-ABCD-EFGH', name: 'Coach Rui' }
    mergePlan(s, bundle(), { coach })
    const r = s.routines[0]
    expect(r.locked).toBe(true)
    expect(r.coach).toEqual(coach)
    // The prescription itself is untouched — the stamp rides alongside it.
    expect(r.name).toBe('Push day')
    expect(r.ex[0]).toMatchObject({ sets: 3, reps: 8 })
  })

  it('the schedule option is independent of the coach stamp', () => {
    const s = draft()
    const b = bundle()
    b.week = { 1: 'r1' }   // Monday → the shared routine
    const coach = { code: 'CGX-0000-0000', name: '' }
    mergePlan(s, b, { schedule: true, coach })
    const r = s.routines[0]
    expect(r.locked).toBe(true)
    // The week now points at the freshly-minted routine id, not the bundle's original.
    expect(s.week[1]).toBe(r.id)
  })
})
