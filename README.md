# ✈️ TripMate AI — A Multi-Agent Travel Planner with LangGraph

An intelligent, multi-agent AI travel planning platform that turns natural-language trip requests into comprehensive, customized travel plans—complete with real-time flight suggestions, hotel recommendations, activity schedules, and structured day-by-day itineraries.

Built with **LangGraph**, **FastAPI**, **LangChain**, and **Google Gemini**.

---

## 🌟 Key Features

- 🤖 **Multi-Agent Orchestration**: Specialized agents handle flight research, hotel discovery, itinerary planning, and response synthesis.
- 💳 **Autonomous Sandbox Booking**: LangGraph validates a sandbox quote against trip and wallet policy, records an idempotent payment, and issues a dated sandbox reservation record and receipt. No supplier reservation or real payment is made.
- ✈️ **Flight Discovery**: Real-time airline and schedule lookups powered by AviationStack.
- 🏨 **Hotel & Destination Research**: Live web search and location research powered by Tavily.
- 📋 **Structured Itinerary Planning**: Pydantic-validated, day-by-day activity schedules and budget allocation.
- 💾 **Persistent Trips**: SQLite stores saved trip snapshots, itinerary versions, and trip edit messages. The React UI restores a trip from the backend using its saved ID; the LangGraph graph itself still has no checkpoint saver.
- 🌐 **React Web Interface**: React + TypeScript frontend with Vite development, destination discovery, planner, booking, and itinerary export.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, Uvicorn
- **Agent Orchestration**: LangGraph, LangChain
- **LLM**: Google Gemini (`google-genai`), Groq
- **Tools & APIs**: Tavily API, AviationStack API
- **Database / State**: SQLite for durable trips, itinerary versions, and the sandbox payment ledger; PostgreSQL is an optional payment-ledger backend
- **Cache**: Redis for reusable public provider lookups, with an in-process fallback
- **Frontend**: React, TypeScript, Vite; existing Jinja templates and static browser client retained as a fallback during migration

---

## 📁 Project Structure

```text
├── app.py                     # FastAPI application entry point & routes
├── backend.py                 # LangGraph multi-agent workflow & state graph
├── requirements.txt           # Python dependencies
├── frontend/                  # React/Vite application
│   ├── src/                   # Planner, discovery, itinerary, booking, API client
│   ├── package.json           # Frontend scripts and dependencies
│   └── vite.config.ts         # API proxy for local development
├── static/                    # Existing styles and legacy browser scripts (fallback)
│   ├── style.css              # Application styling
│   ├── script.js             # Client-side planner interactions
│   └── discover.js           # Discovery page scripts
├── templates/                 # Jinja2 HTML templates
│   ├── index.html             # Main travel planner interface
│   └── discover.html          # Destination discovery page
├── tools/                     # Agent tools & integrations
│   ├── flight_tool.py         # AviationStack flight search tool
│   └── tavily_tool.py         # Tavily web & hotel search tool
├── .env.example               # Template environment configuration
└── README.md                  # Project documentation
```

---

## 🚀 Quick Start Guide for Friends & Teammates

### 1. Prerequisites

Ensure you have installed:
- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 20.19+ or 22.12+](https://nodejs.org/) for the React frontend
- [Git](https://git-scm.com/)

Redis is optional. Without a Redis server, TripMate uses a bounded in-process cache and the rest of the app continues to work. For shared caching, install Redis locally or use a managed Redis service and set `REDIS_URL`.

---

### 2. Clone the Repository

```bash
git clone https://github.com/Krishacde/demo-repo-ai-project.git
cd demo-repo-ai-project
```

---

### 3. Set Up Virtual Environment

**On Windows (PowerShell / Command Prompt):**
```powershell
python -m venv .venv
.venv\Scripts\activate
```

**On macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

---

### 5. Configure Environment Variables

Copy the example configuration file:

```bash
cp .env.example .env
```

Open `.env` in your editor and provide your keys:

```env
# LLM API Keys
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Tool API Keys
TAVILY_API_KEY=your_tavily_api_key_here
AVIATIONSTACK_API_KEY=your_aviationstack_api_key_here

# Default Departure Airport
DEFAULT_ORIGIN_IATA=JFK
```

---

### 6. Run the Application

### Development with the React client

Install frontend packages once, then start React and FastAPI together from the `frontend` folder:

```powershell
cd frontend
npm ci
npm run dev:full
```

Open **`http://127.0.0.1:5173/`**. Vite proxies `/api`, `/health`, and `/static` to FastAPI on port 8000. Saved trip links use `/trips/{trip_id}`. Set `PYTHON` if the launcher must use a specific Python executable.

To build the production React client:

```powershell
cd frontend
npm ci
npm run build
```

FastAPI serves that build at `/` and `/discover`. The existing Jinja frontend is used only when the built React files are absent. The Dockerfile builds React before packaging the Python application.

### Start the built app directly

Start the server from PowerShell using the launcher. It selects the project's virtual environment when present, then the parent workspace environment:

```powershell
.\run.ps1
```

If starting manually, activate the virtual environment first and then run `python app.py`.

Then open your browser and visit:

👉 **`http://127.0.0.1:8000/`**

Accommodation search results receive reproducible sandbox quotes based on stay dates, traveler count, and room count. The rates can be tuned with `SANDBOX_HOTEL_BASE_NIGHTLY_INR` and `SANDBOX_HOTEL_RATE_SPREAD_PERCENT`. The traveler chooses a hotel or local cab; the payment agent checks the quote and wallet policy, processes a sandbox transaction, issues returned booking documents, and adds the confirmed sandbox item to the itinerary. These amounts are test rates, not supplier prices; no real room or cab is reserved and no real payment is taken. Documents are labeled `SANDBOX / SIMULATED BOOKING`.

The accommodation payment workflow checks the trip request, stay dates, quote, wallet balance, and payment limits before charging. If policy rejects payment, the UI displays the backend failure and no success document. Supplier inventory and live hotel prices require a separate supplier integration. Flight results represent schedules/status only; the current API does not provide airfare checkout or ticket issuance. Cab options are local test inventory, not provider quotes.

The current `POST /api/travel` endpoint remains a limited legacy natural-language route and does not implement persistent multi-turn chat. Structured itinerary edits are saved as trip messages and itinerary versions. The React UI only displays backend-returned information; it does not synthesize missing activity data.

Trip snapshots, saved itinerary versions, and planner/edit messages are stored in a separate SQLite database. By default it is `%LOCALAPPDATA%/TripMateAI/trips.sqlite3` on Windows (or the equivalent user data directory on other platforms); set `TRIPMATE_TRIPS_DB` to choose a path. The payment/wallet ledger remains in its own SQLite database (`SIMULATED_PAYMENT_DB`) and is the authority for payment status. On refresh the frontend stores only the last trip ID and fetches the trip from the backend. Saved trips survive browser and backend restarts. The current project has no user authentication, so saved-trip APIs are suitable for this single-user/demo deployment only; add authorization and per-user ownership before exposing it to multiple users.

The simulated ledger uses SQLite under the current user's application-data directory by default. To use PostgreSQL for this ledger, set `SIMULATED_PAYMENT_DATABASE_URL` to its connection URL; this setting is separate from `DATABASE_URL` so unrelated application database credentials are not used for simulated bookings. You can instead set `SIMULATED_PAYMENT_DB` to a specific SQLite file path. Wallet and policy amounts are paise: the example configuration uses ₹100,000 for the wallet, ₹100,000 per transaction, and ₹200,000 per day.

To use a locally installed Redis server, start it using your operating system's normal service command, then set `REDIS_URL=redis://127.0.0.1:6379/0` in `.env`. A managed Redis URL can be used instead. `/api/diagnostics` reports whether Redis is connected. Repeated Tavily, AviationStack, Open-Meteo forecast, and geocoding lookups use Redis. If Redis is not configured or cannot be reached, the app uses a bounded in-process cache; this fallback is not shared across server workers. Docker and Docker Compose are not required to run TripMate; the Dockerfile is optional for users who choose to build a container image.

Run the simulated payment and compensation tests with:

```bash
python -m unittest tests.test_simulated_payments -v
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Main travel planner web interface |
| `GET` | `/discover` | Destination inspiration & discovery view |
| `GET` | `/health` | Server health check endpoint |
| `POST` | `/api/travel` | Natural-language trip planning endpoint |
| `POST` | `/api/trips` | Structured guided planner submission |
| `POST` | `/api/trips/{trip_id}/selections` | Traveler selects a flight schedule, hotel, or sandbox cab option |
| `GET` | `/api/sandbox/wallet` | Read simulated wallet balances |
| `POST` | `/api/sandbox/wallet/topups` | Add bounded simulated funds to the agent wallet |
| `GET` | `/api/sandbox/payments/{payment_id}` | Read simulated payment and booking status |
| `POST` | `/api/trips/replan` | Run the itinerary replanning agent |
| `POST` | `/api/discover` | Run the destination discovery graph |
| `GET` | `/api/diagnostics` | Report configured service and cache status |

---

## 🧠 Multi-Agent Workflow

1. **User Request**: User provides travel destination, dates, preferences, and budget.
2. **Research Agents**: Gather destination, weather, event, flight-status, hotel, and activity evidence; identical provider queries can be served from cache.
3. **Itinerary Agent**: Builds and validates the day-by-day plan.
4. **Traveler Selection**: The traveler chooses a hotel or sandbox cab from returned priced options; trip generation does not automatically purchase an option.
5. **Payment Agent**: Validates server-returned sandbox quote details and wallet/payment policy, then runs authorization, reservation, confirmation, capture, settlement, and compensation stages.
6. **Document and Itinerary Update**: On backend-confirmed sandbox payment, issues the returned voucher/receipt and updates the itinerary. No real travel inventory or money is involved.

---

## 👤 Author

Developed by **[Krishacde](https://github.com/Krishacde)**.
