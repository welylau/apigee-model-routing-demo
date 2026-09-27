"""Prompt task & complexity classifier service (Cloud Run).

POST /v1/classify  {"prompt": "..."}  -> task type + complexity dimensions
GET  /healthz                          -> {"status": "ok"}

Authentication is enforced by Cloud Run IAM (--no-allow-unauthenticated);
only the Apigee runtime service account holds roles/run.invoker.
"""

import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from model import Classifier

MODEL_DIR = os.environ.get("MODEL_DIR", "/models/prompt-classifier")
MODEL_ID = "nvidia/prompt-task-and-complexity-classifier"
MAX_PROMPT_CHARS = 20000  # tokenizer truncates to 512 tokens anyway

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("prompt-classifier")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
classifier = Classifier(MODEL_DIR)
classifier.classify("warm up")  # first call is slow; do it before serving
log.info("model loaded from %s", MODEL_DIR)


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)


@app.exception_handler(RequestValidationError)
async def _bad_request(_req: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "invalid request"})


@app.exception_handler(Exception)
async def _server_error(_req: Request, exc: Exception):
    log.exception("classification failed: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"error": "internal error"})


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/v1/classify")
def classify(body: ClassifyRequest):
    t0 = time.perf_counter()
    result = classifier.classify(body.prompt)
    result["model"] = MODEL_ID
    result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return result
