"""Builds docs/demo-script.srt and docs/demo-script.txt from the 5:00 narration.

Each scene has a time window plus silent lead-in and tail seconds (sign-in, log out, dialogs the presenter
completes without speaking). Captions are placed only inside the spoken span, proportional to word count.
The build fails if any scene's narration cannot be spoken at 140 words per minute inside its spoken span.

The narration text here must match docs/5-Minute-Executive-Demo.md word for word (checked by tests/demo-docs.test.ts).
Run: python3 scripts/video/build-captions.py
"""
import pathlib
import re
import sys

WPM = 140  # measured executive delivery pace used for all timing estimates

# (start, end, scene, silent lead-in seconds, silent tail seconds, narration)
SEGMENTS = [
    ("00:05", "00:32", "Opening", 0, 4,
     "Most organizations can tell you what they spend in the cloud. Far fewer can show who is accountable for reducing it, and how much of that reduction is real. That is what FinOps Command Center does. This is a local demonstration on illustrative data, with a simulated sign-in."),
    ("00:32", "01:05", "Executive Overview", 1, 0,
     "This is the leadership view. We run at roughly twelve point two million dollars a month. There is nineteen point three million a year in open savings opportunity, and two point seven six million already verified. Verified, not estimated. But only fifty-seven percent of that open opportunity has an accountable owner. More than eight million dollars a year belongs to nobody."),
    ("01:05", "01:35", "Opportunity and drill-down", 0, 5,
     "Leadership can drill from product, to owner, to the individual recommendation, with estimated and verified savings always shown separately. In SAP, the largest unowned item is REC-2041: one point oh eight million dollars a year, validated, with six days left on its SLA."),
    ("01:35", "02:15", "FinOps assigns an owner", 5, 5,
     "FinOps now takes ownership of the pipeline. FinOps routes and tracks the work; it does not approve technical changes. REC-2041 goes to Priya Raman, who owns the SAP platform. That starts the SLA clock, and the decision is recorded in the audit trail."),
    ("02:15", "03:30", "Engineering execution", 5, 5,
     "Now Priya signs in. Her queue holds only the work assigned to her, with this item at the top. She accepts it and opens a ticket, linked to the record. She submits a remediation plan: a rolling resize in the weekend window, with a rollback path. Change approval stays with her change process, so she records the approval reference here; in this demonstration that step is simulated. Once the change is made, she submits implementation evidence, and the item moves to FinOps for verification."),
    ("03:30", "03:58", "FinOps verification", 5, 5,
     "FinOps signs back in and verifies the savings. In production that check runs against billing data after the change; here it is simulated. Only now does an estimate count as a realized saving."),
    ("03:58", "04:30", "Executive outcome", 5, 0,
     "Back in the leadership view, verified savings have moved from two point seven six to three point eight five million dollars a year, within this demonstration. Leadership can trace that number to the product, to the accountable owner, and to the record itself, with its ticket and its evidence."),
    ("04:30", "04:55", "Close", 0, 1,
     "That is the process: find the highest-value opportunities, assign clear accountability, let engineering deliver through its own change process, and count savings only once they are verified. The figures today are illustrative; the operating model is what we would take into a pilot."),
]

# Readable numerals for captions (the narration spells numbers out for natural delivery).
CAPTION_NUMBERS = [
    ("twelve point two million dollars", "$12.2 million"), ("nineteen point three million", "$19.3 million"),
    ("two point seven six million already", "$2.76 million already"), ("fifty-seven percent", "57%"),
    ("eight million dollars", "$8 million"), ("one point oh eight million dollars", "$1.08 million"),
    ("six days", "6 days"),
    ("two point seven six to three point eight five million dollars", "$2.76 million to $3.85 million"),
]


def secs(t):
    m, s = t.split(":")
    return int(m) * 60 + int(s)


def ts(x):
    ms = int(round(x * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def chunks(text, max_chars=84):
    out = []
    for sent in re.split(r"(?<=[.:;?!])\s+", text):
        line = ""
        for w in sent.split():
            if len(line) + len(w) + 1 > max_chars and line:
                out.append(line)
                line = w
            else:
                line = f"{line} {w}".strip()
        if line:
            out.append(line)
    return out


def caption(text):
    for a, b in CAPTION_NUMBERS:
        text = text.replace(a, b)
    return text


root = pathlib.Path(__file__).resolve().parents[2] / "docs"
srt, n, total_words, total_silent, problems = [], 1, 0, 0, []
txt = ["FinOps Command Center - 5-Minute Executive Demo (narration)", "LOCAL DEMO | ILLUSTRATIVE DATA", f"Timing basis: {WPM} words per minute", ""]
report = []
for start, end, title, lead, tail, text in SEGMENTS:
    words = len(text.split())
    total_words += words
    total_silent += lead + tail
    window = secs(end) - secs(start)
    span = window - lead - tail
    speech = words * 60 / WPM
    if speech > span:
        problems.append(f"{title}: {speech:.1f}s of narration does not fit a {span}s spoken span")
    report.append(f"{start}-{end}  {title:<28} window {window:>3}s  silent {lead + tail:>2}s  words {words:>3}  speech {speech:5.1f}s  slack {span - speech:5.1f}s")
    txt += [f"[{start}-{end}] {title} | silent lead {lead}s, tail {tail}s | {words} words", text, ""]
    parts = chunks(caption(text))
    weights = [max(1, len(p.split())) for p in parts]
    t = secs(start) + lead
    for p, w in zip(parts, weights):
        d = (span - 0.2) * w / sum(weights)
        srt += [str(n), f"{ts(t)} --> {ts(t + d - 0.05)}", p, ""]
        n += 1
        t += d

if problems:
    sys.exit("Timing check failed:\n  " + "\n  ".join(problems))

speech_total = total_words * 60 / WPM
txt += [
    f"Spoken words: {total_words}",
    f"Estimated narration time at {WPM} wpm: {int(speech_total // 60)}:{round(speech_total % 60):02d}",
    f"Planned silent interaction time (sign-in, log out, dialogs): {total_silent}s",
    "Title and end cards: 10s",
]
(root / "demo-script.srt").write_text("\n".join(srt), encoding="utf-8")
(root / "demo-script.txt").write_text("\n".join(txt) + "\n", encoding="utf-8")
print("\n".join(report))
print(f"{n - 1} cues, {total_words} words, narration {speech_total:.0f}s, silent {total_silent}s")
