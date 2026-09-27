FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_DIR=/models/prompt-classifier \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the weights into the image: no Hugging Face calls at runtime.
COPY download_model.py .
RUN python download_model.py "$MODEL_DIR" && rm -rf "$MODEL_DIR/.cache"
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

COPY model.py app.py ./

RUN useradd --uid 10001 --no-create-home appuser
USER 10001

# One worker: the model is ~740 MB and inference is serialised per instance.
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-server-header"]
