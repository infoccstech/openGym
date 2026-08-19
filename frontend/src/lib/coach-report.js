// The progress snapshot a client hands their coach. A pure function of the client's synced state
// so the numbers match the app exactly; the crypto layer (coach-crypto.js) encrypts whatever this
// returns. Kept lean on purpose — it is a coaching summary, not a full data export.

import { exOr } from './exercises.js'
import { workoutVolume, setsDone, bestWeightFor } from './history.js'
import { best1RM } from './onerm.js'

/**
 * Build a client's coaching snapshot from their state.
 * @param {object} S The client's synced state.
 * @param {object} [opts] { name, at } — display name and an ISO date (injected for testability).
 * @returns {object} A plain, JSON-serialisable report.
 */
export function buildClientReport(S, opts = {}) {
  const workouts = S?.workouts || []
  const bw = S?.bodyweight || []
  const latest = bw.length ? bw[bw.length - 1] : null

  const recent = workouts.slice(-8).reverse().map(w => ({
    d: w.d,
    sets: setsDone(w),
    volume: Math.round(workoutVolume(w)),
  }))

  const ids = [...new Set(workouts.flatMap(w => (w.entries || []).map(e => e.id)))]
  const bests = ids
    .map(id => {
      const e1 = best1RM(S, id)
      return { id, name: exOr(id).n, best: bestWeightFor(S, id), e1rm: e1 ? Math.round(e1.est) : 0 }
    })
    .filter(b => b.best > 0 || b.e1rm > 0)
    .sort((a, b) => b.e1rm - a.e1rm || b.best - a.best)
    .slice(0, 15)

  return {
    opengym_report_body: 1,
    name: opts.name || '',
    generatedAt: opts.at || new Date().toISOString().slice(0, 10),
    unit: S?.unit || 'kg',
    bodyweight: latest ? { w: latest.w, d: latest.d, goal: S?.targetW || null } : null,
    workouts: { count: workouts.length, recent },
    bests,
  }
}
