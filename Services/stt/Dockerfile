# --- STAGE 1: Builder ---
FROM python:3.10-slim AS builder

WORKDIR /build

# Install EVERY tool needed for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    cmake \
    pkg-config \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment to keep things clean
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .

# Install dependencies into the virtual environment
RUN pip install --no-cache-dir -r requirements.txt


# --- STAGE 2: Final Runtime ---
FROM python:3.10-slim

WORKDIR /app

# Install ONLY runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the entire virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Ensure the app uses the virtual environment
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Copy app code
COPY app/ .

# Precompile
RUN python -m compileall -q .

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000","--reload"]