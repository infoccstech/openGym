// The trust layer of the coaching platform — signed plans and encrypted reports, with no
// server and no new dependency. Everything here is the platform's own Web Crypto (ECDSA P-256
// to sign, ECDH P-256 + HKDF + AES-GCM to encrypt), available identically in the browser and
// the Capacitor WebView, and in Node ≥ 20 so it can be unit-tested.
//
// Two envelopes, two guarantees (see the Coach Mode blueprint):
//   • a PLAN is SIGNED   — the client reads it in-app but a single edit breaks the signature;
//   • a REPORT is ENCRYPTED — only the destination coach's private key opens it.
//
// An "identity" is a coach's or client's key material: an ECDSA pair for signing and an ECDH
// pair for receiving encrypted data. It is fully JSON-serialisable (JWKs) so it can be stored
// on-device like a passkey and backed up as a recovery code.

const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()
const dec = new TextDecoder()

/* ------------------------------- base64url + bytes ------------------------------- */
const b64u = {
  encode(bytes) {
    let s = ''
    const b = new Uint8Array(bytes)
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(s + '==='.slice((s.length + 3) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

// Deterministic JSON: keys sorted at every level, so the exact bytes a coach signs are the exact
// bytes a client re-hashes. Arrays keep order; primitives pass through JSON.stringify.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

/* ------------------------------- key import helpers ------------------------------- */
const importVerify = jwk => subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
const importSign = jwk => subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const importBoxPriv = jwk => subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
const importBoxPub = jwk => subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
const pubOnly = jwk => { const { d, ...pub } = jwk || {}; return pub }   // strip the private scalar

/**
 * Create a fresh identity — a signing pair (ECDSA) and an encryption pair (ECDH). The result is
 * plain JSON (JWKs); persist it on the device and back it up with {@link exportRecovery}.
 * @returns {Promise<{sign:{pub:object,priv:object}, box:{pub:object,priv:object}}>}
 */
export async function generateIdentity() {
  const sign = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const box = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return {
    sign: { pub: await subtle.exportKey('jwk', sign.publicKey), priv: await subtle.exportKey('jwk', sign.privateKey) },
    box: { pub: await subtle.exportKey('jwk', box.publicKey), priv: await subtle.exportKey('jwk', box.privateKey) },
  }
}

/** The public half of an identity — what a coach publishes so clients can verify & encrypt to them. */
export function publicIdentity(identity) {
  return { sign_pub: pubOnly(identity.sign.pub), box_pub: pubOnly(identity.box.pub) }
}

/* ------------------------------- coach code (fingerprint) ------------------------------- */
// Crockford base32 (no I/L/O/U) of the first 5 bytes of SHA-256 over the signing public key —
// a short, human-shareable, unambiguous identity. Not a secret; it *is* the coach's name in the
// system, and it travels inside every signed plan.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function base32(bytes) {
  let bits = 0, val = 0, out = ''
  for (const byte of bytes) {
    val = (val << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]
  return out
}

/** Deterministic coach code (e.g. `CGX-7F3Q-8M2K`) from a signing public JWK. */
export async function coachCode(signPubJwk) {
  const digest = new Uint8Array(await subtle.digest('SHA-256', enc.encode(canonical(pubOnly(signPubJwk)))))
  const s = base32(digest.slice(0, 5)).padEnd(8, '0').slice(0, 8)
  return `CGX-${s.slice(0, 4)}-${s.slice(4, 8)}`
}

/* ------------------------------- signed plan (coach → client) ------------------------------- */
/**
 * Wrap a plan bundle in a coach-signed envelope. `plan` is any JSON (in practice the openGym
 * plan-share bundle). The signature covers everything but `sig`, so the client can render the
 * plan in-app yet detect any tampering.
 * @param {object} plan The plan payload (e.g. buildPlanBundle output).
 * @param {object} identity The coach's identity.
 * @param {object} [meta] Optional { name, issued_for }.
 * @returns {Promise<object>} A signed plan bundle.
 */
export async function signPlan(plan, identity, meta = {}) {
  const code = await coachCode(identity.sign.pub)
  const content = {
    opengym_coach_plan: 1,
    coach: { code, name: meta.name || '', ...publicIdentity(identity) },
    issued_for: meta.issued_for || '',
    issued_at: meta.issued_at || '',
    plan,
  }
  const key = await importSign(identity.sign.priv)
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(canonical(content)))
  return { ...content, sig: b64u.encode(sig) }
}

/**
 * Verify a signed plan bundle. Recomputes the coach code from the embedded public key, checks the
 * signature, and (optionally) that it came from the coach the client paired with.
 * @param {object} bundle A signed plan bundle.
 * @param {object} [opts] { expectedCode } to bind it to a known coach.
 * @returns {Promise<{valid:boolean, coachCode:string|null, plan:object|null, reason?:string}>}
 */
export async function verifyPlan(bundle, opts = {}) {
  try {
    if (!bundle || bundle.opengym_coach_plan !== 1 || !bundle.sig || !bundle.coach) {
      return { valid: false, coachCode: null, plan: null, reason: 'not a signed plan' }
    }
    const { sig, ...content } = bundle
    const code = await coachCode(bundle.coach.sign_pub)
    if (code !== bundle.coach.code) {
      return { valid: false, coachCode: code, plan: null, reason: 'coach code does not match its key' }
    }
    if (opts.expectedCode && opts.expectedCode !== code) {
      return { valid: false, coachCode: code, plan: null, reason: 'signed by a different coach' }
    }
    const key = await importVerify(bundle.coach.sign_pub)
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u.decode(sig), enc.encode(canonical(content)))
    return ok
      ? { valid: true, coachCode: code, plan: bundle.plan }
      : { valid: false, coachCode: code, plan: null, reason: 'signature invalid — plan was altered' }
  } catch (e) {
    return { valid: false, coachCode: null, plan: null, reason: 'unreadable: ' + e.message }
  }
}

/* ------------------------------- encrypted report (client → coach) ------------------------------- */
async function deriveAesKey(privKey, pubKey, salt, usage) {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pubKey }, privKey, 256)
  const hkdf = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('opengym-report-v1') },
    hkdf, { name: 'AES-GCM', length: 256 }, false, usage,
  )
}

/**
 * Encrypt a report so only the destination coach can read it. Uses a fresh ephemeral ECDH pair
 * per report (forward secrecy), agreed against the coach's box public key.
 * @param {object} report Any JSON — in practice the client's progress snapshot.
 * @param {object} coachPublic The coach's `publicIdentity()` (needs `box_pub`).
 * @param {string} [toCode] The coach code, stamped on the envelope so the coach can route it.
 * @returns {Promise<object>} An encrypted report envelope.
 */
export async function encryptReport(report, coachPublic, toCode = '') {
  const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const coachPub = await importBoxPub(coachPublic.box_pub)
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const aes = await deriveAesKey(eph.privateKey, coachPub, salt, ['encrypt'])
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(report)))
  return {
    opengym_report: 1,
    to: toCode,
    epk: await subtle.exportKey('jwk', eph.publicKey),
    salt: b64u.encode(salt),
    iv: b64u.encode(iv),
    ct: b64u.encode(ct),
  }
}

/**
 * Decrypt a report envelope with the coach's identity. Throws if it isn't a report or the keys
 * don't match.
 * @returns {Promise<object>} The original report object.
 */
export async function decryptReport(bundle, identity) {
  if (!bundle || bundle.opengym_report !== 1) throw new Error('not an openGym report')
  const priv = await importBoxPriv(identity.box.priv)
  const eph = await importBoxPub(bundle.epk)
  const aes = await deriveAesKey(priv, eph, b64u.decode(bundle.salt), ['decrypt'])
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64u.decode(bundle.iv) }, aes, b64u.decode(bundle.ct))
  return JSON.parse(dec.decode(pt))
}

/* ------------------------------- recovery ------------------------------- */
// A recovery code is the whole identity (both key pairs) as one opaque base64url string the coach
// saves somewhere safe. Losing the device without it means losing the ability to read old reports
// and to sign as the same coach — so the UI must make backing this up unmissable. (A word-list
// wrapper over this blob is a later nicety; the security is identical.)
export function exportRecovery(identity) {
  return 'OGCOACH1.' + b64u.encode(enc.encode(JSON.stringify(identity)))
}
export function importRecovery(code) {
  const s = String(code || '').trim()
  if (!s.startsWith('OGCOACH1.')) throw new Error('not an openGym coach recovery code')
  return JSON.parse(dec.decode(b64u.decode(s.slice('OGCOACH1.'.length))))
}
