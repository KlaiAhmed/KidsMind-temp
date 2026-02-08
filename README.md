# 🧠 KidsMind - AI Educational Assistant

 **KidsMind** is a secure mobile and web learning application for children aged 3 to 15.  It integrates a benevolent AI assistant (text & voice), gamified exercises, and a comprehensive parental control dashboard.

 This project is built following the tech stack suggested by **VAERDIA** and utilizes a microservices architecture orchestrated via Docker.


## 🏗 Technical Architecture

 The project follows a **Monorepo** structure, separating frontend applications from backend services:

### Core Services
1.   **API Core**: Manages users, profiles, content, quizzes, sessions, and statistics.
2.   **AI Service**: Handles response generation, moderation, and conversational memory using LangChain & GPT-4.
3.   **Voice Service**: Dedicated to STT (Whisper) and TTS (Text-to-Speech).
4.   **Content Engine & Analytics**: Adaptive exercise engine and scoring system.

### Tech Stack
* **Frontend**: React + shadcn/ui (Web), React Native (Mobile)
*  **Backend**: FastAPI (Python)
*  **Database**: PostgreSQL
*  **Storage**: MinIO/S3 (Audios, Avatars, Attachments)
*  **AI**: LangChain + GPT-4 + Whisper STT 
*  **CI**: Docker + GitLab CI 


## 📂 Project Structure

```bash
kidsmind/
├── apps/
│   ├── web-client/       # Web Interface (React)
│   └── mobile-client/    # Mobile Application (React Native)
├── services/
│   ├── api-core/         # Business Logic API (FastAPI)
│   ├── ai-service/       # LLM & Logic Handling (FastAPI)
│   └── voice-service/    # Audio Processing STT/TTS (FastAPI)
├── infrastructure/
│   ├── DB/               # DB config (Postgre SQL)
│   └── storage/          # Media storage (MinIO/S3)
├── docker-compose.yml    # Orchestration
└── README.md
```

# 🚀 Getting Started

## Prerequisites

- **Docker & Docker Compose**
- **Node.js** (for local frontend dev)
- **Python 3.11+** (for local backend dev)


## Installation

### Clone the repository
```bash
git clone https://gitlab.com/ahmedklai-group/KidsMind-project
cd kidsMind
```

## ✨Key Features

### Parent Space 
- **Dashboard:** View screen time, subject progression, and history.
- **Profiles:** Create child profiles with age group and grade level
- **Controls:** Set time limits, block subjects, and toggle voice features.

### Child Space
- **AI Assistant:** Explains lessons, gives examples, and corrects exercises.
- **Voice Mode:** Speak to the assistant via Whisper STT.
- **Exercises:** Quizzes (MCQ, True/False) adapted by subject and level.
- **Gamification:** Earn points and badges for learning.


## 🔒 Security & Compliance
- **RBAC:** View screen time, subject progression, and history.
- **Data Protection:** Create child profiles with age group and grade level
- **Moderation:** Prompt filtering and response post-filtering to block inappropriate content.

---
###### Based on Vaerdia Project 4 - KidsMind Specification v1.0