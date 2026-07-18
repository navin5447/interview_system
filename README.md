# Multi-Round Interview System

Welcome to the **Multi-Round Interview System**. This project is a comprehensive recruiting and assessment platform divided into multiple stages, each tailored for different evaluation needs, including resume parsing, Multiple Choice Questions (MCQs), Data Structures and Algorithms (DSA), and live video interviews.

## 🚀 Project Architecture

The repository is modularized into several independent services, each with its own frontend and backend:

- **SmartRecruit_LLM**: The central Flask service for recruiting operations, AI-based resume parsing, and orchestration.
- **MCQ-round**: Round 1 assessment focusing on Multiple Choice Questions (FastAPI backend + Static Frontend).
- **DSA-round-2**: Round 2 assessment focusing on Data Structures and Algorithms (FastAPI backend + Vite React Frontend).
- **Interview_round**: Round 3 live interview module (FastAPI backend + Next.js Frontend). **Production Roadmap:** We are currently designing a robust, enterprise-grade RAG (Retrieval-Augmented Generation) pipeline. This will utilize fine-tuned LLMs to dynamically generate context-aware questions and relevant follow-ups, ensuring high-fidelity, hallucination-free technical evaluations at scale.

## 🛠️ Prerequisites

Make sure you have the following installed on your machine (Windows setup):
- **Python 3.11+**
- **Node.js 18+ & npm**
- **MongoDB** (running locally on default port 27017)
- **Git**

## 🔧 Setup Instructions

### 1) Clone the Repository

```powershell
git clone https://github.com/navin5447/interview_system.git
cd interview_system
```

*(Optional)* If you cloned from `team10` upstream:
```powershell
git clone https://github.com/agentica-2/team10.git
cd team10
```

### 2) Execution Policy (Windows)
Allow local scripts to be executed:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3) Python Virtual Environments
We need separate virtual environments for each backend service to avoid dependency conflicts:
```powershell
python -m venv .venv
python -m venv SmartRecruit_LLM\.venv311
python -m venv Interview_round\backend\.venv-ir
python -m venv "DSA-round-2\Desktop\DSA Round\backend\.venv-dsa"
```

### 4) Upgrade Pip
```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\SmartRecruit_LLM\.venv311\Scripts\python.exe -m pip install --upgrade pip
.\Interview_round\backend\.venv-ir\Scripts\python.exe -m pip install --upgrade pip
".\DSA-round-2\Desktop\DSA Round\backend\.venv-dsa\Scripts\python.exe" -m pip install --upgrade pip
```

### 5) Install Python Dependencies
```powershell
.\.venv\Scripts\python.exe -m pip install -r .\MCQ-round\backend\requirements.txt
.\SmartRecruit_LLM\.venv311\Scripts\python.exe -m pip install -r .\SmartRecruit_LLM\requirements.txt
.\Interview_round\backend\.venv-ir\Scripts\python.exe -m pip install -r .\Interview_round\backend\requirements.txt
".\DSA-round-2\Desktop\DSA Round\backend\.venv-dsa\Scripts\python.exe" -m pip install -r ".\DSA-round-2\Desktop\DSA Round\backend\requirements.txt"
```

### 6) Install Node Dependencies
Install frontend dependencies for all UI projects:
```powershell
cd .\Interview_round\frontend
npm install
cd ..\..\

cd ".\DSA-round-2\Desktop\DSA Round\frontend"
npm install
cd "..\..\..\..\"

cd .\MCQ-round\frontend
# npm install (if applicable)
cd ..\..\
```

## 🚀 Running the Services

### Start MongoDB
Ensure your local MongoDB instance is running:
```powershell
net start MongoDB
```

### Start All Services
We have provided a unified PowerShell script to start all backends and frontends concurrently in separate terminal windows.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all-rounds.ps1
```

Once running, the services will be available at:
- **SmartRecruit**: http://127.0.0.1:5000
- **MCQ API**: http://127.0.0.1:8000
- **MCQ UI**: http://127.0.0.1:3001
- **DSA API**: http://127.0.0.1:8001
- **DSA UI**: http://127.0.0.1:5173
- **Interview API**: http://127.0.0.1:8004
- **Interview UI**: http://127.0.0.1:3000

### Stop All Services
To gracefully kill all listening processes running on the specific ports:
```powershell
powershell -ExecutionPolicy Bypass -File .\stop-all-rounds.ps1
```

## 💡 Quick Troubleshooting
If you face issues running the commands, verify your installation:
```powershell
python --version
node -v
npm -v
```

If you encounter `address-in-use` errors, simply re-run the stop script `.\stop-all-rounds.ps1` to free up the required ports.
