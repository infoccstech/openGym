import { describe, expect, it } from 'vitest'
import { buildAiPrompt, parseAiPlan } from './ai-plan.js'
import { EXIDX } from './exercises.js'

describe('buildAiPrompt', () => {
  it('is a self-contained brief with the JSON contract and the unit', () => {
    const p = buildAiPrompt({ unit: 'lb' })
    expect(p).toContain('"routines"')
    expect(p).toContain('"week"')
    expect(p).toContain('Weight unit: lb')
    expect(p).toContain('barbell bench press')   // steers the model toward matchable names
  })
})

describe('parseAiPlan', () => {
  const plan = {
    name: 'My Plan',
    routines: [
      { name: 'Push', exercises: [
        { name: 'bench press', sets: 4, reps: 6 },
        { name: 'overhead press', sets: 3, reps: 8 },
      ] },
      { name: 'Legs', exercises: [
        { name: 'squat', sets: 5, reps: 5 },
      ] },
    ],
    week: { Monday: 'Push', Thursday: 'Legs' },
  }

  it('resolves common names to library ids', () => {
    const b = parseAiPlan(JSON.stringify(plan))
    expect(b.routineCount).toBe(2)
    expect(b.exerciseCount).toBe(3)
    expect(b.routines[0].ex[0].id).toBe('0025')   // bench press
    expect(b.routines[1].ex[0].id).toBe('0043')   // squat
    for (const r of b.routines) for (const e of r.ex) expect(e.sets).toBeGreaterThan(0)
  })

  it('maps the weekly schedule from day names to routine ids', () => {
    const b = parseAiPlan(JSON.stringify(plan))
    const push = b.routines.find(r => r.name === 'Push')
    const legs = b.routines.find(r => r.name === 'Legs')
    expect(b.week[1]).toBe(push.id)   // Monday
    expect(b.week[4]).toBe(legs.id)   // Thursday
    expect(b.scheduledDays).toBe(2)
  })

  it('turns an unrecognised name into a carried custom exercise, never dropping it', () => {
    const b = parseAiPlan(JSON.stringify({
      routines: [{ name: 'A', exercises: [{ name: 'Zercher Zombie Press 3000', sets: 3, reps: 10, bodyPart: 'chest' }] }],
    }))
    expect(b.dropped).toBe(0)
    expect(b.unmatched).toContain('Zercher Zombie Press 3000')
    expect(b.customEx.length).toBe(1)
    expect(b.customEx[0].bp).toBe('chest')
    // the routine references the carried custom's id, so mergePlan keeps it
    expect(b.routines[0].ex[0].id).toBe(b.customEx[0].id)
  })

  it('tolerates a ```json fence and surrounding prose', () => {
    const wrapped = 'Sure! Here is your plan:\n```json\n' + JSON.stringify(plan) + '\n```\nEnjoy your training!'
    const b = parseAiPlan(wrapped)
    expect(b.routineCount).toBe(2)
    expect(b.routines[0].ex[0].id).toBe('0025')
  })

  it('reads cardio and timed exercises into the right shape', () => {
    const b = parseAiPlan(JSON.stringify({
      routines: [{ name: 'Mix', exercises: [
        { name: 'plank', sets: 3, seconds: 45 },
        { name: 'treadmill', sets: 1, minutes: 20, speed: 9 },
      ] }],
    }))
    const [held, run] = b.routines[0].ex
    expect(held.mode).toBe('time')
    expect(held.sec).toBe(45)
    const treadmill = EXIDX[run.id]
    expect(treadmill.bp).toBe('cardio')
    expect(run.min).toBe(20)
    expect(run.speed).toBe(9)
  })

  it('clamps out-of-range set counts instead of trusting the model', () => {
    const b = parseAiPlan(JSON.stringify({
      routines: [{ name: 'A', exercises: [{ name: 'squat', sets: 999, reps: 8 }] }],
    }))
    expect(b.routines[0].ex[0].sets).toBeLessThanOrEqual(20)
  })

  it('throws a friendly error on text with no plan', () => {
    expect(() => parseAiPlan('sorry, I can’t help with that')).toThrow()
    expect(() => parseAiPlan('{}')).toThrow()
    expect(() => parseAiPlan('')).toThrow()
  })
})
