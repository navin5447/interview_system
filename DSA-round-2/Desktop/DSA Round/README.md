# DSA Coding Interview Platform

A full-stack web-based coding interview platform for DSA (Data Structures & Algorithms) assessments. Features automatic question selection based on difficulty, in-browser code execution, real-time evaluation, and comprehensive scoring.

## Features

- **Configurable Question Distribution**: Set the number of easy, medium, and hard questions
- **Multiple Language Support**: Python, C++, Java, JavaScript
- **Monaco Code Editor**: Professional IDE experience with syntax highlighting
- **Real-time Code Execution**: Powered by Judge0 API
- **Weighted Scoring**: Easy (1pt), Medium (2pts), Hard (3pts)
- **Timer with Auto-submit**: Configurable duration with automatic submission
- **Tab Switch Detection**: Security feature to detect window/tab changes
- **Detailed Results**: Question-wise breakdown with test case analysis

## Tech Stack

- **Frontend**: React.js, Vite, Tailwind CSS, Monaco Editor
- **Backend**: FastAPI (Python)
- **Database**: SQLite
- **Code Execution**: Judge0 API (RapidAPI)

## Project Structure

```
DSA Round/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── config.py         # Configuration settings
│   │   ├── database.py       # Database setup
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── routers/          # API endpoints
│   │   ├── services/         # Business logic
│   │   └── data/
│   │       └── questions.json  # Sample questions
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API services
│   │   ├── hooks/            # Custom React hooks
│   │   └── utils/            # Utility functions
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.9+
- Node.js 18+
- Judge0 API Key (from RapidAPI)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create `.env` file from example:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and add your Judge0 API key:
   ```
   JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_API_KEY=your_rapidapi_key_here
   JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
   ```

6. Start the backend server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173 in your browser

## Getting Judge0 API Key

1. Go to [RapidAPI Judge0 CE](https://rapidapi.com/judge0-official/api/judge0-ce)
2. Sign up or log in
3. Subscribe to the free tier
4. Copy your API key from the "X-RapidAPI-Key" header

## API Endpoints

### Interviews

- `POST /api/interviews/start` - Start a new interview
- `GET /api/interviews/{id}` - Get interview status
- `POST /api/interviews/{id}/complete` - Complete interview
- `GET /api/interviews/available/counts` - Get available question counts

### Questions

- `GET /api/questions/{id}` - Get specific question
- `GET /api/questions/interview/{interview_id}` - Get all interview questions

### Submissions

- `POST /api/submissions/run` - Run code against visible test cases
- `POST /api/submissions/submit` - Submit code for evaluation
- `GET /api/submissions/results/{interview_id}` - Get final results

## Integration Guide

### As Round 2 of Interview System

**Option 1: URL Parameters**
```
http://localhost:5173/?easy=2&medium=2&hard=1&duration=60&candidate_id=xxx
```

**Option 2: API Call**
```javascript
const response = await fetch('http://localhost:8000/api/interviews/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    total_questions: 5,
    difficulty_distribution: { easy: 2, medium: 2, hard: 1 },
    duration_minutes: 60,
    candidate_id: "from_main_system"
  })
});
const { interview_id } = await response.json();
// Redirect to: http://localhost:5173/interview/{interview_id}
```

**Option 3: Iframe Embed**
```html
<iframe
  src="http://localhost:5173/interview/SESSION_ID"
  width="100%"
  height="800px"
></iframe>
```

## Scoring System

| Difficulty | Points | Weight |
|------------|--------|--------|
| Easy       | 1      | 1x     |
| Medium     | 2      | 2x     |
| Hard       | 3      | 3x     |

**Score Calculation:**
```
Question Score = (Passed Tests / Total Tests) × Difficulty Weight
Total Score = Sum of all Question Scores
```

## Sample Questions

The platform comes pre-loaded with 15 DSA questions:

**Easy (5 questions):**
- Two Sum
- Reverse String
- Valid Parentheses
- Palindrome Number
- FizzBuzz

**Medium (5 questions):**
- Maximum Subarray
- Longest Substring Without Repeating Characters
- Container With Most Water
- 3Sum
- Merge Intervals

**Hard (5 questions):**
- Median of Two Sorted Arrays
- Trapping Rain Water
- Merge K Sorted Lists
- Longest Valid Parentheses
- Regular Expression Matching

## Adding New Questions

Add questions to `backend/app/data/questions.json`:

```json
{
  "title": "Question Title",
  "description": "Problem description...",
  "difficulty": "easy|medium|hard",
  "input_format": "Description of input format",
  "output_format": "Description of output format",
  "constraints": "Problem constraints",
  "visible_test_cases": [
    {"input": "test input", "output": "expected output"}
  ],
  "hidden_test_cases": [
    {"input": "hidden input", "output": "expected output"}
  ],
  "boilerplate_code": {
    "python": "# template code",
    "cpp": "// template code",
    "java": "// template code"
  }
}
```

Then restart the backend server - questions will be automatically seeded.

## License

MIT License
