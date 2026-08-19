# Coach relay — an optional, separate service (not in this repo)

The coaching layer works with **zero servers**: a coach signs a plan file and shares it (WhatsApp,
Files, cloud); a client sends back an encrypted report file the same way. That is the whole MVP,
and it ships in the AGPL app (`lib/coach-crypto.js`, `coach.jsx`).

The **relay** is the optional convenience layer from the [Coach Mode blueprint](https://claude.ai/code/artifact/5c4c9c3f-b6fc-4d42-a8c9-21d04beac518)
— "remote assignment" and a near-real-time dashboard without shuttling files by hand. It is
**intentionally not part of this repository**, for two reasons:

1. **Business model.** openGym is AGPL: the app must stay open. The relay is where the paid,
   proprietary service lives (see the blueprint's *Negocio* section). Keeping it in a **separate
   repo you own** is what lets it be closed-source and monetised, while the app stays free. Do not
   copy AGPL-derived code into it — it must be an independent program that talks to the app over a
   defined API.
2. **It changes nothing about trust.** The relay only stores and forwards the **already
   signed/encrypted** envelopes this app produces. It never holds plaintext and never owns the
   data, so building it later does not require reopening the crypto design.

## What it would be

A tiny store-and-forward "mailbox", end-to-end blind:

```
Client app ──PUT encrypted report──▶  relay (blob store, keyed by coach code)  ──▶ Coach pulls
Coach app  ──PUT signed plan──────▶   relay (keyed by client handle)          ──▶ Client pulls
```

- **Auth:** a coach authenticates with a signature from their existing identity key (challenge →
  sign → token); a client authenticates with a per-pairing token the coach card can carry. No new
  password system.
- **Storage:** opaque blobs (the `.ogp` / `.ogr` / `.ogc` envelopes) with a short TTL, addressed by
  coach code and a client handle. The server can index *who has mail*, never *what the mail says*.
- **Endpoints (sketch):** `POST /inbox/:code`, `GET /inbox/:code?since=…`, `DELETE /inbox/:id`.
- **Cost:** trivial — it moves small encrypted blobs. Fits a subscription-per-coach model; it can
  also be self-hosted by a coach.

## Client hooks already in place

The app already produces and consumes the exact envelopes the relay would carry:

| Envelope | Produced by | Consumed by |
|---|---|---|
| `opengym_coach_card` (`.ogc`) | `coach.jsx` share card | `pairCoachSheet` |
| `opengym_coach_plan` (`.ogp`) | `signPlan` | `verifyPlan` |
| `opengym_report` (`.ogr`)     | `encryptReport` | `decryptReport` |

Wiring the relay is therefore additive: replace the manual file share/open with a `PUT`/`GET`
against the mailbox, behind an opt-in "Connect to relay" toggle. Nothing about the signing,
encryption, or on-device data ownership changes.

## Status

Not built. This document is the contract so it can be added later, in its own repo, without
touching the app's trust model.
