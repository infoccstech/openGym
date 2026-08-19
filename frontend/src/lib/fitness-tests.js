// Physical-evaluation math for the coaching module — the base metrics a trainer programs from.
//
// Pure, deterministic, dependency-free functions: VO2max estimates, one-rep-max formulas and
// %1RM prescription, and body-composition from skinfolds. Node-safe (plain arithmetic, no Vite
// or DOM), tested next to this file. Every formula names its source and its units so a coach
// can trust the number and a reviewer can check it.
//
// Units are explicit and SI-leaning: distances in metres, body mass in kilograms, skinfolds in
// millimetres, time in minutes. The two formulas that are defined in imperial units (Rockport)
// convert internally so the caller always passes kg.

const round = (v, step = 0.01) => Math.round(v / step) * step
const clampReps = r => Math.max(1, Math.min(36, Number(r) || 0))

/* ============================ VO2max (aerobic capacity) ============================ */

/**
 * Estimated VO2max from the Cooper 12-minute test.
 * @param {number} distanceM Distance covered in 12 minutes, in metres.
 * @returns {number} VO2max in ml·kg⁻¹·min⁻¹. Cooper (1968): (d − 504.9) / 44.73.
 */
export function cooperVO2max(distanceM) {
  const d = Number(distanceM)
  if (!(d > 0)) return 0
  return round((d - 504.9) / 44.73, 0.1)
}

// The 20 m shuttle run (Léger / beep test) numbers each stage by its running speed: stage 1 is
// 8.0 km/h and every stage adds 0.5 km/h.
export const legerSpeed = stage => 8 + 0.5 * (Math.max(1, Number(stage) || 1) - 1)

/**
 * Estimated VO2max from the Léger 20 m shuttle run (beep test).
 * @param {object} p
 * @param {number} p.stage Last fully completed stage (1-based).
 * @param {number} p.ageYears Age in years.
 * @returns {number} VO2max in ml·kg⁻¹·min⁻¹. Léger et al. (1988):
 *   31.025 + 3.238·v − 3.248·a + 0.1536·a·v, with v the stage speed in km/h.
 */
export function legerVO2max({ stage, ageYears }) {
  const v = legerSpeed(stage)
  const a = Number(ageYears)
  if (!(a > 0)) return 0
  return round(31.025 + 3.238 * v - 3.248 * a + 0.1536 * a * v, 0.1)
}

/**
 * Estimated VO2max from the Rockport 1-mile walk test.
 * @param {object} p
 * @param {number} p.weightKg Body mass in kilograms (converted to lb internally).
 * @param {number} p.ageYears Age in years.
 * @param {'male'|'female'} p.sex Biological sex used by the equation (male = 1, female = 0).
 * @param {number} p.timeMin Time to walk one mile, in minutes.
 * @param {number} p.hrBpm Heart rate at the end of the mile, in beats per minute.
 * @returns {number} VO2max in ml·kg⁻¹·min⁻¹. Kline et al. (1987), weight in pounds.
 */
export function rockportVO2max({ weightKg, ageYears, sex, timeMin, hrBpm }) {
  const wLb = Number(weightKg) * 2.20462
  const a = Number(ageYears)
  const s = sex === 'male' ? 1 : 0
  const t = Number(timeMin)
  const h = Number(hrBpm)
  if (!(wLb > 0 && a > 0 && t > 0 && h > 0)) return 0
  return round(132.853 - 0.0769 * wLb - 0.3877 * a + 6.315 * s - 3.2649 * t - 0.1565 * h, 0.1)
}

// Cooper's fitness bands read VO2max against age & sex — enough for a coach to place a client
// on the adaptation→performance ladder. Ordered worst→best; the first band whose ceiling the
// value is under wins.
export const VO2MAX_RATING = ['very poor', 'poor', 'fair', 'good', 'excellent', 'superior']

/* ============================ One-rep max & %1RM ============================ */

/** Epley (1985): w·(1 + reps/30). The openGym Stats screen already uses this one. */
export const epley = (weight, reps) => Number(weight) * (1 + clampReps(reps) / 30)
/** Brzycki (1993): w·36/(37 − reps). Diverges above ~10 reps, so reps are capped at 36. */
export const brzycki = (weight, reps) => Number(weight) * 36 / (37 - clampReps(reps))
/** Lombardi (1989): w·reps^0.10. Gentler at high reps. */
export const lombardi = (weight, reps) => Number(weight) * Math.pow(clampReps(reps), 0.10)

const RM_FORMULAS = { epley, brzycki, lombardi }

/**
 * Estimated one-rep max from a set taken near failure.
 * @param {number} weight Load lifted.
 * @param {number} reps Repetitions completed (1–36; a single rep returns the load itself).
 * @param {'epley'|'brzycki'|'lombardi'} [formula='epley']
 * @returns {number} Estimated 1RM in the same unit as `weight`, rounded to 0.5.
 */
export function oneRepMax(weight, reps, formula = 'epley') {
  const w = Number(weight)
  if (!(w > 0)) return 0
  // A single rep *is* the max — the formulas only estimate for reps ≥ 2, and Epley in
  // particular overshoots at rep 1.
  if (clampReps(reps) <= 1) return round(w, 0.5)
  const fn = RM_FORMULAS[formula] || epley
  return round(fn(w, reps), 0.5)
}

/**
 * Working load for a percentage of 1RM — the core of phase-based dosing.
 * @param {number} oneRM Estimated or tested one-rep max.
 * @param {number} pct Target intensity as a percentage (e.g. 80 for 80% 1RM).
 * @param {number} [step=2.5] Plate rounding step; the load is rounded to the nearest multiple.
 * @returns {number} Prescribed load.
 */
export function loadForPct(oneRM, pct, step = 2.5) {
  const v = Number(oneRM) * Number(pct) / 100
  if (!(v > 0)) return 0
  return round(v, step)
}

/** A full %1RM table (40–100% by 5) for a lift — handy for a coach building a block. */
export function pct1rmTable(oneRM, step = 2.5) {
  const out = {}
  for (let p = 40; p <= 100; p += 5) out[p] = loadForPct(oneRM, p, step)
  return out
}

/* ============================ Body composition (anthropometry) ============================ */

const sum = sites => Object.values(sites || {}).reduce((a, b) => a + (Number(b) || 0), 0)

/**
 * Body density from skinfolds via the Jackson-Pollock equations, then a body-fat percentage.
 *
 * @param {object} p
 * @param {'male'|'female'} p.sex
 * @param {number} p.ageYears
 * @param {Record<string,number>} p.sites Skinfold thicknesses in mm. Their sum is what the
 *   equation uses, so pass the 3-site set (men: chest, abdomen, thigh · women: triceps,
 *   suprailiac, thigh) or the 7-site set to match `method`.
 * @param {3|7} [p.method=3] 3-site (default) or 7-site Jackson-Pollock.
 * @param {'siri'|'brozek'} [p.equation='siri'] Density→fat% conversion.
 * @returns {{ sum:number, density:number, bodyFatPct:number }}
 */
export function jacksonPollock({ sex, ageYears, sites, method = 3, equation = 'siri' }) {
  const S = sum(sites)
  const a = Number(ageYears) || 0
  const male = sex === 'male'
  let bd
  if (method === 7) {
    bd = male
      ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * a
      : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * a
  } else {
    bd = male
      ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * a
      : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * a
  }
  return { sum: round(S, 0.1), density: round(bd, 0.0001), bodyFatPct: bodyFatFromDensity(bd, equation) }
}

/** Body-fat % from body density. Siri (1961): 495/BD − 450 · Brozek (1963): 457/BD − 414.2. */
export function bodyFatFromDensity(density, equation = 'siri') {
  const bd = Number(density)
  if (!(bd > 0)) return 0
  const bf = equation === 'brozek' ? 457 / bd - 414.2 : 495 / bd - 450
  return round(Math.max(0, bf), 0.1)
}

/**
 * Body-fat % from the Yuhasz 6-site sum of skinfolds (mm) — the quick field method many coaches
 * use. Yuhasz (1974): men %BF = 0.1051·ΣS + 2.585 · women %BF = 0.1548·ΣS + 3.58.
 * @param {object} p
 * @param {'male'|'female'} p.sex
 * @param {Record<string,number>} p.sites Six skinfolds in mm (triceps, subscapular, suprailiac,
 *   abdominal, thigh, calf).
 */
export function yuhaszBodyFat({ sex, sites }) {
  const S = sum(sites)
  const bf = sex === 'male' ? 0.1051 * S + 2.585 : 0.1548 * S + 3.58
  return round(Math.max(0, bf), 0.1)
}

/** Fat mass and lean mass in kg from body mass and a body-fat percentage. */
export function bodyComposition(weightKg, bodyFatPct) {
  const w = Number(weightKg)
  const bf = Number(bodyFatPct)
  if (!(w > 0) || !(bf >= 0)) return { fatKg: 0, leanKg: round(w || 0, 0.1) }
  const fatKg = w * bf / 100
  return { fatKg: round(fatKg, 0.1), leanKg: round(w - fatKg, 0.1) }
}

/** Waist-to-hip ratio — a simple central-adiposity marker. Same unit both arguments. */
export const waistHipRatio = (waist, hip) =>
  Number(hip) > 0 ? round(Number(waist) / Number(hip), 0.01) : 0
