# 🧠 KidsMind - AI Educational Assistant

 **KidsMind** is a secure mobile and web learning application for children aged 3 to 15.  It integrates a benevolent AI assistant (text & voice), gamified exercises, and a comprehensive parental control dashboard.

 This project is built following the tech stack suggested by **VAERDIA** and utilizes a microservices architecture orchestrated via Docker.

## 📋 Table of Contents

- [🏗️ System Architecture & Services](#-system-architecture--services)
- [📂 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [✨Key Features](#key-features)
- [🔒 Security & Compliance](#-security--compliance)

## 🏗️ System Architecture & Services

 The project follows a **Monorepo** structure, separating frontend applications from backend services and its built using a microservices architecture, with each component isolated in its own Docker container.

 ### Tech Stack :
* **Frontend**: React + shadcn/ui (Web), React Native (Mobile)
*  **Backend**: FastAPI (Python)
*  **Database**: PostgreSQL
*  **Storage**: MinIO/S3 (Audios, Avatars, Attachments)
*  **AI**: LangChain + GPT-4 + Whisper STT 
*  **CI**: Docker + GitLab CI 


### Core Services :
| Service Name | Port (Host:Container) | Description |
| :--- | :--- | :--- |
| **api-core** | `8000:8000` | The main backend (FastAPI). Handles routing, business logic, and database interactions. |
| **ai-service** | `8001:8000` | Dedicated service for AI model inference and heavy processing. |
| **stt-service**| `8002:8000` | Dedicated to STT audio  processing (Faster-Whisper). |
| **db-service**| `5432:5432` | PostgreSQL database storing application data. |


---

### Additional Services :
| Service Name | Port (Host:Container) | Description |
| :--- | :--- | :--- |
| **prometheus** | `9090:9090` | Collects and stores metrics as time-series data, allowing for real-time monitoring |
| **grafana** | `8001:8000` | Transforms raw data from Prometheus into interactive dashboards. |
| **bucket-service**| `NA` | A  startup utility that performs verification of required storage buckets. if they are missing, it provision them dynamically. This service terminates immediately upon verification. |
| **postgres-exporter**| `9187:9187` | A dedicated bridge between PostgreSQL and Prometheus. It collects and translates database-level metrics into a format Prometheus can ingest for database monitoring. |
---


## 📂 Project Structure

```bash
kidsmind/
├── apps/
│   ├── web-client/                   # Web Interface (React)
│   └── mobile-client/                # Mobile Application (React Native)
├── services/   
│   ├── api-core/                     # Business Logic API (FastAPI)
│   ├── ai-service/                   # LLM & Logic Handling (FastAPI)
│   └── stt-service/                  # Audio Processing STT/TTS (FastAPI)
├── infrastructure/           
│   ├── DB/                           # DB config (Postgre SQL)
│   ├── observability/
│   │  ├── monitoring/                # Monitoring services config (Prometheus/Grafana)
│   │  └── logs/                      # Log aggregation services config (Loki/Promtail)
│   │     ├── grafana/                 
│   │     │      └── provisioning/ 
│   │     │         └── datasources/  # Grafana datasource provisioning
│   │     ├── loki/                   # Loki config
│   │     └── promtail/               # Promtail config
│   └── storage/                      # file storage (MinIO/S3)
├── docker-compose.yml                # Main Orchestration file
├── .env.example                      # Template for Environment Variables
├── .gitignore
└── README.md
```

# 🚀 Getting Started

## Prerequisites

- **Docker & Docker Compose**
- **Node.js** (for local frontend dev)
- **Physical Device** (iOS/Android) with **Expo Go** installed (for mobile testing)

## Installation

### 1. Clone the repository
```bash
git clone https://gitlab.com/ahmedklai-group/KidsMind-project
cd kidsMind
```

### 2. Configure Environment Variables
The project uses a .env file to manage sensitive credentials and configuration. A template is provided in .env.example.
```bash
# Copy the example file to create your own .env
cp .env.example .env
```
Open the newly created .env file and fill in your desired database credentials and ports.

### 3. Build & Run Backend Services
The entire backend stack (API, AI Service, and PostgreSQL) is containerized using Docker. You do not need to install Python or PostgreSQL locally.
```bash
# Build the images and start all containers
docker compose up --build
```

### 3.1 Storage Provisioning (MinIO Buckets)
On startup, `bucket-provisioner` ensures these buckets exist:
- `media-public`
- `media-private`
- `loki-chunks`

### 3.2 Windows Note (CRLF vs LF)

This repository  mitigates that in two ways:
- `.gitattributes` enforces `LF` for `*.sh`, `*.yml`, `*.yaml`
- `bucket-provisioner` entrypoint normalizes `\r` at runtime before executing the script

### 4. Client Setup

**Web Client:**
```bash
# Navigate to the web-client folder
cd apps/web-client

# Install dependencies
npm install

# Start the development server
npm run dev
``` 

**Mobile Client**
```bash
# Navigate to the mobile-client folder
cd apps/mobile-client

# Install dependencies
npm install

# Start the Expo development server
npx expo start
``` 
Scan the QR code with your phone using the Expo Go app.

**Note:** Ensure your phone and computer are on the same Wi-Fi network.

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
- **RBAC (Role-Based Access Control):** Strict separation between Admin , Parent (Owner) and Child (User) permissions.
- **Data Protection:** All sensitive data is encrypted, Child profiles are anonymized where possible.
- **Moderation:** Prompt filtering and response post-filtering to block inappropriate content.

---
###### Based on Vaerdia Project 4 - KidsMind Specification v1.0