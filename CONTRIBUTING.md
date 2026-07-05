# Contributing to FinSim

FinSim is a four person graduate project, so the workflow should show real collaboration without turning every change into ceremony. A good pull request explains the outcome, includes test evidence, and keeps private financial data out of the repository.

## Team ownership

- Mohammad owns product direction, frontend, authenticated user flow, and deployment readiness.
- Soumya owns document intelligence, statement parsing, bank adapters, and extraction contracts.
- Sahasra owns cleaning, merchant normalization, categorization, and feedback rules.
- Anvitha owns analytics, forecasting, anomaly detection, and report outputs.

Everyone should still review and test outside their own area.

## Starting work

Always start from the latest `main`:

```bash
git switch main
git pull --ff-only origin main
git switch -c increment-2/your-name
```

For the class workflow, we used owner branches such as:

- `increment-2/mohammad`
- `increment-2/soumya`
- `increment-2/sahasra`
- `increment-2/anvitha`

For future work, use a short descriptive branch if it is not tied to one owner, for example `fix/upload-validation` or `docs/deployment-readiness`.

## Before committing

Run the checks that match your area. For a full project check:

```bash
source .venv/bin/activate
python -m unittest discover -s processing_api/tests -v
python -m unittest discover -s analytics_engine/tests -v
python -m unittest discover -s transaction_processing/tests -v
python -m unittest discover -s document_intelligence/tests -v
npm run lint
npm run build
git diff --check
```

Also run:

```bash
git status --short
```

Make sure you are not committing `.env`, databases, raw statements, generated builds, `node_modules`, or private data.

## Commit and push

Stage only the files you meant to change:

```bash
git add path/to/file
git commit -m "Clear short commit message"
git push -u origin your-branch-name
```

Use commit messages that describe the outcome, such as:

- `Add Bank of America statement adapter`
- `Improve merchant category review grouping`
- `Connect frontend to account analytics`
- `Document deployment readiness checklist`

## Pull requests

Every PR should include:

- What changed
- Why it changed
- How it was tested
- Any known limitations
- Screenshots for visible UI changes

At least one teammate should review before merging. Keep `main` protected and avoid direct pushes to `main`.

## Data safety rules

Never commit:

- Real bank statements
- Real transaction exports
- Account numbers
- Passwords
- API keys
- `.env` files
- SQLite database files
- Raw upload or output folders

Use synthetic or safely redacted test fixtures only. If sensitive data is committed by mistake, pause work and tell the team. Do not simply delete it in a later commit.
