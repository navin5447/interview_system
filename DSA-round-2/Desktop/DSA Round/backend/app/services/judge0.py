import httpx
import asyncio
import base64
from typing import Optional, Dict, Any
from ..config import settings


class Judge0Service:
    """Service for interacting with Judge0 API for code execution"""

    def __init__(self):
        self.api_url = settings.judge0_api_url
        self.headers = {
            "X-RapidAPI-Key": settings.judge0_api_key,
            "X-RapidAPI-Host": settings.judge0_api_host,
            "Content-Type": "application/json"
        }
        self.language_ids = settings.language_ids

    def _encode_base64(self, text: str) -> str:
        """Encode text to base64"""
        return base64.b64encode(text.encode()).decode()

    def _decode_base64(self, encoded: str) -> str:
        """Decode base64 to text"""
        try:
            return base64.b64decode(encoded).decode()
        except Exception:
            return encoded

    async def create_submission(
        self,
        code: str,
        language: str,
        stdin: str = "",
        expected_output: str = "",
        time_limit: float = 2.0,
        memory_limit: int = 262144
    ) -> Optional[str]:
        """
        Create a submission on Judge0 and return the token
        """
        language_id = self.language_ids.get(language)
        if not language_id:
            raise ValueError(f"Unsupported language: {language}")

        payload = {
            "source_code": self._encode_base64(code),
            "language_id": language_id,
            "stdin": self._encode_base64(stdin),
            "expected_output": self._encode_base64(expected_output),
            "cpu_time_limit": time_limit,
            "memory_limit": memory_limit,
            "base64_encoded": True
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/submissions",
                    json=payload,
                    headers=self.headers,
                    params={"base64_encoded": "true", "wait": "false"}
                )
                response.raise_for_status()
                data = response.json()
                return data.get("token")
        except httpx.HTTPError as e:
            print(f"Judge0 API error: {e}")
            return None

    async def get_submission(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Get submission result from Judge0
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/submissions/{token}",
                    headers=self.headers,
                    params={"base64_encoded": "true", "fields": "*"}
                )
                response.raise_for_status()
                data = response.json()

                # Decode base64 fields
                if data.get("stdout"):
                    data["stdout"] = self._decode_base64(data["stdout"])
                if data.get("stderr"):
                    data["stderr"] = self._decode_base64(data["stderr"])
                if data.get("compile_output"):
                    data["compile_output"] = self._decode_base64(data["compile_output"])
                if data.get("message"):
                    data["message"] = self._decode_base64(data["message"])

                return data
        except httpx.HTTPError as e:
            print(f"Judge0 API error: {e}")
            return None

    async def wait_for_result(
        self,
        token: str,
        max_attempts: int = 20,
        delay: float = 1.0
    ) -> Optional[Dict[str, Any]]:
        """
        Poll for submission result until complete or timeout
        """
        for _ in range(max_attempts):
            result = await self.get_submission(token)
            if result is None:
                return None

            status_id = result.get("status", {}).get("id", 0)

            # Status IDs: 1=In Queue, 2=Processing, 3+=Final statuses
            if status_id >= 3:
                return result

            await asyncio.sleep(delay)

        return None

    async def execute_code(
        self,
        code: str,
        language: str,
        stdin: str = "",
        expected_output: str = "",
        time_limit: float = 2.0,
        memory_limit: int = 262144
    ) -> Dict[str, Any]:
        """
        Execute code and return result (combines create and wait)
        """
        token = await self.create_submission(
            code=code,
            language=language,
            stdin=stdin,
            expected_output=expected_output,
            time_limit=time_limit,
            memory_limit=memory_limit
        )

        if not token:
            return {
                "status": {"id": 0, "description": "Submission Failed"},
                "stdout": None,
                "stderr": "Failed to create submission",
                "time": None,
                "memory": None
            }

        result = await self.wait_for_result(token)

        if not result:
            return {
                "status": {"id": 0, "description": "Timeout"},
                "stdout": None,
                "stderr": "Execution timed out",
                "time": None,
                "memory": None
            }

        return result


# Status ID mapping from Judge0
STATUS_DESCRIPTIONS = {
    1: "In Queue",
    2: "Processing",
    3: "Accepted",
    4: "Wrong Answer",
    5: "Time Limit Exceeded",
    6: "Compilation Error",
    7: "Runtime Error (SIGSEGV)",
    8: "Runtime Error (SIGXFSZ)",
    9: "Runtime Error (SIGFPE)",
    10: "Runtime Error (SIGABRT)",
    11: "Runtime Error (NZEC)",
    12: "Runtime Error (Other)",
    13: "Internal Error",
    14: "Exec Format Error"
}


def get_status_description(status_id: int) -> str:
    """Get human-readable status description"""
    return STATUS_DESCRIPTIONS.get(status_id, "Unknown Status")


# Create singleton instance
judge0_service = Judge0Service()
