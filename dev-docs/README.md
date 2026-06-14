# dev-docs

Source-of-truth development docs for lucid. One topic per file; link every
source-of-truth doc from here (`.claude/rules/20-logging-and-docs.md`).

| Doc | Topic |
|-----|-------|
| [architecture.md](architecture.md) | The LLM provider layer — contract, error model, secret hygiene, resilience |
| [plans/](plans/) | Per-feature implementation plans (`YYYYMMDD-feature-N-<slug>.md`) |

Other conventions:

- **Designs** — UI/UX surfaces are implemented only from a committed bundle under
  `dev-docs/designs/` (`.claude/rules/51-no-self-designed-ui.md`). The directory and
  `dev-docs/design-system.md` do not exist yet — they land with the first UI feature.
- **Verification** — Gate 5 acceptance evidence lives in `dev-docs/verification/`
  (`.claude/rules/47-feature-workflow.md`).
