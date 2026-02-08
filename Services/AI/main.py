import uvicorn
from fastapi import FastAPI, HTTPException

settings = Settings()
app = FastAPI()

@app.get("/health/ai")
def health_check():
    try:
        return {"message": "AI API running !"}
    except Exception as e: 
        raise HTTPException(status_code=500, detail=f"AI API is not running properly. error: {e}")