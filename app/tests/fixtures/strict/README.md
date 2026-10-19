# Test inputs

`live-cases.json` contains ten synthetic, explicitly generated customer requirements. No real customer document or credential is sent by the live suite.

`review-source.pptx` is a copy of the provided test deck. `review-source.pdf` is the twelve-slide provided `build/fixtures/review_sample.pptx` converted to PDF during the migration fidelity check. `review-source.docx` is the minimal synthetic document used in the same parser check. They are retained here so the input-reader suite does not depend on ignored output files or LibreOffice being installed.

Other fixtures are synthetic test-only input data. No fixture is imported into the production web application. The browser harness blocks model calls for deterministic tests; successful real-model evidence is recorded separately by `live_backend.py`, `live_frontend.mjs`, `live_visual_review.mjs`, and `live_journey.mjs`.
