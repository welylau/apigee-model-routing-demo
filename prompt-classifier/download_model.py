"""Downloads the classifier checkpoint + tokenizer (build time only)."""

import sys

from huggingface_hub import snapshot_download

target = sys.argv[1] if len(sys.argv) > 1 else "/models/prompt-classifier"
snapshot_download(
    repo_id="nvidia/prompt-task-and-complexity-classifier",
    local_dir=target,
    allow_patterns=["*.json", "*.safetensors", "spm.model"],
)
print(f"downloaded to {target}")
