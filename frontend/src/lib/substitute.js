// Suggest alternative exercises — for when a machine is taken or you don't own it, or a
// muscle is sore and you want to train around it.
//
// Pure and offline: it reasons over the catalogue's own tags (target muscle, equipment) and
// the same 18-muscle map the body diagram uses (`musclesOf`). No model, no network, nothing
// leaves the phone — the same idea the equipment filter and muscle map already lean on,
// pointed at a single exercise: "give me something that trains what THIS trains, under new
// constraints." An LLM could refine the wording later; the ranking itself needs none.

import { EXDB, EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'

/** The muscle an exercise trains hardest — its `tg` carries weight 1 in `musclesOf`. */
export function primaryMuscle(ex) {
  const m = musclesOf(ex)
  let best = null
  let bestWeight = 0
  for (const [slug, weight] of Object.entries(m)) {
    if (weight > bestWeight) { bestWeight = weight; best = slug }
  }
  return best
}

/**
 * How alike two exercises are by the muscles they train, as cosine similarity in the range
 * 0…1. Both are expressed in the shared 18-muscle vocabulary via `musclesOf`, so a barbell
 * bench press and a push-up (chest 1, triceps 0.4, deltoids 0.4 each) score near 1, while a
 * bench press and a squat score 0. Two exercises that train nothing recognisable score 0.
 */
export function similarity(a, b) {
  const ma = musclesOf(a)
  const mb = musclesOf(b)
  let dot = 0
  let na = 0
  let nb = 0
  for (const slug of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
    const x = ma[slug] || 0
    const y = mb[slug] || 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (!na || !nb) return 0
  return dot / Math.sqrt(na * nb)
}

/**
 * Alternatives to `exOrId`, best match first.
 *
 * Every candidate has to still train the original's primary muscle — a swap that trains
 * something else is not an alternative — and is then ranked by overall muscle-map similarity.
 *
 * @param {string|object} exOrId Exercise, or its catalogue id, to find swaps for.
 * @param {object} [opts]
 * @param {string|string[]} [opts.equipment] Equipment the user can use right now. When given,
 *   only exercises using one of these are returned — this is the "no machine" case: pass the
 *   kit you *do* have (e.g. `['dumbbell','body weight']`) and the barbell/machine lifts drop
 *   out. Omit for any equipment.
 * @param {string|string[]} [opts.avoid] Muscle slug(s) to keep off — the sore/injured case.
 *   Any candidate that loads an avoided muscle at or above `avoidThreshold` is dropped.
 * @param {number} [opts.avoidThreshold=0.4] Involvement that counts as "loads it". 0.4 is a
 *   supporting muscle; pass a smaller number to exclude even incidental involvement, or 1 to
 *   only drop candidates whose *primary* target is the sore muscle.
 * @param {number} [opts.limit=12] Maximum results.
 * @param {number} [opts.minScore=0.15] Floor on similarity, so weak matches aren't offered.
 * @param {Array<object>} [opts.pool=EXDB] Catalogue to search. Pass `allExercises(S)` to let
 *   the user's own custom exercises turn up too.
 * @returns {Array<object>} Matching exercise objects (never the original), best first.
 */
export function substitutesFor(exOrId, opts = {}) {
  const ex = typeof exOrId === 'string' ? EXIDX[exOrId] : exOrId
  if (!ex) return []
  const {
    equipment,
    avoid,
    avoidThreshold = 0.4,
    limit = 12,
    minScore = 0.15,
    pool = EXDB,
  } = opts

  const allow = equipment == null
    ? null
    : new Set(Array.isArray(equipment) ? equipment : [equipment])
  const avoidSet = new Set(avoid == null ? [] : (Array.isArray(avoid) ? avoid : [avoid]))
  const target = primaryMuscle(ex)
  if (!target) return []

  const scored = []
  for (const c of pool) {
    if (c.id === ex.id) continue
    // Don't offer cardio as a swap for a strength move, or vice versa — they log differently
    // (time + speed vs sets × reps) and answer different questions.
    if ((c.bp === 'cardio') !== (ex.bp === 'cardio')) continue
    if (allow && !allow.has(c.eq)) continue

    const m = musclesOf(c)
    if (!(m[target] > 0)) continue   // must still hit the muscle the original was for

    if (avoidSet.size) {
      let loadsAvoided = false
      for (const slug of avoidSet) {
        if ((m[slug] || 0) >= avoidThreshold) { loadsAvoided = true; break }
      }
      if (loadsAvoided) continue
    }

    const score = similarity(ex, c)
    if (score < minScore) continue
    scored.push({ ex: c, score, onTarget: m[target] })
  }

  scored.sort((a, b) => b.score - a.score || b.onTarget - a.onTarget || (a.ex.n < b.ex.n ? -1 : 1))
  return scored.slice(0, limit).map(s => s.ex)
}
