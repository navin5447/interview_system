# AI Interview Simulator

An AI-powered interview simulator that generates MCQ questions based on your resume and job requirements using Groq's LLM API.

## Features

- **Smart Question Generation**: Uses Groq's Llama 3 70B model to generate relevant interview questions
- **Customizable Settings**: Configure number of questions, difficulty distribution, and timer
- **Real Interview Experience**: Timed questions with instant feedback
- **Detailed Results**: Performance breakdown by difficulty and category
- **Dark Modern UI**: Clean, responsive interface

## Quick Start

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure API Key

The `.env` file is already configured with your Groq API key. If you need to change it:

```bash
# backend/.env
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Start the Backend Server

```bash
cd backend
python app.py
```

The API will be available at `http://localhost:8000`

### 4. Open the Frontend

Open `frontend/index.html` in your web browser.

**Note**: Due to CORS, you need to serve the frontend from a local server or use a browser with CORS disabled for development. Or simply open the HTML file directly - the backend has CORS enabled for all origins.

## Usage

1. **Paste Resume Content**: Enter your resume text/JSON in the left text area
2. **Paste Job Requirements**: Enter the job description in the right text area
3. **Configure Settings** (optional):
   - Number of questions (5-30)
   - Time per question (30s, 60s, 90s, or no timer)
   - Difficulty distribution (Easy/Medium/Hard percentages)
   - Job requirements vs Resume focus ratio
4. **Click "Generate & Start Interview"**
5. **Answer Questions**: Select one option per question
6. **View Results**: See your score and review all answers

## Project Structure

```
Interview/
├── backend/
│   ├── app.py                 # FastAPI server
│   ├── groq_client.py         # Groq API wrapper
│   ├── question_generator.py  # MCQ generation logic
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # API key configuration
├── frontend/
│   ├── index.html             # Main UI
│   ├── styles.css             # Dark theme styles
│   └── script.js              # Interview logic
├── sample_data/
│   ├── sample_resume.json     # Example resume
│   └── sample_job_requirements.json  # Example job posting
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-questions` | POST | Generate MCQ questions |
| `/api/submit-answer` | POST | Submit an answer |
| `/api/results/{session_id}` | GET | Get session results |
| `/api/health` | GET | Health check |

## Configuration Options

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Number of Questions | 5-30 | 15 | Total MCQs to generate |
| Timer | 0/30/60/90s | 60s | Time limit per question |
| Easy % | 0-100 | 20 | Easy question percentage |
| Medium % | 0-100 | 50 | Medium question percentage |
| Hard % | 0-100 | 30 | Hard question percentage |
| Job Focus % | 0-100 | 70 | Questions from job requirements |

## Technology Stack

- **Backend**: Python, FastAPI, Groq API
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **LLM**: Llama 3 70B (via Groq)

## Troubleshooting

**Questions not generating?**
- Check if the backend server is running on port 8000
- Verify your Groq API key is valid
- Check browser console for errors

**CORS errors?**
- The backend allows all origins by default
- Try refreshing the page or clearing cache

## License

MIT License
