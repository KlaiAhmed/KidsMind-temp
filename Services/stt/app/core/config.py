from os import getenv

SERVICE_NAME = "stt-service"

WHISPER_MODE= getenv("WHISPER_MODE", "gpu")  # "cpu" or "gpu"

if WHISPER_MODE == "gpu":
    # GPU settings
    WHISPER_DEVICE = "cuda"
    WHISPER_COMPUTE_TYPE = "float16"
    WHISPER_CPU_THREADS = 0  # Not used in GPU mode
else:
    # CPU settings
    WHISPER_DEVICE = "cpu"
    WHISPER_COMPUTE_TYPE =  "int8" # "int8" is faster on CPU but slightly less accurate than "int8_float32", "float32". Adjust as needed.
    WHISPER_CPU_THREADS = int(getenv("WHISPER_CPU_THREADS", "8"))

WHISPER_MODEL = getenv("WHISPER_MODEL", "large-v3-turbo")
WHISPER_NUM_WORKERS = int(getenv("WHISPER_NUM_WORKERS", "2"))

print(f"Configuration : MODE={WHISPER_MODE}, MODEL={WHISPER_MODEL}, DEVICE={WHISPER_DEVICE}, COMPUTE_TYPE={WHISPER_COMPUTE_TYPE}" + (f", CPU_THREADS={WHISPER_CPU_THREADS}" if WHISPER_MODE == "cpu" else "") + f", NUM_WORKERS={WHISPER_NUM_WORKERS}")
