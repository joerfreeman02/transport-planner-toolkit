# Accessibility Assessment — Release Test Matrix

## Benchmark environments
- Chrome on Windows
- Chrome on macOS
- Safari on macOS/iPhone
- Home network
- Work network where permitted

## Benchmark sites
1. Urban: Plaistow test site
2. Suburban: to be selected
3. Rural: to be selected

## Gate A — Location Engine
- Address resolves correctly
- Coordinates display correctly
- Map tiles are coherent
- Pin can be moved
- Search is blocked until confirmation

## Gate B — Facility Data Engine
- One primary request only
- One optional extension only
- Sequential mirror failover works
- Timeout returns a visible error
- Query failure is not treated as an empty result

## Gate C — Classification Engine
- Known bus stop and GP are identified
- Schools are correctly separated
- Supermarket and convenience store are not conflated
- Pharmacy/dentist/hospital/post office require their own tags
- Rail modes remain separate
- No unrelated repeated feature across categories

## Gate D — Routing Engine
- Walking and cycling routes return where possible
- Distances/times are plausible against manual checks
- One failed route does not stop others
- Fallback values are labelled
- Route lines can be toggled

## Gate E — Review and outputs
- Reject, replace, add and edit work
- Confirmation safeguards work
- CSV records source and route status
- Wording inclusion is user-controlled

## Stable release gate
All Gate A–E checks pass at all three benchmark sites with no critical defects.
