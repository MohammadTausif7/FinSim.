# Running FinSim in VS Code

This guide is for every project member. The current frontend does not need a database, Python, API keys, or an environment file. Node.js and Git are enough.

## Install these tools

### 1. Visual Studio Code

Download VS Code from [code.visualstudio.com](https://code.visualstudio.com/). The normal stable version is suitable.

### 2. Git

Install Git from [git-scm.com](https://git-scm.com/downloads). Confirm the installation in a new terminal:

```bash
git --version
```

Any recent Git 2.x version is suitable.

### 3. Node.js 22 LTS

Install Node.js 22 LTS from [nodejs.org](https://nodejs.org/). FinSim requires Node.js 22.12 or newer and npm 10 or newer.

Check both versions after installation:

```bash
node --version
npm --version
```

A correct result will look similar to:

```text
v22.12.0
10.9.0
```

Newer releases in the Node.js 22 line are also suitable. Close and reopen VS Code if its terminal cannot find Node after installation.

## Get the project

Each member should clone the GitHub repository. Replace the example address with the actual FinSim repository address:

```bash
git clone https://github.com/YOUR-USERNAME/FinSim.git
cd FinSim
```

Open the cloned folder in VS Code:

```bash
code .
```

If the `code` command is unavailable, open VS Code, choose **File**, choose **Open Folder**, and select the cloned `FinSim` folder.

Make sure VS Code is opened at the project root. The Explorer should show `package.json`, `src`, `docs`, and `README.md` at the top level.

## Install project packages

Open **Terminal**, then choose **New Terminal** in VS Code. Run:

```bash
npm ci
```

`npm ci` installs the exact versions recorded in `package-lock.json`. It is the preferred command for a fresh clone. Use `npm install` only when intentionally adding or updating a package.

The installation creates a local `node_modules` folder. It may take a minute and must not be committed to Git.

## Start the website

In the VS Code terminal, run:

```bash
npm run dev
```

Vite prints a local address, normally:

```text
http://localhost:5173
```

Open that address in a browser. Keep the terminal running while using the website. Most code and style changes appear automatically after saving a file.

Stop the website with `Ctrl + C` in the terminal.

VS Code also includes a project task named **FinSim: Start website**. Open the Command Palette with `Ctrl + Shift + P` on Windows or `Cmd + Shift + P` on macOS, search for **Tasks: Run Task**, and select it.

## Check the project before pushing

Run both checks:

```bash
npm run lint
npm run build
```

The lint command checks the React and TypeScript code. The build command checks TypeScript and creates the production files under `dist`.

The VS Code task **FinSim: Check code** runs both commands together.

## Available commands

| Command | Purpose |
|---|---|
| `npm ci` | Install the exact project packages from the lock file |
| `npm run dev` | Start the local development website |
| `npm run lint` | Check code quality |
| `npm run build` | Verify TypeScript and create a production build |
| `npm run preview` | Preview the completed production build locally |

## Recommended VS Code extensions

VS Code will offer two workspace recommendations:

- **ESLint** shows code issues inside the editor.
- **GitHub Pull Requests** makes it easier to review team pull requests.

Both are helpful, but only ESLint is important for normal frontend work. The project does not currently require a separate formatting extension.

## Using a branch for your work

Do not work directly on `main`. Before starting an assigned issue:

```bash
git switch main
git pull origin main
git switch -c feat/12-short-description
```

Replace the issue number and description with the assigned task. Before pushing, run the lint and build commands, then follow [CONTRIBUTING.md](../CONTRIBUTING.md).

## Files that must stay local

Do not commit:

- `node_modules`
- `dist`
- `.env` files
- Real bank statements
- Account numbers or personal transactions
- Passwords, tokens, or API keys

These rules apply even when the GitHub repository is private.

## Common setup problems

### `node` or `npm` is not recognized

Restart VS Code after installing Node.js. If the problem continues, reinstall Node.js 22 LTS and make sure the installer adds Node to the system path.

### PowerShell blocks `npm.ps1` on Windows

Use the terminal menu in VS Code to open **Command Prompt**, then run:

```text
npm.cmd ci
npm.cmd run dev
```

This avoids changing the computer's PowerShell security policy.

### Port 5173 is already being used

Vite normally selects the next available port. Open the exact address printed in the terminal rather than assuming it is always port 5173.

### The website looks outdated after pulling changes

Stop the server, update packages, and start it again:

```bash
npm ci
npm run dev
```

Then refresh the browser.

### `npm ci` reports that the lock file is out of date

Make sure the latest `package-lock.json` was pulled from `main`. Do not delete the lock file. Ask the teammate who changed dependencies to commit the updated lock file.
