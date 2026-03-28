# Step-by-step contribution workflow

## Phase 0: Setup (do this today)

### 1. Create the demo repo on GitHub
Go to https://github.com/new and create `claude-usage-contribution` (public, empty, no README).

### 2. Push this project
```bash
cd /Users/omsatyaswaroop/nemoclaw/claude-usage-contribution
git init
git add .
git commit -m "feat: unified claude usage observability — modules, tests, interactive demo

Combines #33978, #27915, #7328 into a single claude usage command.
7 TypeScript modules, 45 tests, zero dependencies, interactive demo."

git branch -M main
git remote add origin https://github.com/Omsatyaswaroop29/claude-usage-contribution.git
git push -u origin main
```

### 3. Enable GitHub Pages
Go to: https://github.com/Omsatyaswaroop29/claude-usage-contribution/settings/pages
- Source: Deploy from a branch
- Branch: main, folder: / (root)
- Save

Demo will be live at: https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/

### 4. Post the issue comments
Open `docs/ISSUE-COMMENTS.md` and post:
1. Main comment → https://github.com/anthropics/claude-code/issues/33978
2. Short comment → https://github.com/anthropics/claude-code/issues/27915
3. Short comment → https://github.com/anthropics/claude-code/issues/7328

### 5. Wait 3-5 days for maintainer feedback

---

## Phase 1: PR 1 — Parser + Aggregator + basic `claude usage`

### 1. Study the existing CLI structure
```bash
cd ~/claude-code  # your fork
grep -r "subcommand\|registerCommand\|yargs\|commander" --include="*.ts" -l
find . -path "*/commands/*.ts" -not -path "*/node_modules/*"
```

### 2. Create your feature branch
```bash
git checkout -b feat/usage-command
git fetch upstream
git rebase upstream/main
```

### 3. Adapt and copy source files
Key files for PR 1:
- src/types.ts
- src/usage-parser.ts
- src/usage-aggregator.ts
- src/formatters/terminal.ts
- src/commands/usage.ts
- src/index.ts

Adapt to match the repo's import style, CLI framework, and test conventions.

### 4. Commit with conventional commits
```bash
git add src/usage-parser.ts src/types.ts
git commit -m "feat(usage): add JSONL transcript parser with streaming support"

git add src/usage-aggregator.ts
git commit -m "feat(usage): add UsageAggregator with per-model/project breakdowns"

git add src/formatters/terminal.ts
git commit -m "feat(usage): add terminal formatter with bar charts and color"

git add src/commands/usage.ts
git commit -m "feat(cli): register claude usage subcommand"

git add src/__tests__/
git commit -m "test(usage): add parser and aggregator tests (45 passing)"
```

### 5. Push and open PR
```bash
git push origin feat/usage-command
```

PR title: `feat(cli): add claude usage command for usage analytics`

---

## Phase 2-4: Follow-up PRs

Same workflow:
```bash
git checkout main && git fetch upstream && git rebase upstream/main
git checkout -b feat/usage-rate-limits  # or feat/usage-mcp-budget
```

## Quick reference
```bash
git fetch upstream && git rebase upstream/main  # stay current
npx tsc --noEmit                                 # type check
npm test                                         # run tests
git diff --stat                                  # see changes
```
