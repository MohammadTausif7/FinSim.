# GitHub workflow

The repository already exists on GitHub. Use this guide for normal teamwork.

## Keep `main` protected

Recommended branch protection for `main`:

- Require a pull request before merging
- Require at least one approval
- Dismiss stale approvals after new commits
- Require conversation resolution
- Block force pushes
- Block branch deletion
- Require the CI quality check once GitHub has seen the workflow

Squash merge is a good default for this portfolio project because it keeps the history readable.

## Starting a branch

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
```

For later fixes, use a descriptive branch:

```bash
git switch -c fix/statement-upload-error
```

## Syncing an existing branch

```bash
git fetch origin
git switch your-branch-name
git pull --ff-only
```

If your branch needs the latest `main`:

```bash
git switch main
git pull --ff-only origin main
git switch your-branch-name
git merge main
```

Resolve conflicts carefully, run tests, then commit the merge if Git asks for one.

## Committing

```bash
git status --short
git add path/to/file
git commit -m "Explain the completed change"
git push -u origin your-branch-name
```

If push says you do not have permission, confirm you were invited as a collaborator and that your Git remote points to the team repository:

```bash
git remote -v
```

## Pull request checklist

Include:

- Summary
- Files or areas changed
- Test commands run
- Screenshots for UI work
- Notes about limitations or follow up work

After the PR is merged:

```bash
git switch main
git pull --ff-only origin main
```

Delete local branches only after you are sure the work is merged:

```bash
git branch -d branch-name
```

## Before making the repo public

- Check Git history for secrets or real financial documents.
- Confirm `.env`, database files, upload folders, output folders, and raw statements are ignored.
- Use only synthetic or redacted fixtures.
- Review [SECURITY.md](../SECURITY.md).
- Make sure the team agrees on the license.
