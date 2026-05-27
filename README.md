# Clinical-Trial-Engine
AI-powered clinical trial matching engine that screens patients against active trials and returns ranked eligibility results with plain-English justifications.


Stack Decision

Backend: Python + FastAPI
AI: Nebius API (OpenAI-compatible, so you use the openai Python SDK pointed at Nebius's base URL)
Model: Use Llama 3.1 70B if available on your Nebius account — it's the best balance of reasoning quality and speed for this task. Mistral Large is a good fallback.
Frontend: Simple HTML/CSS/JS or React — keep it light so Person B isn't blocked on tooling
Data: ClinicalTrials.gov public API for real trial data
