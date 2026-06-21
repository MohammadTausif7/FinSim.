# Publish and collaborate on GitHub

This guide starts from the repository we already have. There is no need to run `git init` again. Open a terminal in the FinSim folder and work through the steps once.

## 1. Create the first local commit

First, take a minute to review what will be committed:

```bash
git status
git diff --check
npm run lint
npm run build
```

Then create the first commit:

```bash
git add .
git commit -m "feat: establish FinSim increment one frontend"
```

## 2. Create an empty GitHub repository

On GitHub, choose **New repository** and use:

- Repository name: `FinSim`
- Visibility: private while real data and security boundaries are still being built
- Do **not** add a README, `.gitignore`, or license. The local repository already has the first two.

Copy the repository HTTPS URL, then run (replace `YOUR-USERNAME`):

```bash
git remote add origin https://github.com/YOUR-USERNAME/FinSim.git
git remote -v
git push -u origin main
```

If you prefer GitHub CLI and are already authenticated:

```bash
gh repo create FinSim --private --source=. --remote=origin --push
```

Use one method or the other, but not both. Otherwise Git will report that the remote already exists.

## 3. Invite the team

In **Settings → Collaborators**, invite all three teammates. Each person should clone the repository instead of downloading a ZIP:

```bash
git clone https://github.com/YOUR-USERNAME/FinSim.git
cd FinSim
npm install
```

## 4. Protect `main`

In **Settings → Branches → Add branch protection rule** for `main`, enable:

- Require a pull request before merging
- Require at least one approval
- Dismiss stale approvals after new commits
- Require status checks and select the CI `quality` job after it has run once
- Require conversation resolution
- Block force pushes and deletion

Keep merge methods to **Squash and merge** for a tidy portfolio history. Do not give everyone a habit of pushing directly to `main`.

## 5. Create the two increments

Create milestones named `Increment 1: Foundation` and `Increment 2: Integrated MVP`. Give each one a due date two weeks after its start. Create a GitHub Project with these columns:

`Backlog → Ready → In progress → Review → QA → Done`

Copy tasks from [sprint-plan.md](sprint-plan.md) into issues using the included feature template. Assign each issue to one person, one milestone, and a 1/2/3/5 estimate.

Useful labels:

- `area:frontend`, `area:parser`, `area:data`, `area:ml`, `area:analytics`
- `type:feature`, `type:bug`, `type:docs`, `type:experiment`
- `priority:high`, `priority:medium`, `priority:low`
- `blocked`, `needs-review`

## 6. Work through branches and pull requests

Example for issue 12:

```bash
git switch main
git pull origin main
git switch -c feat/12-pdf-parser
# make and test the change
git add path/to/files
git commit -m "feat: extract normalized statement transactions"
git push -u origin feat/12-pdf-parser
```

Open a pull request on GitHub, include `Closes #12`, add test evidence, and request a teammate review. After squash-merging:

```bash
git switch main
git pull origin main
git branch -d feat/12-pdf-parser
```

## 7. Make the portfolio history honest

- Use synthetic statements only; never commit a real PDF or account number.
- Keep experiments, metrics, and failed approaches documented. Notebook output without context is not evidence.
- Use pull request reviews to show collaboration.
- Tag the increment demos: `v0.1.0` after Increment 1 and `v1.0.0` after Increment 2.
- Add a real license only after the whole team agrees to its reuse terms.

When the integrated MVP is ready, make the repository public only after checking Git history for secrets and financial data, not merely the current files.
