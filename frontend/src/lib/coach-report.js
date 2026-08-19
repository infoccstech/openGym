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

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = v => (Math.round(Number(v) * 100) / 100).toString()

/**
 * A clean, self-contained printable report of one client's snapshot (Save as PDF → WhatsApp).
 * Pure: returns an HTML string, no DOM. `client` is a coach-dashboard entry ({ name, at, report });
 * `opts.coachName` and `opts.accent` brand the header.
 * @returns {string} A full HTML document.
 */
export function clientReportHTML(client, opts = {}) {
  const r = client?.report || {}
  const unit = r.unit || 'kg'
  const accent = opts.accent || '#5f8e0b'
  const recent = (r.workouts?.recent || []).map(w =>
    `<tr><td>${esc(w.d)}</td><td class="num">${esc(w.sets)}</td><td class="num">${esc(n(w.volume))} ${esc(unit)}</td></tr>`).join('')
  const bests = (r.bests || []).map(b =>
    `<tr><td class="cap">${esc(b.name)}</td><td class="num">${b.best ? esc(n(b.best)) + ' ' + esc(unit) : '—'}</td><td class="num">${b.e1rm ? esc(n(b.e1rm)) + ' ' + esc(unit) : '—'}</td></tr>`).join('')
  const bw = r.bodyweight
    ? `${esc(n(r.bodyweight.w))} ${esc(unit)}${r.bodyweight.goal ? ` <span class="dim">/ ${esc(n(r.bodyweight.goal))} ${esc(unit)} goal</span>` : ''}`
    : '—'

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(client?.name || 'Client')} — progress</title>
<style>
  @page { margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; color:#16181d; background:#fff; font:14px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-variant-numeric:tabular-nums; }
  .doc { max-width:720px; margin:0 auto; }
  header { border-bottom:2px solid ${esc(accent)}; padding-bottom:12px; margin-bottom:20px; }
  .kicker { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:${esc(accent)}; font-weight:700; }
  h1 { font-size:26px; letter-spacing:-.02em; margin:3px 0 0; text-transform:capitalize; }
  .sub { color:#6b7180; font-size:13px; margin-top:4px; }
  .stats { display:flex; gap:26px; margin:18px 0 24px; }
  .stat .l { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#8a90a0; }
  .stat .v { font-size:20px; font-weight:700; margin-top:2px; }
  h3.block { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:#8a90a0; margin:22px 0 8px; font-weight:700; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:7px 10px; border-bottom:1px solid #eef0f4; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#8a90a0; }
  .num { text-align:right; white-space:nowrap; } .cap { text-transform:capitalize; } .dim { color:#a2a8b6; }
  footer { margin-top:26px; padding-top:10px; border-top:1px solid #eef0f4; color:#a2a8b6; font-size:11px; text-align:center; }
</style></head>
<body><div class="doc">
  <header>
    <div class="kicker">${esc(opts.coachName || 'openGym')} · progress report</div>
    <h1>${esc(client?.name || 'Client')}</h1>
    <div class="sub">${esc(client?.at || r.generatedAt || '')}</div>
  </header>
  <div class="stats">
    <div class="stat"><div class="l">Sessions</div><div class="v">${esc(r.workouts?.count ?? 0)}</div></div>
    <div class="stat"><div class="l">Body weight</div><div class="v">${bw}</div></div>
  </div>
  <h3 class="block">Recent sessions</h3>
  <table><thead><tr><th>Date</th><th class="num">Sets</th><th class="num">Volume</th></tr></thead><tbody>${recent || '<tr><td colspan="3" class="dim">No sessions logged.</td></tr>'}</tbody></table>
  <h3 class="block">Top lifts</h3>
  <table><thead><tr><th>Exercise</th><th class="num">Best</th><th class="num">Est. 1RM</th></tr></thead><tbody>${bests || '<tr><td colspan="3" class="dim">No lifts logged.</td></tr>'}</tbody></table>
  <footer>Made with openGym · coach report</footer>
</div></body></html>`
}
