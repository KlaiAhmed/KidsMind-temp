# 1️⃣ Base image
FROM python:3.14-slim

# 2️⃣ Environment
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3️⃣ Workdir
WORKDIR /app

# 4️⃣ Install Python dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# 5️⃣ Copy application source
COPY app/ .

# 6️⃣ Precompile python bytecode to speed startup 
RUN python -m compileall -q .

# 7️⃣ Run uvicorn directly 
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000","--reload"]
