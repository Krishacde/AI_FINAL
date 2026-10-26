from __future__ import annotations

import unittest
from unittest.mock import Mock

from services.result_cache import ResultCache, configured_ttl


class ResultCacheTests(unittest.TestCase):
    def test_repeated_query_uses_cached_value(self) -> None:
        cache = ResultCache(redis_url="")
        calls = 0

        def load():
            nonlocal calls
            calls += 1
            return {"result": [1, 2, 3]}

        first, first_hit = cache.get_or_load("search", {"query": "same"}, 60, load)
        second, second_hit = cache.get_or_load("search", {"query": "same"}, 60, load)

        self.assertEqual(first, second)
        self.assertFalse(first_hit)
        self.assertTrue(second_hit)
        self.assertEqual(calls, 1)

    def test_failed_result_is_not_cached(self) -> None:
        cache = ResultCache(redis_url="")
        calls = 0

        def load():
            nonlocal calls
            calls += 1
            return {"success": False}

        cache.get_or_load("search", {"query": "failed"}, 60, load, should_cache=lambda result: result["success"])
        cache.get_or_load("search", {"query": "failed"}, 60, load, should_cache=lambda result: result["success"])

        self.assertEqual(calls, 2)

    def test_invalid_ttl_uses_safe_default(self) -> None:
        from unittest.mock import patch

        with patch.dict("os.environ", {"CACHE_TEST_TTL": "invalid"}):
            self.assertEqual(configured_ttl("CACHE_TEST_TTL", 45), 45)

    def test_cache_status_reports_local_fallback_when_redis_is_not_configured(self) -> None:
        cache = ResultCache(redis_url="")
        self.assertEqual(cache.status(), {"backend": "process_local", "redis": "not_configured"})

    def test_cache_status_pings_configured_redis(self) -> None:
        redis_client = Mock()
        cache = ResultCache(redis_url="redis://localhost:6379/0", redis_client=redis_client)
        self.assertEqual(cache.status(), {"backend": "redis_with_process_fallback", "redis": "connected"})
        redis_client.ping.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
