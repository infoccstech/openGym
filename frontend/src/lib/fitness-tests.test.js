import { describe, expect, it } from 'vitest'
import {
  cooperVO2max, legerSpeed, legerVO2max, rockportVO2max,
  epley, brzycki, lombardi, oneRepMax, loadForPct, pct1rmTable,
  jacksonPollock, bodyFatFromDensity, yuhaszBodyFat, bodyComposition, waistHipRatio,
} from './fitness-tests.js'

describe('VO2max', () => {
  it('Cooper — 2400 m in 12 min', () => {
    expect(cooperVO2max(2400)).toBeCloseTo(42.4, 1)
  })
  it('Cooper — non-positive distance is 0', () => {
    expect(cooperVO2max(0)).toBe(0)
    expect(cooperVO2max(-5)).toBe(0)
  })
  it('Léger — stage speed steps 0.5 km/h from 8.0', () => {
    expect(legerSpeed(1)).toBe(8)
    expect(legerSpeed(8)).toBe(11.5)
  })
  it('Léger — stage 8, age 20', () => {
    expect(legerVO2max({ stage: 8, ageYears: 20 })).toBeCloseTo(38.6, 1)
  })
  it('Rockport — 70 kg male, 13 min, HR 140', () => {
    const v = rockportVO2max({ weightKg: 70, ageYears: 30, sex: 'male', timeMin: 13, hrBpm: 140 })
    expect(v).toBeGreaterThan(45)
    expect(v).toBeCloseTo(51.3, 0)
  })
  it('a fitter walk (faster, lower HR) reads higher', () => {
    const slow = rockportVO2max({ weightKg: 70, ageYears: 30, sex: 'male', timeMin: 16, hrBpm: 160 })
    const fast = rockportVO2max({ weightKg: 70, ageYears: 30, sex: 'male', timeMin: 13, hrBpm: 130 })
    expect(fast).toBeGreaterThan(slow)
  })
})

describe('one-rep max', () => {
  it('Epley 100×5 ≈ 116.7', () => expect(epley(100, 5)).toBeCloseTo(116.67, 1))
  it('Brzycki 100×5 = 112.5', () => expect(brzycki(100, 5)).toBeCloseTo(112.5, 1))
  it('Lombardi 100×5 ≈ 117.5', () => expect(lombardi(100, 5)).toBeCloseTo(117.46, 1))
  it('a single rep returns the load itself, whatever the formula', () => {
    expect(oneRepMax(140, 1)).toBe(140)
    expect(oneRepMax(140, 1, 'brzycki')).toBe(140)
  })
  it('dispatcher rounds to 0.5 and honours the formula choice', () => {
    expect(oneRepMax(100, 5, 'brzycki')).toBe(112.5)
    expect(oneRepMax(100, 5, 'epley')).toBe(116.5)
  })
  it('non-positive weight is 0', () => expect(oneRepMax(0, 5)).toBe(0))
  it('more reps at the same load implies a higher estimated max', () => {
    expect(oneRepMax(100, 8)).toBeGreaterThan(oneRepMax(100, 3))
  })
})

describe('%1RM prescription', () => {
  it('rounds the working load to the plate step', () => {
    expect(loadForPct(100, 80)).toBe(80)
    expect(loadForPct(102.5, 80, 2.5)).toBe(82.5)
  })
  it('builds a 40–100% table', () => {
    const t = pct1rmTable(100)
    expect(t[40]).toBe(40)
    expect(t[100]).toBe(100)
    expect(Object.keys(t)).toHaveLength(13)
  })
})

describe('body composition', () => {
  it('Jackson-Pollock 3-site (male) → density and body-fat %', () => {
    const r = jacksonPollock({ sex: 'male', ageYears: 25, sites: { chest: 12, abdomen: 20, thigh: 18 } })
    expect(r.sum).toBe(50)
    expect(r.density).toBeCloseTo(1.0656, 3)
    expect(r.bodyFatPct).toBeCloseTo(14.5, 0)
  })
  it('thicker skinfolds read as more fat', () => {
    const lean = jacksonPollock({ sex: 'male', ageYears: 25, sites: { chest: 8, abdomen: 10, thigh: 9 } })
    const fat = jacksonPollock({ sex: 'male', ageYears: 25, sites: { chest: 20, abdomen: 30, thigh: 25 } })
    expect(fat.bodyFatPct).toBeGreaterThan(lean.bodyFatPct)
  })
  it('Siri vs Brozek from a known density', () => {
    expect(bodyFatFromDensity(1.05, 'siri')).toBeCloseTo(21.4, 1)
    expect(bodyFatFromDensity(1.05, 'brozek')).toBeCloseTo(21.0, 1)
  })
  it('Yuhasz 6-site rises with the sum and differs by sex', () => {
    const men = yuhaszBodyFat({ sex: 'male', sites: { a: 10, b: 10, c: 10, d: 10, e: 10, f: 10 } })
    const women = yuhaszBodyFat({ sex: 'female', sites: { a: 10, b: 10, c: 10, d: 10, e: 10, f: 10 } })
    expect(men).toBeCloseTo(8.9, 1)
    expect(women).toBeGreaterThan(men)
  })
  it('splits body mass into fat and lean kg', () => {
    expect(bodyComposition(80, 20)).toEqual({ fatKg: 16, leanKg: 64 })
  })
  it('waist-to-hip ratio', () => {
    expect(waistHipRatio(80, 100)).toBe(0.8)
    expect(waistHipRatio(80, 0)).toBe(0)
  })
})
