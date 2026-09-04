# Product Owner manual acceptance — BUS-1 Alpha.4

No developer tools are required. Open the supplied review link and record browser, date, unexpected wording and the step number. Acceptance is only complete when the Product Owner explicitly records it.

1. Confirm the header shows `2.0.0-alpha.6` and `ATLAS-2.0.0-alpha.6-20260904`.
2. Open Report Builder, Modules, Projects and About. Confirm About shows `EAS FORGE — Framework for Operational Research, Governance & Engineering` and the approved creator profile.
3. In Modules, confirm the five cards remain correctly labelled and **Open legacy Toolkit** is clearly visible.
4. Enter `33 Westow Street, Crystal Palace`, select **Find site**, choose the property beginning `33, Westow Street`, check the point and confirm it. Do not accept a materially different address.
5. Select **Build Bus assessment**. Confirm nearby stop markers are subordinate to the site marker; stop rows show name, direction/letter, routed walking distance/time, routed cycling distance/time and routes; each stop has Google Maps verification.
6. Confirm the Bus Service Summary has only Route, Operator, Origin/destination, Principal locations and Operating period. Material qualifications must appear as full-width `Service note:` rows; normal rows must not show empty notes. No frequency column or bus `tph`/`bph` wording is permitted.
7. Read Assessment wording and Sources and checks. Confirm the normal wording is understandable without software knowledge, uses only evidenced routes/places, and does not claim service quality. Technical details should remain closed unless diagnosing.
8. Change the assessment point and confirm the earlier Bus result disappears until the changed point is reconfirmed and rebuilt.
9. Use manual coordinates `51.6857829, -0.0330001` for the Waltham Cross town-centre control. Confirm the point is outside Greater London, authoritative NaPTAN stops and BODS timetable summaries appear, opposite directions remain separate, and walking/cycling values are routed.
10. Use manual coordinates `52.2053, 0.1218` for the Cambridge regional-city control. Confirm national stops, services and routed access appear without any London-specific behaviour.
11. Temporarily disconnect networking or ask engineering to exercise the controlled failure fixture. Confirm ATLAS distinguishes unavailable stop information, unavailable timetable information and unavailable routing from a genuine zero result, explains what to do next, and never substitutes straight-line access.
12. Check approximately 1440 px, 1024 px and mobile width. Confirm no horizontal overflow, table catastrophe, unusable map or dominant technical diagnostics.
13. Select **Open legacy Toolkit**. Confirm the dashboard and established legacy Accessibility, Railway, Bus, STATS19, Drawing Generator and Shared Library access remain available.

Frequency methodology note: the deterministic calculation is implemented, but production deliberately shows no typical-weekday frequency until an exact representative window is approved.
