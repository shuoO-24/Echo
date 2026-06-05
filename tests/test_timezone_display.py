import unittest
from datetime import datetime, timezone

from ec.desktop.timezone_display import display_today, format_hm, minutes_from_midnight, to_display


class TestTimezoneDisplay(unittest.TestCase):
    def test_utc_noon_is_morning_pacific(self) -> None:
        # 2026-06-03 20:00 UTC = 13:00 PDT (summer)
        ts = datetime(2026, 6, 3, 20, 0, tzinfo=timezone.utc)
        self.assertEqual(format_hm(ts.replace(tzinfo=None)), "13:00")
        self.assertEqual(minutes_from_midnight(ts.replace(tzinfo=None)), 13 * 60)

    def test_to_display_naive_as_utc(self) -> None:
        ts = datetime(2026, 1, 15, 20, 0)  # winter: UTC 20:00 = PST 12:00
        local = to_display(ts)
        self.assertEqual(local.hour, 12)
        self.assertEqual(local.strftime("%Z"), "PST")

    def test_display_today_format(self) -> None:
        self.assertRegex(display_today(), r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
