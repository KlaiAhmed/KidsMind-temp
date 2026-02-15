import uvicorn
from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.get("/health")
def health_check():
    try:
        return {"message": "Core API running !"}
    except Exception as e: 
        raise HTTPException(status_code=500, detail=f"Core API is not running properly. error: {e}")