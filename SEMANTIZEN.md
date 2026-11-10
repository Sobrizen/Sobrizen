# SémantiZen

Original semantic-guessing game, independent of Cémantix. The mechanic compares meaning/context, not character overlap. No vendor game assets or private API are used.

## Data

`npm run prepare:semantic` downloads Jean-Philippe Fauconnier's 2015 frWac skip-gram 200-dimensional model (CC BY 3.0). Its SHA-256 is pinned in the preparation script. Model checksum failure stops publication. An approximately 30,000-word subset and int8 per-vector quantization produce the public vocabulary/vector assets; cosine normalizes the quantized vectors on use. The large original stays in node_modules/.cache and is never deployed. First preparation requires network; subsequent runs verify and reuse generated files. `SOBRIZEN_WORD_MODEL` permits a local, checksum-verified source. Runtime data is lazy loaded on opening this game, verified with SHA-256, and never fetched from a model provider. No AI inference bill or secret is needed. Credit/license/modifications are public in semantizen-credits.html and help.

## Play

Daily rotation uses Europe/Paris civil dates and a fixed shuffled target pool, not server requests. Free play draws a different target. A real account needs Premium; demo can try the daily puzzle without storage writes. Duplicate and unknown guesses do not consume attempts. Accents are respected, with accentless fallback only for unambiguous words. Every recognized guess gets cosine temperature and nearest-neighbor rank. Up to three hints come from actual neighbors. Reveal is confirmed and excludes the round from records. Sharing copies only the result, never the answer or guesses.

Rounds remain in session memory across closing/reopening, not across page reloads. Session changes discard them and stale asynchronous loads cannot reopen an old dialog. At most five rounds are retained. Public data may be cached by the browser; private guesses are not persisted in browser storage. The game is for leisure: no public competition, anti-cheat claim, diagnosis or health metric.

## Record

A victory without hints submits `score = 1000000 - attempts`, level zero and no timer. Existing maximum-score merge thus retains the minimum attempts. The card decodes to a human-readable attempt count; assisted wins and reveal do not submit. Records remain client-reported and owner/Premium-protected, like the other games. Apply the additive semantizen migration before publishing frontend that recognizes its game ID; it keeps previous game records, RLS and function privileges.

## Verification

Use the added core/data and DOM tests, then the complete npm test and npm run build. The original thirteen game interaction tests remain separate from the new semantic-game flow. Deployment and exact final test results must be recorded after execution; this file does not assert a production deployment by itself.
