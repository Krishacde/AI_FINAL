from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


class TripStore:
    """Durable trip, itinerary-version, and conversation store.

    Payment and wallet truth remain in PaymentService's ledger database; this
    store contains trip snapshots and references only, never payment secrets.
    """

    def __init__(self, database_path: str | Path | None = None) -> None:
        local = Path(os.getenv("LOCALAPPDATA", Path.home())) / "TripMateAI"
        self.database_path = Path(database_path or os.getenv("TRIPMATE_TRIPS_DB") or local / "trips.sqlite3")
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS trips (
                    trip_id TEXT PRIMARY KEY,
                    thread_id TEXT,
                    name TEXT NOT NULL,
                    destination TEXT,
                    request_json TEXT NOT NULL,
                    trip_json TEXT NOT NULL,
                    current_version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_trips_updated ON trips(updated_at DESC);
                CREATE TABLE IF NOT EXISTS itinerary_versions (
                    version_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id TEXT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
                    version INTEGER NOT NULL,
                    itinerary_json TEXT NOT NULL,
                    change_summary TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(trip_id, version)
                );
                CREATE TABLE IF NOT EXISTS trip_messages (
                    message_id TEXT PRIMARY KEY,
                    trip_id TEXT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_trip_messages_trip ON trip_messages(trip_id, created_at);
                PRAGMA user_version = 1;
            """)

    @staticmethod
    def _trip_name(trip: dict[str, Any]) -> str:
        request = trip.get("request") or {}
        return str(trip.get("name") or trip.get("selected_destination") or request.get("destination") or "Trip")[:160]

    def save_trip(self, trip: dict[str, Any], *, change_summary: str | None = None) -> dict[str, Any]:
        trip_id = str(trip.get("trip_id") or "").strip()
        if not trip_id:
            raise ValueError("A trip_id is required for persistent trip storage.")
        snapshot = _json(trip)
        request_json = _json(trip.get("request") or {})
        itinerary_json = _json(trip.get("itinerary_items") or trip.get("itinerary") or [])
        now = _now()
        with self._connection() as db:
            row = db.execute("SELECT trip_json,current_version,created_at FROM trips WHERE trip_id=?", (trip_id,)).fetchone()
            if row is None:
                version = 1
                created = now
                db.execute("""INSERT INTO trips(trip_id,thread_id,name,destination,request_json,trip_json,current_version,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?, ?,?)""", (trip_id, trip.get("thread_id"), self._trip_name(trip), trip.get("selected_destination"), request_json, snapshot, version, created, now))
                db.execute("INSERT INTO itinerary_versions(trip_id,version,itinerary_json,change_summary,created_at) VALUES(?,?,?,?,?)", (trip_id, version, itinerary_json, change_summary or "Initial itinerary", now))
            else:
                version = int(row["current_version"])
                created = row["created_at"]
                changed = hashlib.sha256(row["trip_json"].encode()).digest() != hashlib.sha256(snapshot.encode()).digest()
                previous = json.loads(row["trip_json"])
                previous_itinerary = _json(previous.get("itinerary_items") or previous.get("itinerary") or [])
                if changed and previous_itinerary != itinerary_json:
                    version += 1
                    db.execute("INSERT INTO itinerary_versions(trip_id,version,itinerary_json,change_summary,created_at) VALUES(?,?,?,?,?)", (trip_id, version, itinerary_json, change_summary, now))
                db.execute("""UPDATE trips SET thread_id=?,name=?,destination=?,request_json=?,trip_json=?,current_version=?,updated_at=? WHERE trip_id=?""",
                           (trip.get("thread_id"), self._trip_name(trip), trip.get("selected_destination"), request_json, snapshot, version, now, trip_id))
        return {"trip_id": trip_id, "version": version, "created_at": created, "updated_at": now}

    def get_trip(self, trip_id: str) -> dict[str, Any] | None:
        with self._connection() as db:
            row = db.execute("SELECT trip_json,current_version,created_at,updated_at,name FROM trips WHERE trip_id=?", (trip_id,)).fetchone()
        if row is None:
            return None
        trip = json.loads(row["trip_json"])
        trip.update({"current_version": row["current_version"], "created_at": row["created_at"], "updated_at": row["updated_at"], "name": row["name"]})
        return trip

    def list_trips(self) -> list[dict[str, Any]]:
        with self._connection() as db:
            rows = db.execute("SELECT trip_id,thread_id,name,destination,current_version,created_at,updated_at FROM trips ORDER BY updated_at DESC").fetchall()
        return [dict(row) for row in rows]

    def add_message(self, trip_id: str, role: str, content: str) -> None:
        if role not in {"user", "assistant", "system"} or not content.strip():
            return
        with self._connection() as db:
            db.execute("INSERT INTO trip_messages(message_id,trip_id,role,content,created_at) VALUES(?,?,?,?,?)",
                       (str(uuid.uuid4()), trip_id, role, content[:12000], _now()))

    def get_messages(self, trip_id: str) -> list[dict[str, Any]]:
        with self._connection() as db:
            rows = db.execute("SELECT role,content,created_at FROM trip_messages WHERE trip_id=? ORDER BY created_at", (trip_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_versions(self, trip_id: str) -> list[dict[str, Any]]:
        with self._connection() as db:
            rows = db.execute("SELECT version,itinerary_json,change_summary,created_at FROM itinerary_versions WHERE trip_id=? ORDER BY version DESC", (trip_id,)).fetchall()
        return [{**dict(row), "itinerary": json.loads(row["itinerary_json"])} for row in rows]

    def rename_trip(self, trip_id: str, name: str) -> bool:
        name = name.strip()[:160]
        if not name:
            raise ValueError("Trip name cannot be empty.")
        with self._connection() as db:
            row = db.execute("SELECT trip_json FROM trips WHERE trip_id=?", (trip_id,)).fetchone()
            if row is None:
                return False
            trip = json.loads(row["trip_json"])
            trip["name"] = name
            db.execute("UPDATE trips SET name=?,trip_json=?,updated_at=? WHERE trip_id=?", (name, _json(trip), _now(), trip_id))
        return True

    def delete_trip(self, trip_id: str) -> bool:
        with self._connection() as db:
            result = db.execute("DELETE FROM trips WHERE trip_id=?", (trip_id,))
        return result.rowcount > 0


trip_store = TripStore()
