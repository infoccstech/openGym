// Periodization — the layer that turns a test result into weekly dosing.
//
// A coach programs in phases (adaptación anatómica, hipertrofia, fuerza, potencia, descarga…),
// each with an intensity band expressed as a % of 1RM. Given a client's 1RM (from the tests
// module or their logged best), this derives the working load for any week of the block. Pure
// and Node-safe; it leans on loadForPct from ./fitness-tests.js so the plate rounding matches.

import { loadForPct } from './fitness-tests.js'

/**
 * The training qualities a phase can target, each with a default %1RM band, a rep range and a
 * one-line cue. A coach picks these as building blocks; the bands are conventional starting
 * points, meant to be overridden per client.
 * @type {Record<string, {label:string, pct1rm:[number,number], reps:[number,number], cue:string}>}
 */
export const PHASE_TYPES = {
  anatomical:  { label: 'Adaptación anatómica', pct1rm: [50, 65], reps: [12, 20], cue: 'Tejido y técnica; poca carga, control.' },
  hypertrophy: { label: 'Hipertrofia',          pct1rm: [67, 80], reps: [8, 12],  cue: 'Volumen a intensidad media, cerca del fallo.' },
  strength:    { label: 'Fuerza máxima',        pct1rm: [82, 92], reps: [3, 6],   cue: 'Cargas altas, descansos largos.' },
  power:       { label: 'Potencia',             pct1rm: [50, 70], reps: [2, 5],   cue: 'Velocidad; la barra se mueve rápido.' },
  endurance:   { label: 'Resistencia muscular', pct1rm: [40, 60], reps: [15, 25], cue: 'Muchas reps, descanso corto.' },
  deload:      { label: 'Descarga',             pct1rm: [45, 60], reps: [6, 10],  cue: 'Bajar volumen e intensidad para recuperar.' },
}

/**
 * Ready-made multi-phase blocks a coach can drop in and tweak. Each phase covers an inclusive
 * range of week numbers. Weeks are 1-based and contiguous.
 * @type {Record<string, {name:string, phases:Array<{type:string, label:string, weeks:[number,number], pct1rm:[number,number]}>}>}
 */
export const PERIODIZATION_PRESETS = {
  linear9: {
    name: 'Lineal clásico · 9 semanas',
    phases: [
      { type: 'anatomical',  label: PHASE_TYPES.anatomical.label,  weeks: [1, 3], pct1rm: [55, 65] },
      { type: 'hypertrophy', label: PHASE_TYPES.hypertrophy.label, weeks: [4, 6], pct1rm: [70, 80] },
      { type: 'strength',    label: PHASE_TYPES.strength.label,    weeks: [7, 8], pct1rm: [83, 90] },
      { type: 'deload',      label: PHASE_TYPES.deload.label,      weeks: [9, 9], pct1rm: [50, 60] },
    ],
  },
  hypertrophy8: {
    name: 'Hipertrofia · 8 semanas',
    phases: [
      { type: 'anatomical',  label: PHASE_TYPES.anatomical.label,  weeks: [1, 2], pct1rm: [55, 65] },
      { type: 'hypertrophy', label: PHASE_TYPES.hypertrophy.label, weeks: [3, 7], pct1rm: [70, 82] },
      { type: 'deload',      label: PHASE_TYPES.deload.label,      weeks: [8, 8], pct1rm: [50, 60] },
    ],
  },
}

/** Total number of weeks a block spans (its last phase's final week). */
export function blockWeeks(block) {
  const phases = block?.phases || []
  return phases.reduce((n, p) => Math.max(n, p.weeks?.[1] || 0), 0)
}

/**
 * The phase that governs a given 1-based week, or null when the week is outside the block.
 * @param {object} block A block with a `phases` array.
 * @param {number} week 1-based week number.
 */
export function phaseForWeek(block, week) {
  const w = Number(week)
  for (const p of block?.phases || []) {
    if (Array.isArray(p.weeks) && w >= p.weeks[0] && w <= p.weeks[1]) return p
  }
  return null
}

/**
 * Prescribed load range for a %1RM band.
 * @param {number} oneRM The client's one-rep max for the lift.
 * @param {[number,number]} pct1rm Intensity band, e.g. [70, 82].
 * @param {number} [step=2.5] Plate rounding step.
 * @returns {{ low:number, high:number, pct:[number,number] }}
 */
export function prescribe(oneRM, pct1rm, step = 2.5) {
  const [lo, hi] = pct1rm || []
  return {
    low: loadForPct(oneRM, lo, step),
    high: loadForPct(oneRM, hi, step),
    pct: [lo, hi],
  }
}

/**
 * Prescribed load range for a specific week of a block — the number a coach actually wants:
 * "for this client's 1RM, what does week 5 call for?".
 * @returns {{ phase:object, low:number, high:number, pct:[number,number] }|null} null off-block.
 */
export function prescribeForWeek(block, week, oneRM, step = 2.5) {
  const phase = phaseForWeek(block, week)
  if (!phase) return null
  return { phase, ...prescribe(oneRM, phase.pct1rm, step) }
}
