# Contact Discovery Worker

Python FastAPI service used for resume tailoring and contact discovery. **For full project setup and how to start the app, see the [repository root README](../../README.md).**

## Setup (worker only)

From this directory (`services/worker`):

**Windows (PowerShell):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

With the virtual environment activated:

```bash
uvicorn app.main:app --reload --port 8001
```

Or from the project root: `npm run worker` (uses the venv in `services/worker`).

## Environment

Create a `.env` file in `services/worker` (copy from `.env.example`) or set:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (for resume) | OpenAI API key for resume tailoring |
| `CONTACTS_DATABASE_URL` | No | Default `sqlite:///./contacts.db` |
| `CONTACT_DISCOVERY_PROVIDER` | No | `manual` or `gemini` |
| `GEMINI_API_KEY` | If provider is `gemini` | For Gemini-based contact discovery |
