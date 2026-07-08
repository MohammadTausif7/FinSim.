# Testing FinSim

Use this checklist whenever a pull request is ready, after a merge to `main`, and before deployment.

## Automated checks

From the project root, activate the Python environment and run:

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

All commands should pass before a PR is merged.

## Local end to end test

Start the API:

```bash
source .venv/bin/activate
uvicorn finsim_api.app:app --app-dir processing_api/src --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
npm run dev
```

Then test this flow in the browser:

1. Open `http://localhost:5173`.
2. Create a new account from `Sign up`.
3. Copy the local verification token.
4. Verify the account.
5. Confirm that the app shell shows account data instead of only sample data.
6. Go to `Statements`.
7. Upload three consecutive monthly PDFs.
8. Confirm invalid files, duplicate files, non PDF files, or missing months are rejected.
9. Complete the merchant review popup if it appears.
10. Confirm the dashboard updates with saved account analytics.
11. Open `Analytics` and check monthly summaries, category mix, trends, and anomaly candidates.
12. Open `Forecast` and confirm a next month range is shown.
13. Sign out and confirm account data is no longer available without signing in again.

## Browser checks

Check these widths:

- Mobile around 390 px
- Tablet around 768 px
- Desktop 1280 px and above

Check both light and dark themes. Text should remain readable, the financial health banner should look intentional, and navigation should still be reachable.

## Privacy checks

Before pushing or deploying:

```bash
git status --short --ignored
```

Make sure no real statement, database, `.env`, upload, output, or generated build folder is staged. If a real file was ever committed by accident, do not simply delete it in a later commit. Rotate any exposed secret and clean the Git history with team approval.
