# FinSim. Finance Simplified

FinSim started with a simple frustration: bank statements contain plenty of information, but they do very little to help someone understand their money.

The idea is to let a user upload a few monthly statements and turn them into something useful. This includes a clean transaction history, sensible categories, visual spending patterns, unusual activity alerts, and a realistic view of what next month may look like.

We are building the project over two increments. The repository currently contains **Member 1's frontend work for Increment 1**. It establishes the product identity and shows how the complete experience should feel before the data and machine learning services are connected. Members 2, 3, and 4 own the three data science workstreams.

## What is ready

- A responsive landing page and original FinSim brand mark
- Sign up and sign in screens
- A reusable application shell with navigation
- Dashboard and detailed analytics screens
- An interactive forecast simulator for the next month
- A workspace for statement uploads
- Profile, notification, privacy, and theme settings
- Light and dark themes that remember the user's choice

The screens use clearly marked sample data. They give the team a working interface and shared API target. Production authentication and financial processing are not connected yet.

## Running the website

Install Node.js 22.12 or newer, then open a terminal in this folder:

```bash
npm ci
npm run dev
```

Vite will print a local address, usually `http://localhost:5173`. Open it in a browser.

Friends setting up the project for the first time should follow the complete [VS Code setup guide](docs/vscode-setup.md). It covers required software, cloning, package installation, project commands, Windows troubleshooting, and the normal Git workflow.

Useful pages:

- `/`: landing page
- `/signup` and `/signin`: account flow prototypes
- `/dashboard`: financial overview
- `/analytics`: detailed spending analysis
- `/forecast`: adjustable forecast
- `/statements`: upload workspace
- `/settings`: account preferences

## Before opening a pull request

Run both checks:

```bash
npm run lint
npm run build
```

The first catches code quality problems. The second confirms that TypeScript and the production build both succeed.

## Frontend stack

- React and TypeScript
- Vite
- React Router
- Lucide icons
- A custom responsive design system rather than a prebuilt component library

The planned backend is a Python API with isolated document processing workers. The details live in [our architecture notes](docs/architecture.md), while [the sprint plan](docs/sprint-plan.md) explains how the work is divided across four people.

## Working as a team

We use small GitHub issues, feature branches, pull requests, and teammate reviews. [CONTRIBUTING.md](CONTRIBUTING.md) describes the normal daily workflow. If this is the first time publishing the repository, follow [the GitHub setup guide](docs/github-setup.md).

One rule matters more than all the others: **never commit a real bank statement, transaction export, account number, password, API key, or `.env` file.** Test data must be synthetic or safely redacted.

## What comes later

Increment 2 will connect this frontend to real authentication, secure uploads, statement parsing, transaction categorization, analytics APIs, forecasting, anomaly detection, and persistent storage.

## License

We have intentionally not chosen a license yet. The full team should agree before the repository becomes public. MIT is friendly for a portfolio project, but it also allows commercial reuse, so that choice should be deliberate.
