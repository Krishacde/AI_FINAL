from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from agents.payment_llm import GEMINI_BASE_URL, PaymentLLM


class PaymentLLMConfigTests(unittest.TestCase):
    def test_gemini_uses_current_function_calling_model_by_default(self) -> None:
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True), \
                patch("agents.payment_llm.load_dotenv"):
            model = PaymentLLM.from_env()

        self.assertEqual(model.base_url, GEMINI_BASE_URL)
        self.assertEqual(model.model, "gemini-3.8-flash")

    def test_old_gemini_default_in_dotenv_is_upgraded(self) -> None:
        env = {"GEMINI_API_KEY": "test-key", "MODEL_NAME": "gemini-2.5-flash"}
        with patch.dict(os.environ, env, clear=True), patch("agents.payment_llm.load_dotenv"):
            model = PaymentLLM.from_env()

        self.assertEqual(model.model, "gemini-3.8-flash")


if __name__ == "__main__":
    unittest.main()
