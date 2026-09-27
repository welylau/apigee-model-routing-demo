FROM ollama/ollama:latest

# Start ollama, wait for it to be ready, then pull the model so it's baked into the image
RUN nohup bash -c "ollama serve &" && \
    sleep 5 && \
    ollama pull gemma2:2b
