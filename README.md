# FinSim. Finance Simplified

FinSim turns monthly bank statements into a clear personal finance workspace. A user creates an account, verifies the account, uploads at least three consecutive monthly PDF statements, reviews any uncertain merchant categories, and then sees dashboard analytics, spending trends, anomaly candidates, and a next month forecast.

This repository is a two increment graduate team project. The current codebase is no longer only a static website prototype. It now has a working React frontend, a FastAPI processing API, local account persistence, PDF statement parsing, transaction cleaning and categorization, analytics, forecasting, anomaly detection, and user saved merchant feedback.

## Current project status

Working now:

- Responsive landing page, app shell, dashboard, analytics, forecast, statements, settings, sign up, sign in, and email verification screens
- Local account system with verified sign in, sign out, user scoped processing jobs, and saved account analytics
- Upload flow for 3 to 12 PDF statements, with file type, PDF signature, duplicate, size, and consecutive month checks
- Bank statement adapters for MidFirst, Discover, and Bank of America style statements
- Transaction extraction to a shared CSV shaped contract
- Merchant cleanup, category rulebook, user review loop, remembered merchant choices, and review explanations
- Monthly summaries, category breakdowns, spending trends, anomaly candidates, and baseline forecast ranges
- Full unit test coverage across the main Python workstreams plus frontend lint and production build checks

Still planned before a real public financial product:

- Production email provider instead of local verification tokens
- Managed production database instead of local SQLite
- Object storage and retention jobs for raw PDFs
- Stronger account controls such as password reset, deletion, audit logs, and optional MFA
- Deployment monitoring, backups, rate limiting at the edge, and production incident procedures

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | React and TypeScript frontend |
| `processing_api/` | FastAPI app for accounts, uploads, review jobs, saved transactions, and account analytics |
| `document_intelligence/` | PDF text/table extraction and bank specific adapters |
| `transaction_processing/` | Cleaning, merchant normalization, categorization, feedback, and rulebook |
| `analytics_engine/` | Monthly analytics, anomaly candidates, and forecast ranges |
| `docs/` | Architecture, setup, deployment, testing, and sprint planning notes |
| `.github/` | Pull request template, issue template, and CI workflow |

## Team roles

| Contributor | Responsibility |
|---|---|
| Mohammad | Product direction, frontend, authenticated user flow, deployment readiness |
| Soumya | Document intelligence, statement parsing, bank adapters, CSV extraction contract |
| Sahasra | Transaction cleaning, merchant normalization, categorization, feedback loop |
| Anvitha | Analytics, forecasting, anomaly detection, dashboard ready report outputs |

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- Python 3.11 or newer
- Git

## Local setup

Clone the repository and open the project root:

```bash
git clone https://github.com/MohammadTausif7/FinSim..git
cd FinSim.
```

Install frontend packages:

```bash
npm ci
```

Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install the Python packages in editable mode:

```bash
python -m pip install --upgrade pip
python -m pip install -e document_intelligence -e transaction_processing -e analytics_engine -e processing_api
```

Copy the example environment file:

```bash
cp .env.example .env
```

For local development, the defaults in `.env.example` are enough.

## Run locally

Start the API in one terminal:

```bash
source .venv/bin/activate
uvicorn finsim_api.app:app --app-dir processing_api/src --reload --host 127.0.0.1 --port 8000
```

Start the website in another terminal:

```bash
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

## End to end test flow

1. Start the API and frontend.
2. Open `http://localhost:5173`.
3. Go to `Sign up`.
4. Create a local account.
5. Copy the local verification token shown on screen.
6. Paste the token into the verification field and continue.
7. Go to `Statements`.
8. Upload at least three consecutive monthly PDF statements.
9. Wait for parsing and categorization.
10. Review uncertain merchants if the popup appears.
11. Go to `Dashboard`, `Analytics`, and `Forecast`.
12. Confirm the pages show account data instead of sample data.

Only use synthetic, demo, or safely redacted statements. Do not upload real financial documents to a public or shared demo.

## Validation commands

Run these before creating a pull request:

```bash
python -m unittest discover -s processing_api/tests -v
python -m unittest discover -s analytics_engine/tests -v
python -m unittest discover -s transaction_processing/tests -v
python -m unittest discover -s document_intelligence/tests -v
npm run lint
npm run build
git diff --check
```

## Security and privacy notes

- The app never asks for bank usernames or passwords.
- Uploaded files must be PDFs, must pass a PDF signature check, and are limited to 25 MB each.
- Processing jobs are tied to the signed in user.
- Local passwords are hashed with PBKDF2 SHA 256 and compared using constant time comparison.
- Session tokens are random bearer tokens stored in the local database.
- Local SQLite databases, `.env` files, uploads, outputs, `node_modules`, and builds are ignored by Git.
- CORS origins are locked to local development by default and must be explicitly configured for deployment.
- Production deployment must use HTTPS, private environment variables, managed database storage, backups, logging controls, and a clear retention policy.

See [SECURITY.md](SECURITY.md) and [docs/deployment.md](docs/deployment.md) before putting the project on the internet.

## Documentation

- [VS Code setup](docs/vscode-setup.md)
- [Architecture notes](docs/architecture.md)
- [Sprint plan](docs/sprint-plan.md)
- [Testing checklist](docs/testing.md)
- [Deployment guide](docs/deployment.md)
- [GitHub workflow](docs/github-setup.md)
- [Contributing guide](CONTRIBUTING.md)

## License

This project currently uses the repository license in [LICENSE](LICENSE). Review it as a team before using the project outside academic or portfolio work.
