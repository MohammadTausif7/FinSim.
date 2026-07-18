# Product roadmap

FinSim is split into four workstreams so each part of the product has a clear owner and a clear contract with the rest of the system.

## Workstreams

| Workstream | Responsibilities | Done means |
|---|---|---|
| Product and frontend | Brand, navigation, responsive pages, account flow, statement upload experience, review dialogs, dashboard integration | Main user flow works end to end, UI is readable in light and dark mode, and `npm run lint` plus `npm run build` pass |
| Document intelligence | PDF inspection, bank adapters, transaction extraction, date and amount normalization, reconciliation checks | Supported statement layouts have tests, unknown layouts fail safely, and extracted CSV follows the shared contract |
| Transaction processing | Data cleaning, duplicate checks, merchant normalization, category rules, user feedback, remembered merchant choices | Category decisions are explainable, uncertain rows are routed to review, and feedback updates future matching merchants |
| Analytics and forecasting | Monthly summaries, category breakdowns, spending trends, anomaly candidates, forecast ranges | Reports serialize cleanly for the API, forecasts avoid future leakage, and anomaly explanations are understandable |

## MVP milestone

Goal: let a user create an account, verify it, upload at least three monthly statements, review uncertain merchants, and see dashboard analytics.

Acceptance criteria:

- User account can be created, verified, signed in, and signed out.
- New accounts start empty and guide the user to statement upload.
- Upload rejects too few statements, duplicates, non PDFs, oversized files, and conflicting statement types.
- Processing jobs are scoped to the signed in user.
- Merchant review groups repeated descriptions together.
- Remembered merchant choices apply to later jobs for the same user.
- Dashboard, analytics, and forecast pages update after processing.
- Docs explain setup, testing, security, deployment, and contribution workflow.

## Quality gates

Before a PR is merged:

```bash
python -m unittest discover -s processing_api/tests -v
python -m unittest discover -s analytics_engine/tests -v
python -m unittest discover -s transaction_processing/tests -v
python -m unittest discover -s document_intelligence/tests -v
npm run lint
npm run build
git diff --check
```

## Collaboration rules

- Keep branches small and named after the task.
- Include test evidence in every pull request.
- Review at least one workstream outside your own.
- Never commit real statements, account numbers, database files, secrets, or `.env` files.
- Use synthetic or safely redacted fixtures only.
