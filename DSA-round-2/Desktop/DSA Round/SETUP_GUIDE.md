# DSA Interview Platform - Setup Guide

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python -m uvicorn app.main:app --reload --port 8000
```

The backend will automatically:
- Create SQLite database (`interviews.db`)
- Seed 15 DSA questions (5 easy, 5 medium, 5 hard)
- Start API server at `http://localhost:8000`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

The frontend will start at `http://localhost:5173`

---

## 🎯 How It Works

### Code Execution
- **Uses Local Execution** (completely free, no API keys needed!)
- Supports: Python (always), C++ (if g++ installed), Java (if javac installed)
- Safe execution in temporary directories with automatic cleanup

### Interview Flow

1. **Setup Page** (`/`)
   - Select difficulty distribution (easy/medium/hard)
   - Set timer duration
   - Click "Start Interview" to begin

2. **Interview Page** (`/interview/:id`)
   - Monaco code editor with syntax highlighting
   - Run code against visible test cases
   - Submit for final evaluation against hidden test cases
   - Timer with auto-submit on expiry
   - Tab switch detection

3. **Results Page** (`/results/:id`)
   - Overall score and pass/fail status
   - Detailed breakdown per question
   - Test case results

---

## 📝 API Endpoints

### Interviews
- `POST /api/interviews/start` - Start new interview session
- `POST /api/interviews/{id}/complete` - Complete interview
- `GET /api/interviews/{id}` - Get interview details

### Questions
- `GET /api/questions/{id}` - Get question by ID
- `GET /api/questions/` - List all questions

### Submissions
- `POST /api/submissions/run` - Run code (visible test cases)
- `POST /api/submissions/submit` - Submit code (hidden test cases)
- `GET /api/submissions/results/{interview_id}` - Get final results

---

## 🔧 Configuration

### Backend (`backend/app/config.py`)
- `DATABASE_URL`: SQLite database location
- Adjust time limits and memory limits if needed

### Questions Dataset (`backend/app/data/questions.json`)
- 15 pre-loaded DSA questions
- Each question has visible and hidden test cases
- Weighted scoring: Easy=1pt, Medium=2pts, Hard=3pts

---

## 🧪 Testing the System

### Test Python Execution:
```bash
# From backend directory
python -c "from app.services.local_executor import local_executor; import asyncio; print(asyncio.run(local_executor.execute_code('print(1+1)', 'python', '', '', 5.0, 262144)))"
```

### Expected Output:
```json
{
  "status": {"id": 3, "description": "Accepted"},
  "stdout": "2\n",
  "stderr": null,
  "time": null,
  "memory": null
}
```

---

## 📊 Features

### For Candidates:
- ✅ Monaco code editor with IntelliSense
- ✅ Multiple languages (Python, C++, Java)
- ✅ Visible test cases for testing
- ✅ Hidden test cases for final evaluation
- ✅ Timer with auto-submit
- ✅ Tab switch tracking
- ✅ Real-time code execution feedback

### For Evaluators:
- ✅ Configurable question selection
- ✅ Weighted scoring by difficulty
- ✅ Detailed result analytics
- ✅ Test case pass/fail tracking
- ✅ Execution time monitoring

---

## 🔐 Integration with Existing System

### Option 1: URL Parameters
```javascript
// Redirect to interview with pre-configuration
window.location.href = `http://localhost:5173/?config=${btoa(JSON.stringify({
  easy: 3,
  medium: 2,
  hard: 1,
  duration: 60
}))}`;
```

### Option 2: API Integration
```javascript
// Start interview via API
const response = await fetch('http://localhost:8000/api/interviews/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    easy_count: 3,
    medium_count: 2,
    hard_count: 1,
    duration_minutes: 60
  })
});

const { interview_id } = await response.json();
window.location.href = `http://localhost:5173/interview/${interview_id}`;
```

### Option 3: Iframe Embed
```html
<iframe
  src="http://localhost:5173/interview/{interview_id}"
  width="100%"
  height="800px"
  style="border: none;"
></iframe>
```

---

## 🐛 Troubleshooting

### Python not found?
- Windows: Install from python.org
- Linux: `sudo apt install python3`
- macOS: `brew install python3`

### Backend won't start?
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000  # Windows
lsof -i :8000                 # Unix/macOS

# Kill process and restart
```

### Frontend compilation errors?
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📁 Project Structure

```
DSA Round/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Configuration
│   │   ├── database.py          # SQLite setup
│   │   ├── models/              # Database models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── routers/             # API endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── local_executor.py  # ⭐ Code execution
│   │   │   ├── evaluator.py       # Scoring
│   │   │   └── question_selector.py
│   │   └── data/
│   │       └── questions.json   # Question dataset
│   ├── requirements.txt
│   └── interviews.db            # Auto-created SQLite DB
│
└── frontend/
    ├── src/
    │   ├── App.jsx              # Main routing
    │   ├── pages/               # Page components
    │   │   ├── SetupPage.jsx
    │   │   ├── InterviewPage.jsx
    │   │   └── ResultsPage.jsx
    │   ├── components/          # Reusable components
    │   │   ├── CodeEditor.jsx
    │   │   ├── QuestionPanel.jsx
    │   │   ├── OutputConsole.jsx
    │   │   └── Timer.jsx
    │   ├── services/
    │   │   └── api.js           # API client
    │   └── hooks/               # Custom hooks
    ├── package.json
    └── vite.config.js
```

---

## 🎉 Ready to Test!

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser: `http://localhost:5173`
4. Configure interview and start coding!

**No API keys needed. No external dependencies. Just code!** 🚀
