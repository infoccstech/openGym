// Coach mode — the opt-in coaching layer on top of openGym.
//
// A trainer becomes a coach (a crypto identity + a shareable code), signs plans for clients, and
// reads the encrypted progress reports they send back — all over shared files, no server. A
// client pairs with a coach's card, imports verified plans, and sends encrypted reports. The
// trust primitives live in lib/coach-crypto.js; this file is the UI and the file plumbing.
//
// New strings are written in English via t() (translation-ready). A full locale pass for the
// coach surface is a fast-follow; the core app stays fully translated.

import { useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t } from './lib/i18n.js'
import { MOBILE, shareExport } from './lib/mobile.js'
import { fmtNum, fmtDate, todayISO, ACCENTS } from './lib/format.js'
import { buildPlanBundle, parsePlan, mergePlan } from './lib/plan-share.js'
import {
  generateIdentity, publicIdentity, coachCode,
  signPlan, verifyPlan, encryptReport, decryptReport, exportRecovery,
} from './lib/coach-crypto.js'
import { buildClientReport, clientReportHTML } from './lib/coach-report.js'
import Icon from './components/Icon.jsx'
import { Button } from './components/ui.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const openSheet = (render, opts) => ui().openSheet(render, opts)

/* ------------------------------- file plumbing ------------------------------- */
async function shareJSON(obj, filename) {
  const json = JSON.stringify(obj)
  if (MOBILE) { try { await shareExport(json, filename) } catch (e) { /* dismissed */ } return }
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href)
}
const readFile = file => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read failed')); r.readAsText(file)
})
// A hidden file input driven by a ref — each import sheet gets its own.
function FilePick({ inputRef, onPick }) {
  return <input ref={inputRef} type="file" accept="application/json,.json,.ogc,.ogp,.ogr" style={{ display: 'none' }}
    onChange={async ev => {
      const f = ev.target.files[0]; ev.target.value = ''
      if (!f) return
      try { onPick(JSON.parse(await readFile(f))) }
      catch (e) { toast(t('Couldn’t read that file')) }
    }} />
}
const codeChip = code => <span className="mono" style={{ fontSize: 13, letterSpacing: '.04em' }}>{code}</span>

// Render an HTML string to the print dialog (→ Save as PDF) via a hidden iframe — same technique
// as plan-share's printPlan, so it never navigates away or trips a popup blocker.
function printHTML(html) {
  const ifr = document.createElement('iframe')
  ifr.setAttribute('aria-hidden', 'true')
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;'
  document.body.appendChild(ifr)
  const cleanup = () => { try { ifr.remove() } catch (e) { /* */ } }
  const run = () => {
    const w = ifr.contentWindow
    if (!w) { cleanup(); return }
    w.onafterprint = cleanup
    setTimeout(cleanup, 60000)
    w.focus()
    try { w.print() } catch (e) { cleanup() }
  }
  const doc = ifr.contentWindow.document
  doc.open(); doc.write(html); doc.close()
  if (doc.readyState === 'complete') setTimeout(run, 120)
  else ifr.onload = () => setTimeout(run, 120)
}

// A brand's accent as a CSS color: a stored ACCENTS key resolves to its hex, a hex passes through.
const brandColor = brand => (brand && (ACCENTS[brand.accent] || brand.accent)) || 'var(--acc)'

/* ============================ white-label brand ============================ */
function BrandEditor({ close }) {
  const coach = useStore(s => s.S.coach)
  const [accent, setAccent] = useState(coach?.brand?.accent || 'lime')
  const [label, setLabel] = useState(coach?.brand?.label || coach?.name || '')
  const [logo, setLogo] = useState(coach?.brand?.logo || '')
  const logoRef = useRef(null)
  const pickLogo = ev => {
    const f = ev.target.files[0]; ev.target.value = ''
    if (!f) return
    if (f.size > 400 * 1024) { toast(t('Logo is too big — pick one under 400 KB')); return }
    const r = new FileReader(); r.onload = () => setLogo(r.result); r.readAsDataURL(f)
  }
  const save = () => {
    update(s => { if (s.coach) s.coach.brand = { accent, label: label.trim(), logo } })
    close(); toast(t('Brand saved'))
  }
  return <>
    <h3>{t('Your brand')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>{t('Your clients see this on the plans and card you send — your logo, colour and name.')}</div>
    <input className="input" placeholder={t('Brand name shown to clients')} value={label} onChange={e => setLabel(e.target.value)} />
    <div className="row" style={{ gap: 12, alignItems: 'center', margin: '14px 0' }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--sep)' }}>
        {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="person" />}
      </div>
      <Button size="sm" icon="upload" onClick={() => logoRef.current?.click()}>{logo ? t('Change logo') : t('Add logo')}</Button>
      {logo && <Button size="sm" variant="ghost" className="dim" onClick={() => setLogo('')}>{t('Remove')}</Button>}
      <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
    </div>
    <div className="lrow-t" style={{ marginBottom: 8 }}>{t('Accent color')}</div>
    <div className="swatches" style={{ marginBottom: 16 }}>
      {Object.entries(ACCENTS).map(([k, c]) => (
        <button key={k} className={'swatch' + (accent === k ? ' on' : '')} style={{ background: c }} onClick={() => setAccent(k)} aria-label={k} />
      ))}
    </div>
    <Button variant="primary" onClick={save}>{t('Save brand')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
export const brandSheet = () => openSheet(close => <BrandEditor close={close} />)

// The coach's brand as a banner the client sees — logo, name, accent stripe.
function CoachBanner({ brand, name, code }) {
  const col = brandColor(brand)
  return <div className="card" style={{ marginBottom: 14, borderLeft: `3px solid ${col}` }}>
    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none' }}>
        {brand?.logo ? <img src={brand.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="person" style={{ color: col }} />}
      </div>
      <div className="grow">
        <div style={{ fontSize: 17, fontWeight: 700 }}>{brand?.label || name || t('Your coach')}</div>
        <div className="small dim">{codeChip(code)}</div>
      </div>
      <Icon name="checkCircle" style={{ color: col }} />
    </div>
  </div>
}

/* ============================ become a coach ============================ */
function BecomeCoach({ close }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const id = await generateIdentity()
      const code = await coachCode(id.sign.pub)
      update(s => { s.coach = { id, name: name.trim(), code } })
      close(); toast(t('You’re set up as a coach'))
      coachToolsSheet()
    } catch (e) { setBusy(false); toast(t('Couldn’t create the identity: {0}', e.message)) }
  }
  return <>
    <h3>{t('Become a coach')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
      {t('Creates your coach identity on this device — a key that signs the plans you send, and a code your clients pair with. Keep the recovery code safe: it’s the only way to restore this identity.')}
    </div>
    <input className="input" placeholder={t('Your coach name (optional)')} value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="key" onClick={create} disabled={busy}>{busy ? t('Creating…') : t('Create my coach identity')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
export const becomeCoachSheet = () => openSheet(close => <BecomeCoach close={close} />)

/* ============================ coach hub ============================ */
function CoachTools({ close }) {
  const coach = useStore(s => s.S.coach)
  const clients = useStore(s => s.S.coachClients) || []
  const importRef = useRef(null)
  if (!coach) return null

  const shareCard = () => shareJSON(
    { opengym_coach_card: 1, code: coach.code, name: coach.name || '', brand: coach.brand || null, ...publicIdentity(coach.id) },
    'coach-card-' + todayISO() + '.ogc',
  )
  const backupRecovery = () => shareJSON({ note: 'openGym coach recovery — keep private', recovery: exportRecovery(coach.id) }, 'coach-recovery.txt')
  const onReport = async bundle => {
    try {
      const report = await decryptReport(bundle, coach.id)
      update(s => {
        s.coachClients = (s.coachClients || []).filter(c => c.name !== (report.name || 'Client'))
        s.coachClients.push({ name: report.name || t('Client'), at: report.generatedAt || todayISO(), report })
      })
      toast(t('Report from {0} imported', report.name || t('a client')))
    } catch (e) { toast(t('Couldn’t open that report — is it for you?')) }
  }

  return <>
    <h3>{t('Coach')}</h3>
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div><div className="muted small">{t('Your coach code')}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{codeChip(coach.code)}</div></div>
        <Icon name="key" style={{ color: 'var(--acc)' }} />
      </div>
      {coach.name && <div className="small dim" style={{ marginTop: 4 }}>{coach.name}</div>}
    </div>
    <Button variant="primary" icon="upload" onClick={shareCard}>{t('Share my coach card')}</Button>
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('Send this to a client once so they can pair with you and verify your plans.')}</div>
    <div style={{ height: 10 }} />
    <Button icon="star" onClick={() => { close(); brandSheet() }}>{t('Your brand (white-label)')}</Button>
    <div style={{ height: 14 }} />
    <Button icon="clipboard" onClick={() => { close(); signPlanSheet() }}>{t('Sign & share a plan')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="chart" onClick={() => { close(); coachClientsSheet() }}>{t('My clients ({0})', clients.length)}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" icon="download" onClick={() => importRef.current?.click()}>{t('Import a client report')}</Button>
    <FilePick inputRef={importRef} onPick={onReport} />
    <div style={{ height: 14 }} />
    <Button size="sm" variant="ghost" className="dim" icon="key" onClick={backupRecovery}>{t('Back up my recovery code')}</Button>
  </>
}
export const coachToolsSheet = () => openSheet(close => <CoachTools close={close} />)

/* ============================ sign & share a plan ============================ */
function SignPlan({ close }) {
  const st = useStore(s => s.S)
  const coach = st.coach
  const [client, setClient] = useState('')
  const [busy, setBusy] = useState(false)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const go = async schedule => {
    setBusy(true)
    try {
      const bundle = buildPlanBundle(st, coach.name ? t('{0}’s plan', coach.name) : '')
      if (!schedule) bundle.week = {}
      const signed = await signPlan(bundle, coach.id, { name: coach.name || '', issued_for: client.trim(), issued_at: todayISO() })
      await shareJSON(signed, 'plan-' + (client.trim() ? client.trim().toLowerCase().replace(/\s+/g, '-') + '-' : '') + todayISO() + '.ogp')
      close(); toast(t('Signed plan ready to send'))
    } catch (e) { setBusy(false); toast(t('Couldn’t sign the plan: {0}', e.message)) }
  }
  return <>
    <h3>{t('Sign & share a plan')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>{t('Signs your current routines as a plan only this client can trust came from you — and that they can’t edit undetected. Build the plan in your own Plan tab first.')}</div>
    <input className="input" placeholder={t('Client name (optional)')} value={client} onChange={e => setClient(e.target.value)} />
    <div style={{ height: 14 }} />
    {!hasRoutines && <div className="small" style={{ color: 'var(--yellow)', marginBottom: 12 }}>{t('Add an exercise to a routine first — there’s nothing to sign yet.')}</div>}
    <Button variant="primary" icon="check" onClick={() => go(true)} disabled={busy || !hasRoutines}>{t('Sign with weekly schedule')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="check" onClick={() => go(false)} disabled={busy || !hasRoutines}>{t('Sign routines only')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
export const signPlanSheet = () => openSheet(close => <SignPlan close={close} />)

/* ============================ coach dashboard (multi-client) ============================ */
function printClientReport(c, coach) {
  const key = coach?.brand?.accent
  const accent = key ? (ACCENTS[key] || key) : undefined
  printHTML(clientReportHTML(c, { coachName: coach?.brand?.label || coach?.name || '', accent }))
}
function ClientCard({ c, coach }) {
  const r = c.report || {}
  const bests = (r.bests || []).slice(0, 3)
  return <div className="card" style={{ marginBottom: 12 }}>
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div className="tt" style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {!MOBILE && <button className="iconbtn" aria-label={t('Save PDF')} title={t('Save PDF')} onClick={() => printClientReport(c, coach)}><Icon name="download" /></button>}
        <div className="small dim">{fmtDate(c.at)}</div>
      </div>
    </div>
    <div className="row" style={{ gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
      <div><div className="muted small">{t('Sessions')}</div><div style={{ fontWeight: 600 }}>{r.workouts?.count ?? 0}</div></div>
      {r.bodyweight && <div><div className="muted small">{t('Weight')}</div><div style={{ fontWeight: 600 }}>{fmtNum(r.bodyweight.w)} {r.unit || 'kg'}</div></div>}
    </div>
    {bests.length > 0 && <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
      <span className="muted">{t('Top lifts')}:</span> {bests.map((b, i) => <span key={i} className="capitalize">{i ? ' · ' : ' '}{b.name} {fmtNum(b.e1rm || b.best)}{b.e1rm ? ' e1RM' : ''}</span>)}
    </div>}
  </div>
}
function CoachClients({ close }) {
  const clients = useStore(s => s.S.coachClients) || []
  const importRef = useRef(null)
  const coach = useStore(s => s.S.coach)
  const onReport = async bundle => {
    try {
      const report = await decryptReport(bundle, coach.id)
      update(s => {
        s.coachClients = (s.coachClients || []).filter(c => c.name !== (report.name || 'Client'))
        s.coachClients.push({ name: report.name || t('Client'), at: report.generatedAt || todayISO(), report })
      })
      toast(t('Report from {0} imported', report.name || t('a client')))
    } catch (e) { toast(t('Couldn’t open that report — is it for you?')) }
  }
  return <>
    <div className="row between" style={{ marginBottom: 6 }}><h3>{t('My clients')}</h3>
      <Button size="sm" variant="tinted" icon="plus" onClick={() => importRef.current?.click()}>{t('Add report')}</Button></div>
    <FilePick inputRef={importRef} onPick={onReport} />
    {clients.length === 0
      ? <div className="empty"><div className="ico"><Icon name="person" /></div>{t('No client reports yet. Ask a client to send you one from “My coach”.')}</div>
      : <div>{clients.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((c, i) => <ClientCard key={i} c={c} coach={coach} />)}</div>}
  </>
}
export const coachClientsSheet = () => openSheet(close => <CoachClients close={close} />)

/* ============================ client: pair with a coach ============================ */
function PairCoach({ close }) {
  const pickRef = useRef(null)
  const pair = card => {
    if (!card || card.opengym_coach_card !== 1 || !card.sign_pub || !card.box_pub) { toast(t('That’s not a coach card')); return }
    update(s => { s.myCoach = { code: card.code, name: card.name || '', brand: card.brand || null, sign_pub: card.sign_pub, box_pub: card.box_pub } })
    close(); toast(t('Paired with {0}', card.name || card.code))
    myCoachSheet()
  }
  return <>
    <h3>{t('Pair with your coach')}</h3>
    <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>{t('Open the coach card your trainer sent you. After pairing, their plans verify automatically and your reports go only to them.')}</div>
    <Button variant="primary" icon="upload" onClick={() => pickRef.current?.click()}>{t('Open coach card')}</Button>
    <FilePick inputRef={pickRef} onPick={pair} />
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
export const pairCoachSheet = () => openSheet(close => <PairCoach close={close} />)

/* ============================ client: my coach hub ============================ */
function MyCoach({ close }) {
  const st = useStore(s => s.S)
  const my = st.myCoach
  const planRef = useRef(null)
  const [name, setName] = useState('')
  if (!my) return null

  const onPlan = async bundle => {
    if (bundle && bundle.opengym_plan && !bundle.opengym_coach_plan) {
      toast(t('That plan isn’t signed — import it from Plan tools instead')); return
    }
    const res = await verifyPlan(bundle, { expectedCode: my.code })
    if (!res.valid) { toast(t('Not verified: {0}', res.reason || 'invalid')); return }
    try {
      const parsed = parsePlan(res.plan)
      update(s => mergePlan(s, parsed, { schedule: parsed.scheduledDays > 0 }))
      close(); toast(t('Verified plan from {0} imported', my.name || my.code))
    } catch (e) { toast(t('Import failed: {0}', e.message)) }
  }
  const sendReport = async () => {
    try {
      const report = buildClientReport(st, { name: name.trim() })
      const env = await encryptReport(report, { box_pub: my.box_pub }, my.code)
      await shareJSON(env, 'report-' + todayISO() + '.ogr')
      toast(t('Encrypted report ready to send'))
    } catch (e) { toast(t('Couldn’t build the report: {0}', e.message)) }
  }
  const unpair = () => { update(s => { s.myCoach = null }); close(); toast(t('Unpaired from your coach')) }

  return <>
    <h3>{t('My coach')}</h3>
    <CoachBanner brand={my.brand} name={my.name} code={my.code} />
    <Button variant="primary" icon="download" onClick={() => planRef.current?.click()}>{t('Import a plan from my coach')}</Button>
    <FilePick inputRef={planRef} onPick={onPlan} />
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('Verified as really from your coach, and flagged if it was tampered with.')}</div>
    <h4 className="sec">{t('Send a progress report')}</h4>
    <input className="input" placeholder={t('Your name (so your coach knows who it is)')} value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 10 }} />
    <Button icon="upload" onClick={sendReport}>{t('Create encrypted report')}</Button>
    <div className="dim small" style={{ margin: '7px 2px 0', lineHeight: 1.4 }}>{t('Only your coach can open it. Your full history stays on your device.')}</div>
    <div style={{ height: 16 }} />
    <Button size="sm" variant="ghost" className="dim" onClick={unpair}>{t('Unpair from this coach')}</Button>
  </>
}
export const myCoachSheet = () => openSheet(close => <MyCoach close={close} />)
