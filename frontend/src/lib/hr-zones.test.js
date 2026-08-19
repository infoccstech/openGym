import { describe, expect, it } from 'vitest'
import { maxHR, hrMaxZones, karvonenZones } from './hr-zones.js'

describe('maxHR', () => {
  it('Fox / Tanaka / Gulati at age 30', () => {
    expect(maxHR(30, 'fox')).toBe(190)
    expect(maxHR(30, 'tanaka')).toBe(187)   // 208 − 21
    expect(maxHR(30, 'gulati')).toBe(180)   // 206 − 26.4 → 180
  })
  it('defaults to Tanaka and rejects bad input', () => {
    expect(maxHR(40)).toBe(maxHR(40, 'tanaka'))
    expect(maxHR(0)).toBe(0)
  })
})

describe('%HRmax zones', () => {
  const z = hrMaxZones(190)
  it('gives five ordered zones topping out at max HR', () => {
    expect(z).toHaveLength(5)
    expect(z[0].z).toBe(1)
    expect(z[4].to).toBe(190)
    expect(z[0].from).toBe(95)   // 50%
    for (let i = 1; i < z.length; i++) expect(z[i].from).toBeGreaterThanOrEqual(z[i - 1].from)
  })
})

describe('Karvonen (heart-rate reserve) zones', () => {
  const z = karvonenZones(190, 60)   // reserve 130
  it('anchors to resting HR and reaches max at the top', () => {
    expect(z).toHaveLength(5)
    expect(z[0].from).toBe(125)   // 60 + 0.50·130
    expect(z[4].to).toBe(190)     // 60 + 1.00·130
  })
  it('sits above the plain %HRmax zones for the same client (rest HR factored in)', () => {
    const karv = karvonenZones(190, 60)[1].from
    const plain = hrMaxZones(190)[1].from
    expect(karv).toBeGreaterThan(plain)
  })
  it('is empty when the reserve is non-positive', () => {
    expect(karvonenZones(150, 160)).toEqual([])
  })
})
