from __future__ import annotations

from dataclasses import dataclass
from threading import Lock

from pynput import keyboard, mouse


@dataclass
class InputSnapshot:
    kb_count: int
    mouse_count: int
    typed_text: str


_MODIFIER_KEYS = {
    keyboard.Key.shift,
    keyboard.Key.shift_r,
    keyboard.Key.ctrl,
    keyboard.Key.ctrl_r,
    keyboard.Key.alt,
    keyboard.Key.alt_r,
    keyboard.Key.cmd,
    keyboard.Key.cmd_r,
    keyboard.Key.caps_lock,
}


class InputMonitor:
    def __init__(self, capture_text: bool = False, max_text_chars: int = 500) -> None:
        self.capture_text = capture_text
        self.max_text_chars = max_text_chars
        self._lock = Lock()
        self._kb_count = 0
        self._mouse_count = 0
        self._typed_chars: list[str] = []
        self._last_snapshot_len = 0
        self._kb_listener: keyboard.Listener | None = None
        self._mouse_listener: mouse.Listener | None = None

    def start(self) -> None:
        self._kb_listener = keyboard.Listener(on_press=self._on_key_press)
        self._mouse_listener = mouse.Listener(
            on_click=self._on_click, on_scroll=self._on_scroll
        )
        self._kb_listener.start()
        self._mouse_listener.start()

    def stop(self) -> None:
        if self._kb_listener is not None:
            self._kb_listener.stop()
        if self._mouse_listener is not None:
            self._mouse_listener.stop()

    def reset_context(self) -> None:
        with self._lock:
            self._typed_chars.clear()
            self._last_snapshot_len = 0

    def _append_char(self, char: str) -> None:
        if len(self._typed_chars) < self.max_text_chars:
            self._typed_chars.append(char)

    def _on_key_press(self, key: keyboard.KeyCode | keyboard.Key) -> None:
        with self._lock:
            if key not in _MODIFIER_KEYS:
                self._kb_count += 1
            if not self.capture_text:
                return
            if isinstance(key, keyboard.KeyCode) and key.char:
                self._append_char(key.char)
            elif key == keyboard.Key.space:
                self._append_char(" ")
            elif key == keyboard.Key.enter:
                self._append_char("\n")
            elif key in (keyboard.Key.backspace, keyboard.Key.delete):
                if self._typed_chars:
                    self._typed_chars.pop()
                    if self._last_snapshot_len > len(self._typed_chars):
                        self._last_snapshot_len = len(self._typed_chars)
            elif key == keyboard.Key.tab:
                self._append_char("\t")

    def _on_click(self, _x: int, _y: int, _button: mouse.Button, pressed: bool) -> None:
        if not pressed:
            return
        with self._lock:
            self._mouse_count += 1

    def _on_scroll(self, _x: int, _y: int, _dx: int, _dy: int) -> None:
        with self._lock:
            self._mouse_count += 1

    def snapshot_and_reset(self) -> InputSnapshot:
        with self._lock:
            full_text = "".join(self._typed_chars)
            delta = full_text[self._last_snapshot_len :]
            self._last_snapshot_len = len(full_text)
            snapshot = InputSnapshot(
                kb_count=self._kb_count,
                mouse_count=self._mouse_count,
                typed_text=delta,
            )
            self._kb_count = 0
            self._mouse_count = 0
            return snapshot
