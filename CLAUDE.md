# โคตรร่ำรวย คาร์โก้ (kot-rhamruay-tracking)

Thai-first customer site for China–Thailand cargo: parcel tracking pulled from cnscargo.com, shipment lots, and order intake. Node + Express server (`server.js`) serving a static page (`public/`).

- Feature guides: `docs/features/README.md`. Read the feature's guide before changing it. Format and upkeep rules: `docs/FEATURE_NOTES.md`

## Commands

- `npm start`: run the server on `PORT` (default 3000)
- `npm test`: unit tests in `test/` (CNS parser runs against saved real CNS pages in `test/fixtures/`)
- `npm run check`: syntax check of server and client code, then the tests. Must pass before every commit.

## Rules

- UI copy is Thai. File names, APIs and identifiers are English.
- Look and feel stays on the brand: burgundy and gold, minimal, no extra text. Colors, radii and shadows come from the tokens in `:root` of `public/style.css`, never raw values in rules.
- Data from outside (cnscargo.com, user input) is untrusted. Escape it before it reaches HTML: use `textContent` or an escape helper, never raw `innerHTML` with outside data.
- Pin every external library to an exact version (no `@latest`, no unpinned CDN URLs).
- Be a polite client of cnscargo.com: cache results and rate-limit requests. Do not add bulk crawling or anything their `robots.txt` disallows.
- Money, shipping fees, weight and CBM used for billing use `decimal.js`, never JS `number`.
- Secrets stay in server-side env. Only `.env.example` with placeholders is committed.
- Do not deploy, push, incur cloud charges or delete data without explicit approval.
- Integrations are not complete until tested against the real service. Mark them `not verified with real service` until then.
- When a feature is added, or its behavior, rules or results change, update its guide in `docs/features/` and the index in the same commit, as described in `docs/FEATURE_NOTES.md`.
- Reuse before writing. Look for an existing module, helper or library that fits, and write new code only when nothing does. Do not add a new abstraction or dependency when an existing one can do the job.
- Keep one source of truth, so a change needs one edit. Status labels, validators and response code used in two or more places live in one shared file.
