# Dev Reference

## Start

**Backend** (terminal 1)
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

**Frontend** (terminal 2)
```bash
cd frontend
npm run dev
# → http://localhost:5173
```

---

## Restart

**Backend** — press `Ctrl+C` in its terminal, then:
```bash
uvicorn main:app --reload
```

**Frontend** — press `Ctrl+C` in its terminal, then:
```bash
npm run dev
```

If the venv isn't active (you see `ModuleNotFoundError`):
```bash
source backend/.venv/bin/activate
```

---

## Stop

`Ctrl+C` in each terminal.

If a port is stuck (process didn't die cleanly):
```bash
# Kill whatever is on port 8000
lsof -ti :8000 | xargs kill -9

# Kill whatever is on port 5173
lsof -ti :5173 | xargs kill -9
```

---

## Cold start (first time or fresh machine)

```bash
# Backend venv — only needed once
cd backend
/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend deps — only needed once
cd frontend
npm install
```

```bash
# Env — only needed once
cp .env.example .env
```

Fill in `NEBIUS_API_KEY`, `SUPABASE_URL` and `SUPABASE_KEY` before starting the backend.
It reads them at import, so a missing key is a `KeyError` on startup, not a failure later.

If you already have a `.env` with real keys in it, skip the `cp`. It overwrites.

---

## Logs (background mode)

```bash
# Run backend silently and log to file
cd backend && source .venv/bin/activate
uvicorn main:app --reload > /tmp/backend.log 2>&1 &

# Run frontend silently and log to file
cd frontend
npm run dev > /tmp/frontend.log 2>&1 &

# Watch logs live
tail -f /tmp/backend.log
tail -f /tmp/frontend.log
```
