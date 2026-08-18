// Bring-your-own-AI plan builder.
//
// openGym never calls a model or the network — the whole point is that your data stays on your
// device. So instead of wiring in an API key, this builds a prompt you paste into ANY chat AI
// (ChatGPT, Claude, whatever you already use) and reads the plan it hands back.
//
//  - buildAiPrompt() writes a self-contained brief: the equipment vocabulary the catalogue
//    understands, a strict JSON output contract, and blanks for your goal, days and injuries.
//  - parseAiPlan() reads the model's JSON back, resolves each exercise name against the library
//    exactly the way the CSV importers do (matchExercise; unknown names become your own
//    exercises), and returns a bundle mergePlan() adds without touching what you already have.

import { EXDB, EXIDX, isCardio } from './exercises.js'
import { matchExercise } from './import-csv.js'
import { uid } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { t } from './i18n-core.js'

// Weekday names/abbreviations → getDay() index (0 = Sunday), so a plan's "week" block can use
// whatever the model wrote. Names only — a bare number is too ambiguous (is 1 Monday or the
// second day?) to risk filing a workout on the wrong day.
const DAY_INDEX = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
}
const dayIndex = day => {
  const k = String(day || '').toLowerCase().trim()
  return Object.prototype.hasOwnProperty.call(DAY_INDEX, k) ? DAY_INDEX[k] : null
}

// Loose body-part hint → a catalogue body part, so an unmatched custom still lands somewhere on
// the muscle map. Unknown hints stay empty rather than guessing.
const BODYPARTS = [...new Set(EXDB.map(e => e.bp))]
const BP_HINT = {
  chest: 'chest', back: 'back', shoulders: 'shoulders', shoulder: 'shoulders',
  arms: 'upper arms', arm: 'upper arms', biceps: 'upper arms', triceps: 'upper arms',
  forearms: 'lower arms', legs: 'upper legs', leg: 'upper legs', quads: 'upper legs',
  hamstrings: 'upper legs', glutes: 'upper legs', calves: 'lower legs', abs: 'waist',
  core: 'waist', waist: 'waist', cardio: 'cardio', neck: 'neck',
}
const bodyPartOf = hint => {
  const k = String(hint || '').toLowerCase().trim()
  if (BODYPARTS.includes(k)) return k
  return BP_HINT[k] || ''
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

/**
 * Build the copy-paste prompt. It is model-facing, so it is written in English (the names it
 * must produce are English catalogue names) but carries the user's weight unit.
 */
export function buildAiPrompt(S) {
  const unit = (S && S.unit) || 'kg'
  const equipment = [...new Set(EXDB.map(e => e.eq))].sort().join(', ')
  return `You are a strength & conditioning coach. Build me a personalised weekly training plan.

## My details (edit these before sending)
- Goal: (build muscle / get stronger / lose fat / general fitness)
- Experience: (beginner / intermediate / advanced)
- Days per week I can train: 3
- Time per session: 60 min
- Equipment I can use: (e.g. full gym / dumbbells only / home + resistance bands / bodyweight only)
- Injuries or sore areas to work around: (e.g. none / bad left shoulder / sore lower back / trick knee)
- Weight unit: ${unit}

## Rules
- Use common English exercise names, e.g. "barbell bench press", "lat pulldown", "romanian deadlift", "leg press", "dumbbell lateral raise". The app matches names to its library automatically and turns anything it doesn't know into a custom exercise, so plain names are fine.
- Only program equipment I said I have. Equipment types the app understands: ${equipment}.
- Give each training day a short routine name and 4-7 exercises, each with a set count and a rep target.
- Work around my injuries: do not program exercises that load a hurt or sore area.

## Output — reply with ONLY this JSON object and nothing else
{
  "name": "My Plan",
  "routines": [
    {
      "name": "Push",
      "exercises": [
        { "name": "barbell bench press", "sets": 4, "reps": 6 },
        { "name": "overhead press", "sets": 3, "reps": 8 },
        { "name": "dumbbell lateral raise", "sets": 3, "reps": 15 }
      ]
    }
  ],
  "week": { "Monday": "Push", "Wednesday": "Pull", "Friday": "Legs" }
}

Notes:
- "reps" is a number. For a timed hold (plank, dead hang) use "seconds" instead of "reps". For cardio use "minutes" and optionally "speed".
- Optionally add "weight": ${unit === 'kg' ? 'a number in kg' : 'a number in ' + unit} to an exercise; leave it out to decide the load in the gym.
- "week" maps a weekday to one of your routine names; omit a day to leave it a rest day. Only use routine names you defined above.
- Reply with the JSON object only, so the app can read it back.`
}

// Pull the JSON object out of a model reply: a ```json fenced block if present, otherwise the
// span from the first { to the last }. Extra prose around it is tolerated.
function extractJson(raw) {
  let s = String(raw == null ? '' : raw).trim()
  if (!s) throw new Error(t('paste the AI’s reply first'))
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  if (s[0] !== '{') {
    const a = s.indexOf('{')
    const b = s.lastIndexOf('}')
    if (a === -1 || b === -1 || b < a) throw new Error(t('couldn’t find a plan in that text'))
    s = s.slice(a, b + 1)
  }
  try { return JSON.parse(s) }
  catch (e) { throw new Error(t('that isn’t valid JSON — copy the AI’s whole reply')) }
}

// One exercise config in the app's routine shape, resolving cardio/time/reps from the catalogue
// entry and the fields the model provided.
function exConfig(id, item) {
  const sets = clampInt(item.sets, 1, 20, 3)
  if (isCardio(id)) {
    return { id, sets, min: clampInt(item.minutes ?? item.min, 1, 240, 20), speed: clampNum(item.speed, 0, 60, 8) }
  }
  const secs = item.seconds ?? item.sec
  if (secs != null && Number.isFinite(Number(secs))) {
    const o = { id, sets, mode: 'time', sec: clampInt(secs, 1, 3600, 45) }
    const w = clampNum(item.weight, 0, 1000, 0)
    return w > 0 ? { ...o, weight: w } : o
  }
  const o = { id, sets, reps: clampInt(item.reps, 1, 100, 10) }
  const w = clampNum(item.weight, 0, 1000, 0)
  return w > 0 ? { ...o, weight: w } : o
}

/**
 * Parse a model reply into a plan bundle shaped exactly like {@link parsePlan}'s output, so the
 * same {@link mergePlan} and import sheet consume it. Exercise names resolve to library ids;
 * unrecognised ones become custom exercises carried in the bundle (never dropped). Throws with a
 * friendly, translated message when the text has no usable plan.
 *
 * @param {string} raw The AI's reply (JSON, optionally wrapped in prose or a code fence).
 * @returns {object} `{ name, routines, week, customEx, dropped, routineCount, exerciseCount,
 *   scheduledDays, unmatched }` — `unmatched` lists the names that became custom exercises.
 */
export function parseAiPlan(raw) {
  const data = extractJson(raw)
  const routinesIn = Array.isArray(data.routines) ? data.routines : []
  if (!routinesIn.length) throw new Error(t('that plan has no routines'))

  const customByName = new Map()   // lowercase name -> { id, n, bp }
  const nameToRid = new Map()      // routine name (lowercase) -> temp id
  const unmatched = []
  const routines = []

  for (const r of routinesIn) {
    const exIn = r && (Array.isArray(r.exercises) ? r.exercises : Array.isArray(r.ex) ? r.ex : null)
    if (!exIn) continue
    const name = (String(r.name || '').trim() || t('AI routine')).slice(0, 60)
    const ex = []
    for (const item of exIn) {
      if (!item) continue
      const exName = String(item.name || item.exercise || item.n || '').trim()
      if (!exName) continue
      let id = matchExercise(exName)
      if (id && !EXIDX[id]) id = null
      if (!id) {
        const key = exName.toLowerCase()
        let c = customByName.get(key)
        if (!c) {
          c = { id: 'c' + uid(), n: exName.slice(0, 60), bp: bodyPartOf(item.bodyPart || item.bp) }
          customByName.set(key, c)
          unmatched.push(exName)
        }
        id = c.id
      }
      ex.push(exConfig(id, item))
    }
    if (!ex.length) continue
    const rid = 'ai' + uid()
    routines.push({ id: rid, name, emoji: DEFAULT_GLYPH, ex })
    nameToRid.set(name.toLowerCase(), rid)
  }
  if (!routines.length) throw new Error(t('that plan has no exercises'))

  const week = {}
  const weekIn = data.week && typeof data.week === 'object' ? data.week : {}
  for (const [day, rname] of Object.entries(weekIn)) {
    const d = dayIndex(day)
    if (d == null) continue
    const rid = nameToRid.get(String(rname || '').toLowerCase().trim())
    if (rid) week[d] = rid
  }

  return {
    name: String(data.name || '').trim().slice(0, 60),
    routines,
    week,
    customEx: [...customByName.values()],
    dropped: 0,
    routineCount: routines.length,
    exerciseCount: routines.reduce((n, r) => n + r.ex.length, 0),
    scheduledDays: Object.keys(week).length,
    unmatched,
  }
}
