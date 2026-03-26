import httpx
import asyncio
from typing import Optional, Dict, Any
from ..config import settings


class PistonService:
    """Service for code execution using Piston API (free, no API key required)"""

    def __init__(self):
        self.api_url = "https://emkc.org/api/v2/piston"
        # Piston language mappings
        self.languages = {
            "python": {"language": "python", "version": "3.10"},
            "cpp": {"language": "cpp", "version": "10.2.0"},
            "java": {"language": "java", "version": "15.0.2"},
            "javascript": {"language": "javascript", "version": "18.15.0"}
        }

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
        Execute code using Piston API
        """
        lang_config = self.languages.get(language)
        if not lang_config:
            return {
                "status": {"id": 0, "description": "Unsupported Language"},
                "stdout": None,
                "stderr": f"Unsupported language: {language}",
                "time": None,
                "memory": None
            }

        # For Java, wrap code in Main class if not present
        if language == "java" and "class Main" not in code:
            code = code

        payload = {
            "language": lang_config["language"],
            "version": lang_config["version"],
            "files": [{"content": code}],
            "stdin": stdin,
            "compile_timeout": 10000,
            "run_timeout": int(time_limit * 1000),
            "compile_memory_limit": memory_limit * 1024,
            "run_memory_limit": memory_limit * 1024
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.api_url}/execute",
                    json=payload
                )
                response.raise_for_status()
                data = response.json()

                # Parse Piston response
                run_result = data.get("run", {})
                compile_result = data.get("compile", {})

                stdout = run_result.get("stdout", "")
                stderr = run_result.get("stderr", "")
                compile_output = compile_result.get("stderr", "") or compile_result.get("output", "")

                # Determine status
                if compile_result.get("code") and compile_result.get("code") != 0:
                    status_id = 6  # Compilation Error
                    status_desc = "Compilation Error"
                elif run_result.get("signal") == "SIGKILL":
                    status_id = 5  # Time Limit Exceeded
                    status_desc = "Time Limit Exceeded"
                elif run_result.get("code") and run_result.get("code") != 0:
                    status_id = 11  # Runtime Error
                    status_desc = "Runtime Error (NZEC)"
                elif stderr:
                    status_id = 12  # Runtime Error
                    status_desc = "Runtime Error"
                else:
                    # Check if output matches expected
                    actual = self._normalize(stdout)
                    expected = self._normalize(expected_output)
                    if expected and actual != expected:
                        status_id = 4  # Wrong Answer
                        status_desc = "Wrong Answer"
                    else:
                        status_id = 3  # Accepted
                        status_desc = "Accepted"

                return {
                    "status": {"id": status_id, "description": status_desc},
                    "stdout": stdout,
                    "stderr": stderr or compile_output,
                    "compile_output": compile_output,
                    "time": None,  # Piston doesn't provide execution time
                    "memory": None
                }

        except httpx.TimeoutException:
            return {
                "status": {"id": 5, "description": "Time Limit Exceeded"},
                "stdout": None,
                "stderr": "Execution timed out",
                "time": None,
                "memory": None
            }
        except httpx.HTTPError as e:
            return {
                "status": {"id": 0, "description": "Execution Failed"},
                "stdout": None,
                "stderr": f"API Error: {str(e)}",
                "time": None,
                "memory": None
            }

    def _normalize(self, text: str) -> str:
        """Normalize output for comparison"""
        if not text:
            return ""
        lines = [line.rstrip() for line in text.strip().split('\n')]
        return '\n'.join(lines)


# Status ID mapping (same as Judge0 for compatibility)
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
piston_service = PistonService()
