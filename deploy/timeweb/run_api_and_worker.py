"""Run the API and ARQ worker as one Timeweb App Platform container."""

from __future__ import annotations

import signal
import subprocess
import sys
import time
from collections.abc import Sequence


API_COMMAND = (
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    "8000",
    "--proxy-headers",
    "--forwarded-allow-ips",
    "*",
)
WORKER_COMMAND = (
    "arq",
    "app.tasks.notifications.WorkerSettings",
)


def _terminate(processes: Sequence[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    deadline = time.monotonic() + 10
    for process in processes:
        remaining = max(0.0, deadline - time.monotonic())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def main() -> int:
    processes = [subprocess.Popen(API_COMMAND), subprocess.Popen(WORKER_COMMAND)]
    stopping = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    try:
        while not stopping:
            for process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    print(
                        f"[timeweb] child process exited pid={process.pid} code={exit_code}",
                        file=sys.stderr,
                        flush=True,
                    )
                    return exit_code or 1
            time.sleep(0.5)
        return 0
    finally:
        _terminate(processes)


if __name__ == "__main__":
    raise SystemExit(main())

