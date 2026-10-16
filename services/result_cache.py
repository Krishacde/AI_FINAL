from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Callable

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("tripmate.cache")


def configured_ttl(name: str, default: int, maximum: int = 31_536_000) -> int:
    try:
        configured = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        logger.warning("Invalid %s value; using the default cache lifetime.", name)
        configured = default
    return max(1, min(configured, maximum))


class ResultCache:
    """Redis-backed JSON cache with a bounded in-process fallback."""

    def __init__(self, redis_url: str | None = None, redis_client: Any | None = None, max_entries: int = 1024) -> None:
        self.redis_url = redis_url if redis_url is not None else os.getenv("REDIS_URL", "").strip()
        self.redis_client = redis_client
        self.max_entries = max_entries
        self._local: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.RLock()
        self._redis_disabled_until = 0.0
        self._warned_redis = False

    def _redis(self):
        if not self.redis_url or time.monotonic() < self._redis_disabled_until:
            return None
        if self.redis_client is None:
            try:
                import redis

                self.redis_client = redis.Redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=0.5,
                    socket_timeout=0.5,
                    health_check_interval=30,
                )
            except Exception as exc:
                self._disable_redis(exc)
                return None
        return self.redis_client

    def _disable_redis(self, exc: Exception) -> None:
        self._redis_disabled_until = time.monotonic() + 30
        if not self._warned_redis:
            logger.warning("Redis cache unavailable; using in-process cache for 30 seconds: %s", exc)
            self._warned_redis = True

    @staticmethod
    def _key(namespace: str, params: Any) -> str:
        encoded = json.dumps(params, sort_keys=True, separators=(",", ":"), default=str)
        digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        return f"tripmate:result:v1:{namespace}:{digest}"

    def _lock_for(self, key: str) -> threading.Lock:
        with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = self._locks[key] = threading.Lock()
            return lock

    def _get(self, key: str) -> Any | None:
        client = self._redis()
        if client is not None:
            try:
                cached = client.get(key)
                if cached is not None:
                    return json.loads(cached)
            except Exception as exc:
                self._disable_redis(exc)
        now = time.monotonic()
        with self._guard:
            entry = self._local.get(key)
            if entry is None:
                return None
            expires, value = entry
            if expires <= now:
                self._local.pop(key, None)
                return None
            self._local.move_to_end(key)
            return value

    def _put(self, key: str, value: Any, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        try:
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        except (TypeError, ValueError):
            return
        client = self._redis()
        if client is not None:
            try:
                client.set(key, encoded, ex=ttl_seconds)
            except Exception as exc:
                self._disable_redis(exc)
        with self._guard:
            self._local[key] = (time.monotonic() + ttl_seconds, value)
            self._local.move_to_end(key)
            while len(self._local) > self.max_entries:
                self._local.popitem(last=False)

    def get(self, namespace: str, params: Any) -> Any | None:
        return self._get(self._key(namespace, params))

    def set(self, namespace: str, params: Any, value: Any, ttl_seconds: int) -> None:
        self._put(self._key(namespace, params), value, ttl_seconds)

    def status(self) -> dict[str, str]:
        if not self.redis_url:
            return {"backend": "process_local", "redis": "not_configured"}
        if time.monotonic() < self._redis_disabled_until:
            return {"backend": "process_local", "redis": "unavailable"}
        client = self._redis()
        if client is None:
            return {"backend": "process_local", "redis": "unavailable"}
        try:
            client.ping()
        except Exception as exc:
            self._disable_redis(exc)
            return {"backend": "process_local", "redis": "unavailable"}
        return {"backend": "redis_with_process_fallback", "redis": "connected"}

    def get_or_load(
        self,
        namespace: str,
        params: Any,
        ttl_seconds: int,
        loader: Callable[[], Any],
        should_cache: Callable[[Any], bool] | None = None,
    ) -> tuple[Any, bool]:
        key = self._key(namespace, params)
        cached = self._get(key)
        if cached is not None:
            return cached, True
        with self._lock_for(key):
            cached = self._get(key)
            if cached is not None:
                return cached, True
            value = loader()
            if should_cache is None or should_cache(value):
                self._put(key, value, ttl_seconds)
            return value, False


result_cache = ResultCache()
