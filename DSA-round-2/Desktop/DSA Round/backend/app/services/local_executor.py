import subprocess
import asyncio
import tempfile
import os
import shutil
from typing import Dict, Any
from pathlib import Path


class LocalExecutionService:
    """
    Local code execution service - runs code directly on the machine.
    Works without any external API. Supports Python, and optionally C++/Java if compilers are installed.
    """

    def __init__(self):
        self.timeout_seconds = 10
        self.supported_languages = self._detect_available_languages()

    def _detect_available_languages(self) -> Dict[str, bool]:
        """Detect which language runtimes are available"""
        languages = {
            "python": shutil.which("python") is not None or shutil.which("python3") is not None,
            "cpp": shutil.which("g++") is not None,
            "java": shutil.which("javac") is not None,
            "javascript": shutil.which("node") is not None
        }
        return languages

    def _get_python_cmd(self):
        """Get the Python command available on the system"""
        if shutil.which("python3"):
            return "python3"
        return "python"

    async def execute_code(
        self,
        code: str,
        language: str,
        stdin: str = "",
        expected_output: str = "",
        time_limit: float = 5.0,
        memory_limit: int = 262144
    ) -> Dict[str, Any]:
        """Execute code locally and return results"""

        if language not in self.supported_languages or not self.supported_languages.get(language):
            return {
                "status": {"id": 0, "description": "Language Not Available"},
                "stdout": None,
                "stderr": f"Language '{language}' is not available. Install the required runtime.",
                "time": None,
                "memory": None
            }

        # Create temp directory for execution
        temp_dir = tempfile.mkdtemp(prefix="code_exec_")

        try:
            if language == "python":
                result = await self._execute_python(code, stdin, time_limit, temp_dir)
            elif language == "cpp":
                result = await self._execute_cpp(code, stdin, time_limit, temp_dir)
            elif language == "java":
                result = await self._execute_java(code, stdin, time_limit, temp_dir)
            elif language == "javascript":
                result = await self._execute_javascript(code, stdin, time_limit, temp_dir)
            else:
                result = {
                    "status": {"id": 0, "description": "Unsupported Language"},
                    "stdout": None,
                    "stderr": f"Language '{language}' is not supported",
                    "time": None,
                    "memory": None
                }

            # Check output if expected_output is provided
            if result["status"]["id"] == 3 and expected_output:
                actual = self._normalize(result.get("stdout", ""))
                expected = self._normalize(expected_output)
                if actual != expected:
                    result["status"] = {"id": 4, "description": "Wrong Answer"}

            return result

        except Exception as e:
            import traceback
            print(f"Error executing code: {str(e)}")
            print(traceback.format_exc())
            return {
                "status": {"id": 13, "description": "Internal Error"},
                "stdout": None,
                "stderr": f"Execution error: {str(e)}",
                "time": None,
                "memory": None
            }
        finally:
            # Cleanup temp directory
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

    async def _execute_python(self, code: str, stdin: str, timeout: float, temp_dir: str) -> Dict[str, Any]:
        """Execute Python code"""
        file_path = os.path.join(temp_dir, "solution.py")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)

        return await self._run_process([self._get_python_cmd(), file_path], stdin, timeout)

    async def _execute_cpp(self, code: str, stdin: str, timeout: float, temp_dir: str) -> Dict[str, Any]:
        """Execute C++ code"""
        source_path = os.path.join(temp_dir, "solution.cpp")
        exe_path = os.path.join(temp_dir, "solution.exe" if os.name == "nt" else "solution")

        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Compile
        compile_result = await self._run_process(
            ["g++", "-o", exe_path, source_path, "-std=c++17"],
            "",
            30.0
        )

        if compile_result["status"]["id"] != 3:
            return {
                "status": {"id": 6, "description": "Compilation Error"},
                "stdout": None,
                "stderr": compile_result.get("stderr", "Compilation failed"),
                "compile_output": compile_result.get("stderr", ""),
                "time": None,
                "memory": None
            }

        # Run
        return await self._run_process([exe_path], stdin, timeout)

    async def _execute_java(self, code: str, stdin: str, timeout: float, temp_dir: str) -> Dict[str, Any]:
        """Execute Java code"""
        source_path = os.path.join(temp_dir, "Main.java")

        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Compile
        compile_result = await self._run_process(
            ["javac", source_path],
            "",
            30.0
        )

        if compile_result["status"]["id"] != 3:
            return {
                "status": {"id": 6, "description": "Compilation Error"},
                "stdout": None,
                "stderr": compile_result.get("stderr", "Compilation failed"),
                "compile_output": compile_result.get("stderr", ""),
                "time": None,
                "memory": None
            }

        # Run
        return await self._run_process(["java", "-cp", temp_dir, "Main"], stdin, timeout)

    async def _execute_javascript(self, code: str, stdin: str, timeout: float, temp_dir: str) -> Dict[str, Any]:
        """Execute JavaScript code"""
        file_path = os.path.join(temp_dir, "solution.js")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)

        return await self._run_process(["node", file_path], stdin, timeout)

    async def _run_process(self, cmd: list, stdin: str, timeout: float) -> Dict[str, Any]:
        """Run a process with timeout and capture output (Windows-compatible)"""
        import concurrent.futures

        def run_sync():
            try:
                result = subprocess.run(
                    cmd,
                    input=stdin.encode() if stdin else None,
                    capture_output=True,
                    timeout=timeout
                )
                return {
                    "returncode": result.returncode,
                    "stdout": result.stdout.decode("utf-8", errors="replace") if result.stdout else "",
                    "stderr": result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
                }
            except subprocess.TimeoutExpired:
                return {"timeout": True}
            except FileNotFoundError:
                return {"file_not_found": True, "cmd": cmd[0]}
            except Exception as e:
                return {"error": str(e)}

        try:
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = await loop.run_in_executor(pool, run_sync)

            if result.get("timeout"):
                return {
                    "status": {"id": 5, "description": "Time Limit Exceeded"},
                    "stdout": None,
                    "stderr": "Execution timed out",
                    "time": None,
                    "memory": None
                }

            if result.get("file_not_found"):
                return {
                    "status": {"id": 0, "description": "Runtime Not Found"},
                    "stdout": None,
                    "stderr": f"Command not found: {result.get('cmd')}",
                    "time": None,
                    "memory": None
                }

            if result.get("error"):
                return {
                    "status": {"id": 13, "description": "Internal Error"},
                    "stdout": None,
                    "stderr": result.get("error"),
                    "time": None,
                    "memory": None
                }

            stdout_str = result.get("stdout", "")
            stderr_str = result.get("stderr", "")

            if result.get("returncode") == 0:
                return {
                    "status": {"id": 3, "description": "Accepted"},
                    "stdout": stdout_str,
                    "stderr": stderr_str if stderr_str else None,
                    "time": None,
                    "memory": None
                }
            else:
                return {
                    "status": {"id": 11, "description": "Runtime Error (NZEC)"},
                    "stdout": stdout_str,
                    "stderr": stderr_str,
                    "time": None,
                    "memory": None
                }

        except Exception as e:
            return {
                "status": {"id": 13, "description": "Internal Error"},
                "stdout": None,
                "stderr": str(e),
                "time": None,
                "memory": None
            }

    def _normalize(self, text: str) -> str:
        """Normalize output for comparison"""
        if not text:
            return ""
        # Normalize line endings: \r\n -> \n
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        lines = [line.rstrip() for line in text.strip().split('\n')]
        return '\n'.join(lines)


# Status descriptions (matching Judge0 format)
STATUS_DESCRIPTIONS = {
    0: "Error",
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
local_executor = LocalExecutionService()
