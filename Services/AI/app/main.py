import uvicorn
from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.get("/health")
def health_check():
    try:
        return {"message": "AI API running !"}
    except Exception as e: 
        raise HTTPException(status_code=500, detail=f"AI API is not running properly. error: {e}")