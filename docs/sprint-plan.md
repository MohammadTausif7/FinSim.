# How we are splitting the first two increments

We have four people with complementary skills, so the plan gives each person ownership without turning the project into four disconnected pieces. Each increment lasts two weeks, or 10 working days. Everyone owns a workstream, tests and documents it, reviews someone else's work, and presents part of the demo.

We will keep the same names throughout the repository and GitHub issues:

- **Member 1: Product and Frontend**
- **Member 2: Data Science (Document Intelligence)**
- **Member 3: Data Science (Cleaning and Categorization)**
- **Member 4: Data Science (Analytics and Forecasting)**

## Increment 1: Foundation and vertical prototype

**Goal:** prove the flow from a fixture shaped like a statement to useful product screens without handling real customer data.

| Owner | Workstream | Tasks | Acceptance criteria |
|---|---|---|---|
| **Member 1: Product and Frontend** | Product shell and experience | Brand and interface tokens; landing and auth screens; persistent app navigation; dashboard, analytics, forecast, statements, and settings prototypes; responsive and theme states | All routes work at desktop and mobile widths; the light and dark theme persists; the demo forecast reacts to inputs; build and lint pass |
| **Member 2: Data Science (Document Intelligence)** | PDF to table prototype | Survey 3 or 4 synthetic statement layouts; extract table and text fields; normalize dates and amounts; emit the agreed transaction CSV schema; create redacted or synthetic fixtures | At least 95% row recall on team fixtures; balance and amount reconciliation report; failed rows go to a review file; unit tests cover each layout |
| **Member 3: Data Science (Cleaning and Categorization)** | Cleaning and category baseline | Deduplication, missing value and merchant normalization rules; taxonomy; explainable rule book baseline; labeled synthetic validation set; evaluation notebook | Reproducible pipeline; macro F1 and results for each category are reported; every classification includes the rule or model version and confidence |
| **Member 4: Data Science (Analytics and Forecasting)** | Metrics and predictive baselines | Define KPI formulas; aggregate monthly and category views; baseline range for the next month; anomaly rules using robust statistics; serialize demo outputs shaped for the API | No future data leakage; backtest included; forecast reports interval coverage and MAE; anomaly fixture tests; output matches shared contracts |

### Shared checkpoints

- Day 1: architecture decision record, taxonomy, transaction schema, and synthetic data policy.
- Day 3: sample parser output can render in the dashboard contract.
- Day 6: rule categorizer and analytics consume the same cleaned dataset.
- Day 8: complete demo using synthetic files; freeze features.
- Day 10: reviewed PRs merged, tagged `v0.1.0`, and demo recorded.

## Increment 2: Integrated and secure MVP

**Goal:** connect the vertical slice, harden it, and produce an honest release that is ready for the portfolio.

| Owner | Workstream | Tasks | Acceptance criteria |
|---|---|---|---|
| **Member 1: Product and Frontend** | Production web integration | Connect authentication and email verification; signed upload flow; live loading, error, and review states; accessible charts; account and data deletion; deployment configuration | Critical flow is accessible by keyboard; no sensitive browser logs; all API states are handled; responsive quality checks are complete; deployed preview is documented |
| **Member 2: Data Science (Document Intelligence)** | Parser service and review loop | Isolated upload worker; adapters for bank formats; OCR fallback for scanned PDFs; extraction confidence; manual correction payload; deletion and retention hooks | Idempotent jobs; timeout and file type limits; confidence for each field; integration tests; raw files automatically expire according to policy |
| **Member 3: Data Science (Cleaning and Categorization)** | Hybrid category engine | Add a supervised model or embeddings only if the baseline warrants it; merchant knowledge cache; user corrections and retraining data contract; model card | Beats the Increment 1 baseline on validation data; confidence threshold routes uncertain items to review; versioned artifacts; drift checks documented |
| **Member 4: Data Science (Analytics and Forecasting)** | Forecast and anomaly service | Calibrated prediction intervals; detection of recurring expenses; adjustable scenario endpoint; anomaly ranking and explanations; model monitoring card | Backtest by time split; interval coverage target met; explanations accompany every alert; latency and failure fallbacks measured |

### Shared checkpoints

- Day 2: authenticated API contract and threat model review.
- Day 5: staging integration with synthetic statements.
- Day 7: privacy, accessibility, and failure mode test day.
- Day 9: portfolio documentation, architecture diagram, model cards, and demo.
- Day 10: release candidate, retrospective, and tag `v1.0.0`.

## Keeping contributions fair

Commit count is a poor way to decide whether work was equal. One well tested parser can reasonably take fewer commits than several interface adjustments. In each increment, we will track one primary workstream, one review of another member's work, one testing or documentation task, and one demo segment per person. If a workstream grows unexpectedly, we will split the issue and rebalance a task of a similar size during the team meeting.

Our project board will use **Backlog → Ready → In progress → Review → QA → Done**. Each issue needs an owner, a 1/2/3/5 estimate, acceptance criteria, test evidence, and a target increment. That gives us a much more honest picture than a contribution graph.
