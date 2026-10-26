from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from agents.simulated_payment_agent import SimulatedPaymentAgent
from services.wallet import Wallet


class FakeLLM:
    def __init__(self, script: list[str]) -> None:
        self.script = script
        self.calls = 0

    async def chat(self, messages, tools):
        step = self.script[self.calls]
        self.calls += 1
        if step == "STOP":
            message = {"role": "assistant", "content": json.dumps({"decision": "complete", "message": "Done."})}
        else:
            message = {"role": "assistant", "tool_calls": [{"id": f"call-{self.calls}", "type": "function",
                "function": {"name": step, "arguments": "{}"}}]}
        return {"choices": [{"message": message}]}


class UnavailableLLM:
    async def chat(self, messages, tools):
        request = httpx.Request("POST", "https://example.test/chat/completions")
        response = httpx.Response(404, request=request)
        raise httpx.HTTPStatusError("provider returned 404", request=request, response=response)


def run_immediate_coroutine(coroutine):
    """Run the immediate FakeLLM coroutines without opening a Windows socketpair."""
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    coroutine.close()
    raise AssertionError("FakeLLM unexpectedly performed asynchronous I/O")


class AgenticPaymentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.wallet = Wallet(sqlite_path=Path(self.temp_dir.name) / "wallet.sqlite3")
        self.items = [{"category": "cab", "name": "Local SUV Transfer", "amount_minor": 280_000}]
        self.asyncio_patch = patch("agents.simulated_payment_agent.asyncio.run", run_immediate_coroutine)
        self.asyncio_patch.start()

    def tearDown(self) -> None:
        self.asyncio_patch.stop()
        self.temp_dir.cleanup()

    def test_llm_chooses_one_guarded_tool_per_turn_and_completes_booking(self) -> None:
        model = FakeLLM(["get_order_details", "check_risk", "hold_funds", "confirm_booking", "capture_payment", "STOP"])
        result = SimulatedPaymentAgent(self.wallet, llm=model).run("trip-agentic", self.items)

        self.assertTrue(result["success"])
        self.assertEqual(result["agent_mode"], "llm_tool_calls")
        self.assertEqual(model.calls, 6)
        self.assertEqual([row["actor"] for row in result["progress"][1:6]], ["agent"] * 5)
        self.assertEqual(self.wallet.get_wallet_balance()["available_minor"], 9_720_000)
        self.assertIn("transport_voucher", result["payment"]["documents"])

    def test_low_wallet_decline_does_not_charge(self) -> None:
        poor = Wallet(sqlite_path=Path(self.temp_dir.name) / "poor.sqlite3", wallet_balance_minor=100)
        model = FakeLLM(["check_risk", "STOP"])
        result = SimulatedPaymentAgent(poor, llm=model).run("trip-poor-agentic", self.items)

        self.assertFalse(result["success"])
        self.assertEqual(result["payment_status"], "FAILED")
        self.assertEqual(poor.get_wallet_balance()["available_minor"], 100)
        self.assertTrue(any("insufficient_funds" in row["step"] for row in result["progress"]))

    def test_unknown_tool_fails_safely_and_releases_reservation(self) -> None:
        model = FakeLLM(["hold_funds", "mint_money"])
        result = SimulatedPaymentAgent(self.wallet, llm=model).run("trip-guarded", self.items)

        self.assertFalse(result["success"])
        self.assertEqual(result["payment_status"], "REFUNDED")
        self.assertEqual(self.wallet.get_wallet_balance()["available_minor"], 10_000_000)
        self.assertEqual(self.wallet.get_wallet_balance()["reserved_minor"], 0)

    def test_tool_arguments_cannot_override_server_amount(self) -> None:
        model = FakeLLM(["hold_funds", "STOP"])
        original = model.chat

        async def with_arguments(messages, tools):
            response = await original(messages, tools)
            if response["choices"][0]["message"].get("tool_calls"):
                response["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] = '{"amount_minor":1}'
            return response

        model.chat = with_arguments
        result = SimulatedPaymentAgent(self.wallet, llm=model).run("trip-no-amount-args", self.items)
        self.assertFalse(result["success"])
        self.assertEqual(result["payment_status"], "FAILED")
        self.assertEqual(self.wallet.get_wallet_balance()["available_minor"], 10_000_000)

    def test_model_unavailable_before_tools_uses_guarded_sandbox_fallback(self) -> None:
        result = SimulatedPaymentAgent(self.wallet, llm=UnavailableLLM()).run("trip-model-down", self.items)

        self.assertTrue(result["success"])
        self.assertEqual(result["agent_mode"], "safe_offline_tools")
        self.assertEqual(self.wallet.get_wallet_balance()["available_minor"], 9_720_000)
        self.assertTrue(any("model unavailable" in row["step"] for row in result["progress"]))
        self.assertNotIn("provider returned 404", result["error"] or "")


if __name__ == "__main__":
    unittest.main()
