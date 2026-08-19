// Heart-rate training zones — the cardio counterpart to the strength dosing, pairing with the
// VO2max tests in fitness-tests.js. Pure, dependency-free, Node-safe.
//
// A coach estimates max HR, then prescribes cardio by zone: either off %HRmax, or off heart-rate
// reserve (Karvonen), which accounts for resting HR and tracks effort better for fitter clients.

const round = v => Math.round(v)

/** Maximum-heart-rate estimators. Pick by client profile; Tanaka is the modern default. */
export const MAXHR_METHODS = {
  fox: { label: 'Fox (220 − edad)', fn: a => 220 - a },
  tanaka: { label: 'Tanaka (208 − 0.7·edad)', fn: a => 208 - 0.7 * a },
  gulati: { label: 'Gulati (mujeres, 206 − 0.88·edad)', fn: a => 206 - 0.88 * a },
}

/**
 * Estimated maximum heart rate.
 * @param {number} ageYears
 * @param {'fox'|'tanaka'|'gulati'} [method='tanaka']
 * @returns {number} bpm, rounded.
 */
export function maxHR(ageYears, method = 'tanaka') {
  const a = Number(ageYears)
  if (!(a > 0)) return 0
  const m = MAXHR_METHODS[method] || MAXHR_METHODS.tanaka
  return round(m.fn(a))
}

// The conventional five-zone model, worst→best effort, each a percentage band.
const ZONES = [
  { z: 1, name: 'Recuperación', band: [50, 60] },
  { z: 2, name: 'Aeróbico base', band: [60, 70] },
  { z: 3, name: 'Aeróbico / Tempo', band: [70, 80] },
  { z: 4, name: 'Umbral', band: [80, 90] },
  { z: 5, name: 'VO₂máx / Anaeróbico', band: [90, 100] },
]

/**
 * Zones as a percentage of max HR — the quick method (only needs max HR).
 * @param {number} maxHRbpm
 * @returns {Array<{z:number,name:string,pct:[number,number],from:number,to:number}>}
 */
export function hrMaxZones(maxHRbpm) {
  const hm = Number(maxHRbpm)
  return ZONES.map(zn => ({
    z: zn.z, name: zn.name, pct: zn.band,
    from: round(hm * zn.band[0] / 100),
    to: round(hm * zn.band[1] / 100),
  }))
}

/**
 * Zones by heart-rate reserve (Karvonen): target = rest + %HRR·(max − rest). Better for fitter
 * clients because it factors in resting HR.
 * @param {number} maxHRbpm
 * @param {number} restHRbpm
 * @returns {Array<{z:number,name:string,pct:[number,number],from:number,to:number}>}
 */
export function karvonenZones(maxHRbpm, restHRbpm) {
  const hm = Number(maxHRbpm)
  const hr = Number(restHRbpm)
  const reserve = hm - hr
  if (!(reserve > 0)) return []
  return ZONES.map(zn => ({
    z: zn.z, name: zn.name, pct: zn.band,
    from: round(hr + reserve * zn.band[0] / 100),
    to: round(hr + reserve * zn.band[1] / 100),
  }))
}
