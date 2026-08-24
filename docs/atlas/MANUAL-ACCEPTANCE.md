# Product Owner manual acceptance

No developer tools or terminal commands are required.

1. Open the supplied ATLAS review link and confirm the header shows `2.0.0-alpha.1` and build `ATLAS-2.0.0-alpha.1-20260824`.
2. Select **Report Builder**, **Modules** and **Projects**. Confirm each opens cleanly and that planned areas are clearly labelled rather than presented as complete.
3. Return to **Modules**. Confirm Accessibility and Road Safety are Legacy, Bus is Data Engine development, Rail is Planned, and Drawings is WIP/legacy.
4. In **Nearby TfL bus stops**, leave `33 Westow Street, Crystal Palace, London` in the address box and select **Find address**. Allow several seconds for the controlled search.
5. Check that the returned property begins `33, Westow Street` and select **Confirm this Site**. Do not continue if a materially different address is shown.
6. Select **Find nearby bus stops**. Confirm a table appears with stop names, identifiers, distance, coordinates, TfL source, retrieval time and **Live · current** state.
7. Open **Provenance and warnings**. Confirm the TfL source endpoint is visible, anonymous request is `yes`, and embedded API key is `no`.
8. Select **Find nearby bus stops** again. Confirm the state becomes **Cached · valid** rather than pretending it is a new live request. **Refresh live TfL data** should return to a live result.
9. Select **Open legacy Toolkit** and confirm the existing dashboard remains available.

Record the browser, date, any unexpected message and the step number. This review is Product Owner acceptance only when explicitly recorded as such.

