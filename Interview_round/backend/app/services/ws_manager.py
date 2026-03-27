import asyncio
import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self.connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.connections[session_id].append(websocket)

    async def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.connections[session_id]:
                self.connections[session_id].remove(websocket)
            if not self.connections[session_id]:
                self.connections.pop(session_id, None)

    async def broadcast(self, session_id: str, event: str, payload: dict[str, Any]) -> None:
        message = json.dumps({"event": event, "data": payload})
        dead: list[WebSocket] = []
        for ws in self.connections.get(session_id, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self.connections.get(session_id, []):
                        self.connections[session_id].remove(ws)


ws_manager = WebSocketManager()
