# Suggestions & Deferred Ideas

Ideas that came up but weren't implemented. Review before starting new sessions.

---

## Typo correction as follow-up message

When a suggestion card containing a typo is sent, automatically copy the
correction (e.g. `"you*"`) to clipboard so the chatter can paste it as a
quick follow-up message — matching the natural human pattern of sending a
correction in a separate message.

Complexity notes:
- Needs to detect which suggestion was sent and whether it contains a typo
- Correction only makes sense after the chatter picks and sends a specific card
- No extra API call needed — derive the corrected word client-side
- Silent UX: no extra card, just clipboard on "Use →" click
