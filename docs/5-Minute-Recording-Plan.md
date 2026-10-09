# 5-Minute Recording Plan

FinOps Command Center · executive product video · illustrative demo data

Script and storyboard: `docs/5-Minute-Executive-Demo.md` · Captions: `docs/demo-script.srt` · Cards: `docs/video/title-card.png`, `docs/video/end-card.png`

---

## 1. Browser setup

- **Browser:** Chrome or Edge, a **separate clean profile** (no extensions, no bookmarks bar, no signed-in avatar, no saved-password prompts).
- **Display:** record at **1920×1080**. On a laptop with a higher-resolution panel, set display scaling to 100% or record a 1920×1080 region.
- **Window:** maximized; press **F11** for full-screen so the address bar and tabs disappear (exit with F11 after recording).
- **Zoom:** **100%** (Ctrl/⌘ 0). Do not change zoom during the take.
- **One tab only.** Close everything else. Mute notifications (Windows Focus Assist / macOS Do Not Disturb), quit chat apps.
- **No developer tools, console or terminal on screen** at any point.

## 2. Application startup (off camera)

```bash
npm run validate:demo     # must end with READY
npm run demo:prod         # optimized build, fastest page loads
```

Leave the terminal minimized on another desktop/monitor.

## 3. Demo reset and starting page

Open **`http://localhost:3000/login?reset=1&focus=1`**

This single URL restores the deterministic seed, signs nobody in, shows the **login page** and turns on **Focus mode** (sidebar hidden, compact top navigation). The address bar cleans itself to `/login`. Sign in as **Executive / Leadership** after the title card.

Then, before pressing record:

1. Wait **2 seconds** for KPI numbers and charts to finish animating.
2. Do one silent warm-up hover over the KPI cards (fonts and charts are cached).
3. Confirm on screen: login banner *LOCAL DEMO | ILLUSTRATIVE DATA* and four demo accounts. After signing in as Executive: **Savings realized $2.76M**, **Savings opportunity $19.3M**.
4. Park the cursor in the empty area to the right of the page title.
5. Press F11 (full screen) if not already.

Repeat this reset before **every** take.

## 4. Exact navigation and silent intervals

Follow `docs/5-Minute-Executive-Demo.md` → section B (scene by scene) or section D (20-step click path).

The caption file assumes the silent intervals below. Do these clicks without speaking. Do not pad the narration to cover them.

| Scene | Window | Silent lead-in | Silent tail | Spoken span | Words | Narration at 140 wpm |
|---|---|---|---|---|---|---|
| Opening | 00:05–00:32 | — | 4 s — **Executive / Leadership** → **Sign in** | 23 s | 48 | 21 s |
| Executive Overview | 00:32–01:05 | 1 s — page settles | — | 32 s | 61 | 26 s |
| Opportunity and drill-down | 01:05–01:35 | — | 5 s — **Log out** | 25 s | 43 | 18 s |
| FinOps assigns an owner | 01:35–02:15 | 5 s — **FinOps Practitioner** → **Sign in** | 5 s — **Log out** | 30 s | 43 | 18 s |
| Engineering execution | 02:15–03:30 | 5 s — **Engineering Owner** → **Sign in** | 5 s — **Log out** | 65 s | 84 | 36 s |
| FinOps verification | 03:30–03:58 | 5 s — sign in | 5 s — **Log out** | 18 s | 33 | 14 s |
| Executive outcome | 03:58–04:30 | 5 s — sign in | — | 27 s | 49 | 21 s |
| Close | 04:30–04:55 | — | 1 s | 24 s | 43 | 18 s |

Totals: **404 spoken words ≈ 2:53** of narration, **46 s** of silent sign-in and log-out, and 10 s of title and end cards. That leaves ≈ 71 s for dialogs, page loads and pauses, mostly inside the Engineering scene (five confirmation dialogs).

Regenerate captions after any narration change with `python3 scripts/video/build-captions.py`. It refuses to build if a scene no longer fits. Then run `npm test`; `tests/demo-docs.test.ts` checks the script, captions and app stay in sync.

## 5. Mouse movement guidance

- Move the cursor **only to the next target**, in a straight line, at a steady speed. No circling, no “pointing” wiggles.
- **Hover 1 second** on a number before talking about it; it gives the viewer’s eye a landing point.
- **Click deliberately**, then keep the cursor still until the page settles (≈ 0.5 s).
- **Scrolling:** one slow mouse-wheel motion (or trackpad glide) down to the **Savings drill-down** card. Never scroll fast or back and forth.
- After a dialog closes, move the cursor away from the toast area (bottom right).
- Login page: pause half a second on the account card before **Sign in** so the role is readable.
- Optional: enable a subtle cursor highlight in your recorder (e.g. a soft yellow halo). Avoid click sounds.

## 6. Voiceover

- **Voice:** a senior FinOps leader explaining to a CIO — calm, plain, unhurried (≈ 140 words per minute). Not a commercial.
- **Recommended workflow:** record the screen first with the script read *silently* for timing, then record the voiceover separately in a quiet room with a USB/XLR microphone, and align in the editor. This produces the cleanest result.
- **Alternative:** record live with a headset microphone; keep 0.5 s of silence around clicks for clean edits.
- Say numbers exactly as written in `docs/demo-script.txt` (“two point seven six million”).
- Always keep the disclosure phrases: “local demonstration on illustrative data, with a simulated sign-in” (opening), “simulated” (change approval and verification), “within this demonstration” (savings change) and “the figures today are illustrative” (close).
- Voice tools: if a synthetic voice is used, choose a natural, mid-tempo business voice and disable any “excited” style.

## 7. Timing

| Version | Spoken words | Narration at 140 wpm | Silent sign-in/log out | Total | Use |
|---|---|---|---|---|---|
| **Primary 5:00** | 404 | 2:53 | 46 s (scene table above) | 4:50 + 10 s cards | Final video and live presentation |
| **Backup 4:35** | 182 | 1:18 | ≈ 45 s | 4:25 + 10 s cards | When rehearsals run long |

Rehearse twice with a stopwatch. Scene checkpoints for the primary version: **0:32 · 1:05 · 1:35 · 2:15 · 3:30 · 3:58 · 4:30 · 4:55**.

If you are more than 10 s late at 2:15, skip the **Audit** tab in the FinOps scene (≈ 3 s) and open REC-2041 from the **Largest item** card instead of **Ready for you** (≈ 2 s). If still late at 3:58, skip opening the record in the Executive outcome scene.

**Access-control demo** (`docs/Access-Control-Demo.md`, 60–90 s) is recorded or presented separately. It needs the address bar visible, so exit full screen first.

## 8. Editing

1. 00:00–00:05 — **title-card.png** (cross-dissolve 0.5 s into the app).
2. App recording, trimmed of any dead time before the first frame.
3. Optional lower-third labels: the scene name at each scene start time (run of show, section A of the script).
4. Captions: import `docs/demo-script.srt`; nudge cues to the final voice track.
5. 04:55–05:00 — **end-card.png** (dissolve 0.5 s).
6. **Music:** none by default. If used, extremely subtle corporate ambient under the title and end cards only, at least −30 dB, never under the voice.
7. Export **1920×1080, 30 fps, H.264, high bitrate (≥ 12 Mbps)**, AAC 48 kHz.
8. Final check: no address bar, no terminal, no developer tools, no personal notifications, the *LOCAL DEMO • ILLUSTRATIVE DATA* pill visible in every app frame.

## 9. Fallback

See `docs/Demo-Fallback.md`. The universal recovery is the start URL `…/login?reset=1&focus=1` plus the re-entry table to resume at any scene. For recordings, re-record the affected scene and cut on a log out / sign in.

## 10. End card

Hold `docs/video/end-card.png` for 5 seconds after the closing line:

> FINOPS COMMAND CENTER — Visibility → Accountability → Optimization → Realized Value — LOCAL DEMO | ILLUSTRATIVE DATA

## Pre-flight checklist

- [ ] `npm run validate:demo` → READY
- [ ] `npm run demo:prod` running
- [ ] Clean browser profile, 100% zoom, full screen, notifications off
- [ ] `/login?reset=1&focus=1` loaded, login page visible, nobody signed in
- [ ] Microphone level checked (peaks around −12 dB)
- [ ] Script and cheat sheet on a second screen or printed
- [ ] Stopwatch ready
