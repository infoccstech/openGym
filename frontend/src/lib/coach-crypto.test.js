import { beforeAll, describe, expect, it } from 'vitest'
import {
  generateIdentity, publicIdentity, coachCode, canonical,
  signPlan, verifyPlan, encryptReport, decryptReport,
  exportRecovery, importRecovery,
} from './coach-crypto.js'

let coach, other
beforeAll(async () => {
  coach = await generateIdentity()
  other = await generateIdentity()
})

const SAMPLE_PLAN = { opengym_plan: 1, routines: [{ id: 'r', name: 'Push', ex: [{ id: '0025', sets: 4, reps: 6 }] }], week: {} }

describe('identity & coach code', () => {
  it('generates an ECDSA signing pair and an ECDH box pair', () => {
    expect(coach.sign.priv.kty).toBe('EC')
    expect(coach.sign.priv.crv).toBe('P-256')
    expect(coach.sign.priv.d).toBeTruthy()
    expect(coach.box.priv.d).toBeTruthy()
  })
  it('publicIdentity strips the private scalars', () => {
    const pub = publicIdentity(coach)
    expect(pub.sign_pub.d).toBeUndefined()
    expect(pub.box_pub.d).toBeUndefined()
    expect(pub.sign_pub.x).toBeTruthy()
  })
  it('coach code is deterministic and well-formed', async () => {
    const a = await coachCode(coach.sign.pub)
    const b = await coachCode(coach.sign.pub)
    expect(a).toBe(b)
    expect(a).toMatch(/^CGX-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(await coachCode(other.sign.pub)).not.toBe(a)
  })
})

describe('canonical JSON', () => {
  it('is stable regardless of key order', () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }))
    expect(canonical({ a: [{ y: 1, x: 2 }] })).toBe('{"a":[{"x":2,"y":1}]}')
  })
})

describe('signed plan (coach → client)', () => {
  it('round-trips: a genuine plan verifies and yields the plan back', async () => {
    const bundle = await signPlan(SAMPLE_PLAN, coach, { name: 'Coach D' })
    const r = await verifyPlan(bundle)
    expect(r.valid).toBe(true)
    expect(r.plan).toEqual(SAMPLE_PLAN)
    expect(r.coachCode).toMatch(/^CGX-/)
  })
  it('detects a tampered plan (the "cannot edit" guarantee)', async () => {
    const bundle = await signPlan(SAMPLE_PLAN, coach)
    bundle.plan.routines[0].ex[0].reps = 20   // client tries to change the prescription
    const r = await verifyPlan(bundle)
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/altered|invalid/)
  })
  it('detects a forged coach code', async () => {
    const bundle = await signPlan(SAMPLE_PLAN, coach)
    bundle.coach.code = 'CGX-0000-0000'
    const r = await verifyPlan(bundle)
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/does not match/)
  })
  it('binds to the paired coach via expectedCode', async () => {
    const bundle = await signPlan(SAMPLE_PLAN, coach)
    const code = await coachCode(coach.sign.pub)
    expect((await verifyPlan(bundle, { expectedCode: code })).valid).toBe(true)
    expect((await verifyPlan(bundle, { expectedCode: 'CGX-9999-9999' })).valid).toBe(false)
  })
})

describe('encrypted report (client → coach)', () => {
  const REPORT = { workouts: 12, best: { bench: 100 }, soreness: 'hombro derecho', rpe: 8 }

  it('only the destination coach can read it', async () => {
    const env = await encryptReport(REPORT, publicIdentity(coach), 'CGX-TEST')
    expect(env.opengym_report).toBe(1)
    expect(env.ct).toBeTruthy()
    const back = await decryptReport(env, coach)
    expect(back).toEqual(REPORT)
  })
  it('a different coach cannot decrypt it', async () => {
    const env = await encryptReport(REPORT, publicIdentity(coach))
    await expect(decryptReport(env, other)).rejects.toThrow()
  })
  it('rejects non-report input', async () => {
    await expect(decryptReport({ nope: true }, coach)).rejects.toThrow()
  })
})

describe('recovery', () => {
  it('exports and re-imports the full identity', () => {
    const code = exportRecovery(coach)
    expect(code.startsWith('OGCOACH1.')).toBe(true)
    expect(importRecovery(code)).toEqual(coach)
  })
  it('rejects a bad recovery code', () => {
    expect(() => importRecovery('garbage')).toThrow()
  })
})
