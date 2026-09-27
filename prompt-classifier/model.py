"""NVIDIA prompt-task-and-complexity-classifier (NemoCurator) - CPU inference.

Adapted from the model card at
https://huggingface.co/nvidia/prompt-task-and-complexity-classifier
(NVIDIA Open Model License).

Differences from the model-card snippet:
  * The DeBERTa-v3-base backbone is built from a local config
    (AutoModel.from_config) instead of downloading microsoft/DeBERTa-v3-base
    weights - the fine-tuned checkpoint already contains every weight.
  * Weights are loaded from a local safetensors file (strict), so the service
    runs fully offline inside the container.
  * Dynamic padding (not pad-to-512) - mean pooling is mask-aware, so results
    are equivalent while CPU latency is much lower for short prompts.
"""

import json
import os
import threading

import numpy as np
import torch
import torch.nn as nn
from safetensors.torch import load_file
from transformers import AutoModel, AutoTokenizer, DebertaV2Config

MAX_TOKENS = 512

# microsoft/deberta-v3-base backbone configuration (from its config.json).
_BACKBONE_CONFIG = dict(
    attention_probs_dropout_prob=0.1,
    hidden_act="gelu",
    hidden_dropout_prob=0.1,
    hidden_size=768,
    initializer_range=0.02,
    intermediate_size=3072,
    max_position_embeddings=512,
    relative_attention=True,
    position_buckets=256,
    norm_rel_ebd="layer_norm",
    share_att_key=True,
    pos_att_type=["p2c", "c2p"],
    layer_norm_eps=1e-7,
    max_relative_positions=-1,
    position_biased_input=False,
    num_attention_heads=12,
    num_hidden_layers=12,
    type_vocab_size=0,
    vocab_size=128100,
)


class MeanPooling(nn.Module):
    def forward(self, last_hidden_state, attention_mask):
        mask = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
        summed = torch.sum(last_hidden_state * mask, 1)
        counts = torch.clamp(mask.sum(1), min=1e-9)
        return summed / counts


class MulticlassHead(nn.Module):
    def __init__(self, input_size, num_classes):
        super().__init__()
        self.fc = nn.Linear(input_size, num_classes)

    def forward(self, x):
        return self.fc(x)


class CustomModel(nn.Module):
    def __init__(self, target_sizes, task_type_map, weights_map, divisor_map):
        super().__init__()
        self.backbone = AutoModel.from_config(DebertaV2Config(**_BACKBONE_CONFIG))
        self.target_sizes = list(target_sizes.values())
        self.task_type_map = task_type_map
        self.weights_map = weights_map
        self.divisor_map = divisor_map
        self.heads = [
            MulticlassHead(self.backbone.config.hidden_size, sz)
            for sz in self.target_sizes
        ]
        for i, head in enumerate(self.heads):
            self.add_module(f"head_{i}", head)
        self.pool = MeanPooling()

    def _score(self, logits, target):
        probs = torch.softmax(logits, dim=1).detach().cpu().numpy()
        weights = np.array(self.weights_map[target])
        scores = np.sum(probs * weights, axis=1) / self.divisor_map[target]
        scores = [round(float(v), 4) for v in scores]
        if target == "number_of_few_shots":
            scores = [x if x >= 0.05 else 0.0 for x in scores]
        return scores

    def _task_type(self, logits):
        probs = torch.softmax(logits, dim=1)
        top2 = torch.topk(probs, k=2, dim=1)
        out1, out2, p1 = [], [], []
        for idx, pr in zip(top2.indices.tolist(), top2.values.tolist()):
            out1.append(self.task_type_map[str(idx[0])])
            out2.append(self.task_type_map[str(idx[1])] if pr[1] >= 0.1 else "NA")
            p1.append(round(float(pr[0]), 3))
        return out1, out2, p1

    def forward(self, input_ids, attention_mask):
        hidden = self.backbone(
            input_ids=input_ids, attention_mask=attention_mask
        ).last_hidden_state
        pooled = self.pool(hidden, attention_mask)
        logits = [head(pooled) for head in self.heads]

        r = {}
        r["task_type_1"], r["task_type_2"], r["task_type_prob"] = self._task_type(
            logits[0]
        )
        names = [
            "creativity_scope",
            "reasoning",
            "contextual_knowledge",
            "number_of_few_shots",
            "domain_knowledge",
            "no_label_reason",
            "constraint_ct",
        ]
        for i, name in enumerate(names, start=1):
            r[name] = self._score(logits[i], name)
        r["prompt_complexity_score"] = [
            round(
                0.35 * c + 0.25 * rs + 0.15 * ct + 0.15 * d + 0.05 * cx + 0.05 * fs,
                5,
            )
            for c, rs, ct, d, cx, fs in zip(
                r["creativity_scope"],
                r["reasoning"],
                r["constraint_ct"],
                r["domain_knowledge"],
                r["contextual_knowledge"],
                r["number_of_few_shots"],
            )
        ]
        return r


class Classifier:
    """Thread-safe wrapper: loads once, classifies one prompt at a time."""

    def __init__(self, model_dir):
        with open(os.path.join(model_dir, "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = CustomModel(
            target_sizes=cfg["target_sizes"],
            task_type_map=cfg["task_type_map"],
            weights_map=cfg["weights_map"],
            divisor_map=cfg["divisor_map"],
        )
        state = load_file(os.path.join(model_dir, "model.safetensors"))
        missing, unexpected = self.model.load_state_dict(state, strict=False)
        # position_ids buffers may legitimately differ across transformers versions.
        missing = [k for k in missing if not k.endswith("position_ids")]
        unexpected = [k for k in unexpected if not k.endswith("position_ids")]
        if missing or unexpected:
            raise RuntimeError(
                f"checkpoint mismatch: missing={missing[:5]} unexpected={unexpected[:5]}"
            )
        self.model.eval()
        self._lock = threading.Lock()

    @torch.inference_mode()
    def classify(self, prompt):
        enc = self.tokenizer(
            [prompt],
            return_tensors="pt",
            add_special_tokens=True,
            max_length=MAX_TOKENS,
            truncation=True,
        )
        with self._lock:
            r = self.model(enc["input_ids"], enc["attention_mask"])
        return {
            "task_type": r["task_type_1"][0],
            "task_type_2": r["task_type_2"][0],
            "task_prob": r["task_type_prob"][0],
            "complexity": r["prompt_complexity_score"][0],
            "creativity": r["creativity_scope"][0],
            "reasoning": r["reasoning"][0],
            "contextual_knowledge": r["contextual_knowledge"][0],
            "domain_knowledge": r["domain_knowledge"][0],
            "constraints": r["constraint_ct"][0],
            "few_shots": r["number_of_few_shots"][0],
            "tokens": int(enc["input_ids"].shape[1]),
        }
