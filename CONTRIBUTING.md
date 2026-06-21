# Contributing to FinSim

FinSim is a graduate project with four members, so our workflow should make collaboration visible without creating process for its own sake. A useful pull request is better than a pile of tiny commits, and a thoughtful review counts as real work too.

## Setting up once

Clone the repository, install the dependencies, and make sure the website runs:

```bash
git clone https://github.com/YOUR-USERNAME/FinSim.git
cd FinSim
npm install
npm run dev
```

Keep secrets in a local `.env` file. Keep all financial fixtures synthetic. Real statements and personal transactions do not belong in Git, even in a private repository.

## Starting a task

Pull the newest `main` branch before creating your own branch:

```bash
git switch main
git pull origin main
git switch -c feat/12-pdf-parser
```

Our branch format is `<type>/<issue-number>-short-description`. For example:

- `feat/12-pdf-parser`
- `fix/27-forecast-range`
- `docs/31-threat-model`

If the work cannot be described in one short branch name, the issue may be too large and should probably be split first.

## Committing and sharing the work

Commit a complete, understandable change rather than every few minutes of activity:

```bash
git add path/to/changed-file
git commit -m "feat: normalize statement transaction dates"
git push -u origin feat/12-pdf-parser
```

Open a pull request and write `Closes #12` in its description. Include the tests, screenshots, metrics, or sample output that help another teammate review it confidently.

At least one teammate should approve the pull request. When possible, rotate reviewers so everyone learns more than their own workstream.

## When a task is actually done

A task can move to **Done** when:

- Its acceptance criteria are met.
- New logic has tests or representative fixtures.
- Frontend changes pass `npm run lint` and `npm run build`.
- No private financial data or secrets have slipped into the change.
- Relevant documentation or API contracts have been updated.
- A teammate has reviewed and approved the pull request.

## Commit language

Start commit messages with `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, or `ci`. Keep the rest short and describe the outcome. This produces a Git history that a recruiter can follow. It will also make sense to us when we return to it later.
