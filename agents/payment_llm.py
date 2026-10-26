"""Small OpenAI-compatible chat client for the payment tool-calling agent."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"


class PaymentLLM:
    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 35) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> PaymentLLM:
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        groq_key = os.getenv("GROQ_API_KEY", "").strip()
        api_key = gemini_key or os.getenv("MODEL_API_KEY", "").strip() or os.getenv("OPENAI_API_KEY", "").strip() or groq_key
        model = os.getenv("MODEL_NAME", "").strip()
        base_url = os.getenv("MODEL_BASE_URL", "").strip()

        # Upgrade the retired Gemini default when an older local .env still
        # names it explicitly, while preserving all other custom model choices.
        if gemini_key and model == "gemini-2.5-flash":
            model = "gemini-3.8-flash"

        if not api_key:
            raise RuntimeError("Set GEMINI_API_KEY, or set MODEL_API_KEY with MODEL_NAME for the payment agent.")
        if not base_url:
            if gemini_key:
                base_url = GEMINI_BASE_URL
            elif groq_key and api_key == groq_key:
                base_url = "https://api.groq.com/openai/v1"
            else:
                base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        if not model:
            if gemini_key:
                # Gemini 2.5 Flash has been retired. Keep the default on a
                # currently supported stable model with function calling.
                model = "gemini-3.8-flash"
            else:
                raise RuntimeError("Set MODEL_NAME when using GROQ_API_KEY, MODEL_API_KEY, or OPENAI_API_KEY.")
        return cls(base_url, api_key, model)

    async def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        body = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=body)
        response.raise_for_status()
        return response.json()
