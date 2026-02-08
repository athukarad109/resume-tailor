# Lets Get a Job

Next.js frontend and Python worker for resume tailoring and contact discovery.

## Prerequisites

- **Node.js** (v18+)
- **npm**
- **Python** (3.10+)

## Setup

### 1. Install frontend dependencies

From the project root:

```bash
npm install
```

### 2. Set up the Python worker

The worker is required for **resume tailor** (PDF + job description → tailored resume) and **contact discovery**.

**Windows (PowerShell):**

```powershell
cd services/worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
cd services/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment

Copy the example env file and add your keys:

```bash
# From services/worker
cp .env.example .env
```

Edit `services/worker/.env` and set at least:

- **`OPENAI_API_KEY`** – required for resume tailoring.

Optional (for contact discovery):

- `CONTACTS_DATABASE_URL` (default: `sqlite:///./contacts.db`)
- `CONTACT_DISCOVERY_PROVIDER` (default: `manual`; use `gemini` for Gemini-based discovery)
- `GEMINI_API_KEY` – required when `CONTACT_DISCOVERY_PROVIDER=gemini`

## Run the project

### Option A – Run everything with one command

From the project root:

```bash
npm run dev:all
```

This starts both the Next.js app and the worker.

### Option B – Run in two terminals

| Terminal 1 (worker)     | Terminal 2 (Next.js) |
|-------------------------|----------------------|
| `npm run worker`        | `npm run dev`        |

**URLs:**

- **App:** [http://localhost:3000](http://localhost:3000)
- **Worker API:** [http://localhost:8001](http://localhost:8001)

Open [http://localhost:3000](http://localhost:3000) to use the app. Resume tailor is at `/resume`, contact discovery at `/contacts`.

## Worker-only (from repo root)

To run only the worker (e.g. for debugging):

```bash
npm run worker
```

Or from `services/worker` with the venv activated:

```bash
uvicorn app.main:app --reload --port 8001
```

See [services/worker/README.md](services/worker/README.md) for worker-specific details.
