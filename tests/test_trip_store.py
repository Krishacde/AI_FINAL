import tempfile
import unittest
from pathlib import Path

from services.trip_store import TripStore


class TripStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = TripStore(Path(self.temp_dir.name) / "trips.sqlite3")
        self.trip = {
            "trip_id": "trip-1",
            "thread_id": "thread-1",
            "request": {"destination": "Saputara", "origin": "Surat"},
            "selected_destination": "Saputara",
            "itinerary_items": [{"date": "2026-12-01", "title": "Lake"}],
            "sandbox_bookings": [],
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_restore_and_list_trip(self):
        created = self.store.save_trip(self.trip, change_summary="Initial plan")
        restored = self.store.get_trip("trip-1")
        self.assertEqual(created["version"], 1)
        self.assertEqual(restored["request"]["destination"], "Saputara")
        self.assertEqual(self.store.list_trips()[0]["trip_id"], "trip-1")

    def test_itinerary_changes_create_versions_but_metadata_updates_do_not(self):
        self.store.save_trip(self.trip, change_summary="Initial plan")
        changed = {**self.trip, "itinerary_items": [{"date": "2026-12-01", "title": "Garden"}]}
        self.assertEqual(self.store.save_trip(changed, change_summary="Changed activities")["version"], 2)
        self.assertEqual(self.store.save_trip({**changed, "updated_marker": True})["version"], 2)
        self.assertEqual([item["version"] for item in self.store.get_versions("trip-1")], [2, 1])

    def test_messages_rename_and_delete(self):
        self.store.save_trip(self.trip)
        self.store.add_message("trip-1", "user", "Make day one relaxed")
        self.assertEqual(self.store.get_messages("trip-1")[0]["content"], "Make day one relaxed")
        self.assertTrue(self.store.rename_trip("trip-1", "Family weekend"))
        self.assertEqual(self.store.get_trip("trip-1")["name"], "Family weekend")
        self.assertTrue(self.store.delete_trip("trip-1"))
        self.assertIsNone(self.store.get_trip("trip-1"))


if __name__ == "__main__":
    unittest.main()
