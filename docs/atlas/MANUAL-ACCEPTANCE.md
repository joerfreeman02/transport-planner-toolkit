# Product Owner manual acceptance

No developer tools or terminal commands are required.

Open the supplied remote ATLAS review link. Do not try to open `atlas/index.html` directly from a downloaded folder: the browser protects local files from loading the separate ATLAS modules and external information sources. Engineers may use a small local static server, but this is not the ordinary Product Owner review method.

1. Open the supplied ATLAS review link and confirm the header shows `2.0.0-alpha.3` and build `ATLAS-2.0.0-alpha.3-20260824`.
2. Select **Report Builder**, **Modules** and **Projects**. Confirm each opens cleanly and that planned areas are clearly labelled rather than presented as complete.
3. Open **About**. Confirm the full product name, EAS FORGE programme, **Created by Joe Freeman**, version, development status and data acknowledgements are clear.
4. Return to **Modules**. Confirm Accessibility and Road Safety are in the Existing Toolkit, Bus is In development, Rail is Planned, and Drawings is Under review.
5. Enter `33 Westow Street, Crystal Palace` and select **Find site**. Allow several seconds for the controlled search.
6. Check that the returned property begins `33, Westow Street`, select **Use this result**, check the map, and select **Confirm assessment point**. Do not continue if a materially different address or point is shown.
7. Select **Check nearby bus stops**. Confirm the table shows stop names, direction/stop letter, straight-line discovery distance, routes serving the stop, Google Maps link and source stop ID, with Transport for London, the checked time and **Up to date** shown above it. Confirm the map keeps the assessment point dominant and uses smaller markers for stops.
8. Open **Sources and checks**. Confirm the source, checked time and any professional points to note are understandable. Technical details should remain closed unless needed for diagnosis.
9. Select **Check nearby bus stops** again. Confirm the result still says **Up to date** and retains the original checked time. **Check again** should perform a new source check.
10. For a confirmed point outside the official Greater London boundary, confirm ATLAS routes to NaPTAN and reports **National coverage is not implemented yet**. It must not report that there are zero stops.
11. Select **Open legacy Toolkit** and confirm the existing dashboard remains available.

Record the browser, date, any unexpected message and the step number. This review is Product Owner acceptance only when explicitly recorded as such.
