# Running FinSim in VS Code

This guide is for every project member setting up the integrated FinSim MVP.

## Install required tools

- Visual Studio Code
- Git
- Node.js 22.12 or newer
- npm 10 or newer
- Python 3.11 or newer

Check versions:

```bash
git --version
node --version
npm --version
python3 --version
```

## Clone the project

```bash
git clone https://github.com/YOUR-USERNAME/FinSim..git
cd FinSim.
code .
```

If `code .` is unavailable, open VS Code and choose **File → Open Folder**.

## Install frontend packages

```bash
npm ci
```

## Install Python packages

Create a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install all local Python workspaces:

```bash
python -m pip install --upgrade pip
python -m pip install -e document_intelligence -e transaction_processing -e analytics_engine -e processing_api
```

Copy the example environment file:

```bash
cp .env.example .env
```

## Run the API

In one terminal:

```bash
source .venv/bin/activate
uvicorn finsim_api.app:app --app-dir processing_api/src --reload --host 127.0.0.1 --port 8000
```

Open this URL to confirm the API is alive:

```text
http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## Run the website

In a second terminal:

```bash
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

## Test the real local flow

1. Create an account.
2. Copy the local verification token.
3. Verify the account.
4. Go to `Statements`.
5. Upload three consecutive monthly PDFs.
6. Review uncertain merchants if prompted.
7. Open Dashboard, Analytics, and Forecast.
8. Confirm the app says `Account data`.

Use synthetic or redacted statements only.

## Full check before pushing

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

## Common problems

### `source .venv/bin/activate` says the file does not exist

Create the environment first:

```bash
python3 -m venv .venv
```

### The frontend cannot connect to the API

Check that the API terminal is still running on port `8000`. Also confirm `.env` contains:

```text
VITE_PROCESSING_API_URL=http://127.0.0.1:8000
```

Restart `npm run dev` after changing `.env`.

### CORS error in the browser

For local work, `FINSIM_CORS_ORIGINS` should include:

```text
http://localhost:5173,http://127.0.0.1:5173
```

For deployment, it must match the exact frontend domain.

### Port 5173 is already in use

Vite may use a different port. Open the exact URL printed in the terminal.

### Node or npm is not recognized

Restart VS Code after installing Node.js. If it still fails, reinstall Node.js 22 LTS and make sure it is added to your system path.
