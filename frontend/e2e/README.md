# End-to-end test

Drives the real UI through all five steps: paste notes, extract, confirm, screen,
open a trial breakdown. It asserts the things that were actually broken before —
that no summary on screen states a score contradicting the one displayed beside
it, and that the console stays clean.

This one is **not** part of `npm test`. It needs real Nebius credentials, both
servers running, and it spends money: roughly 17 model calls, a couple of
minutes, well under a dollar.

```bash
# terminal 1
cd backend && source .venv/bin/activate && uvicorn main:app

# terminal 2
cd frontend && npm run dev

# terminal 3
cd frontend/e2e
npm init -y && npm install @playwright/test && npx playwright install chromium
npx playwright test --config=playwright.config.mjs
```

Screenshots of each step land in `test-results/`.
