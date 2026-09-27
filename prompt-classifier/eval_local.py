"""Local evaluation: scores a prompt set and proposes a tier per prompt.

Usage: .venv/bin/python eval_local.py <model_dir>
"""

import json
import sys
import time

from model import Classifier

# Mapping under evaluation (mirrors what Apigee decide-route.js will do).
# Thresholds become ext_* entries in routing.properties.
COMPLEX_TASKS = {"Code Generation"}
MIN_TASK_PROB = 0.2      # below this the task label is noise -> rules fallback
REASONING_COMPLEX = 0.4  # multi-step reasoning / proofs / word problems
DOMAIN_COMPLEX = 0.90    # deep domain expertise ...
CONSTRAINT_COMPLEX = 0.45  # ... combined with many explicit constraints
SIMPLE_MAX_COMPLEXITY = 0.15
SIMPLE_MAX_REASONING = 0.2


def tier(r):
    if r["task_type"] == "Unknown" or r["task_prob"] < MIN_TASK_PROB:
        return "fallback"
    if (
        r["task_type"] in COMPLEX_TASKS
        or r["reasoning"] >= REASONING_COMPLEX
        or (
            r["domain_knowledge"] >= DOMAIN_COMPLEX
            and r["constraints"] >= CONSTRAINT_COMPLEX
        )
    ):
        return "complex"
    if (
        r["complexity"] < SIMPLE_MAX_COMPLEXITY
        and r["reasoning"] < SIMPLE_MAX_REASONING
    ):
        return "simple"
    return "standard"


PROMPTS = [
    # (expected, prompt) - first four are the web-UI presets
    ("simple", "What is the capital of France?"),
    ("standard", "Summarise the key benefits of using an API gateway for a microservices architecture in five bullet points."),
    ("complex", "Design a multi-region, active-active architecture for a payments platform on Google Cloud. Compare Spanner vs AlloyDB for the ledger, explain consistency trade-offs, failure modes, and give a step-by-step migration plan from an on-prem Oracle RAC."),
    ("complex", "Write a Python function that parses an Apache access log, aggregates p50/p95/p99 latency per endpoint using a streaming algorithm, and include unit tests."),
    ("simple", "Hi there! How are you today?"),
    ("simple", "Translate 'good morning' into Spanish."),
    ("simple", "Rewrite this sentence to be more polite: send me the report now."),
    ("simple", "Is a tomato a fruit or a vegetable?"),
    ("simple", "Classify the sentiment of this review: 'The food was cold and the waiter was rude.'"),
    ("simple", "Extract the email address from: Contact John at john.doe@example.com for details."),
    ("simple", "What year did World War II end?"),
    ("standard", "Write a short product description for a stainless steel water bottle."),
    ("standard", "Summarize the plot of Romeo and Juliet in one paragraph."),
    ("standard", "Give me 10 creative names for a coffee shop that also sells books."),
    ("standard", "Draft a friendly email to my team announcing that Friday is a half day."),
    ("standard", "Explain the difference between TCP and UDP for a junior developer."),
    ("standard", "Write a haiku about autumn leaves."),
    ("complex", "Prove that there are infinitely many prime numbers, then explain how the proof generalises to primes of the form 4k+3."),
    ("complex", "A train leaves city A at 60 km/h and another leaves city B, 300 km away, at 90 km/h towards A, 30 minutes later. Where and when do they meet? Show your reasoning."),
    ("complex", "Implement a thread-safe LRU cache in Java with O(1) get and put, and explain the concurrency design."),
    ("complex", "Analyse the regulatory implications of GDPR and Singapore PDPA for a cross-border health-data analytics platform, and recommend a data residency architecture."),
    ("complex", "Given a SQL schema for orders, customers and payments, write a query that finds customers whose monthly spend dropped by more than 40% for three consecutive months, and explain how to index it."),
    ("complex", "Debug this: my Kubernetes pods are OOMKilled only under load even though memory limits are 2Gi and the JVM heap is 1.5Gi. Walk through root-cause analysis."),
    ("standard", "What are the pros and cons of remote work?"),
    # held-out (added after tuning)
    ("simple", "Define photosynthesis in one sentence."),
    ("simple", "What is 15% of 80?"),
    ("standard", "Explain how HTTPS works to a non-technical manager."),
    ("standard", "Write a limerick about a cat who loves boxes."),
    ("complex", "Compare Kafka and Google Pub/Sub for event streaming at 1M msgs/sec with exactly-once semantics, ordering guarantees and cost; recommend one with justification."),
    ("complex", "Write a bash script that finds duplicate files by SHA-256 across nested directories and prints groups sorted by size."),
]


def main():
    model_dir = sys.argv[1]
    t0 = time.perf_counter()
    clf = Classifier(model_dir)
    print(f"load: {time.perf_counter() - t0:.1f}s")
    clf.classify("warm up")

    rows, hits = [], 0
    for expected, prompt in PROMPTS:
        t = time.perf_counter()
        r = clf.classify(prompt)
        ms = (time.perf_counter() - t) * 1000
        got = tier(r)
        hits += got == expected
        rows.append({"expected": expected, "got": got, "ms": round(ms), **r, "prompt": prompt[:60]})
        print(
            f"{'OK ' if got == expected else 'XX '} exp={expected:8s} got={got:8s} "
            f"{r['task_type']:15s} p={r['task_prob']:.2f} cx={r['complexity']:.2f} "
            f"rs={r['reasoning']:.2f} cr={r['creativity']:.2f} dk={r['domain_knowledge']:.2f} "
            f"ct={r['constraints']:.2f} {ms:5.0f}ms | {prompt[:50]}"
        )
    print(f"\naccuracy: {hits}/{len(PROMPTS)}")
    with open("eval_results.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)


if __name__ == "__main__":
    main()
