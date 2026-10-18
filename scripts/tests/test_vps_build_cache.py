"""Linux behavioral tests for bounded Docker build-cache maintenance."""
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "maintain-vps-build-cache.sh"


class BuildCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.bin = self.folder / "bin"
        self.bin.mkdir()
        self.log = self.folder / "commands.log"
        self.lock = self.folder / "maintenance.lock"
        self.env = {
            **os.environ,
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "TEST_LOG": str(self.log),
            "FITNESS_CACHE_LOCK_FILE": str(self.lock),
        }
        self.fake("docker", 'printf "docker %s\\n" "$*" >> "$TEST_LOG"\nexit "${TEST_DOCKER_EXIT:-0}"\n')
        self.fake("curl", 'printf "curl %s\\n" "$*" >> "$TEST_LOG"\nexit "${TEST_CURL_EXIT:-0}"\n')

    def fake(self, name, body):
        target = self.bin / name
        target.write_text("#!/bin/sh\n" + body)
        target.chmod(0o755)

    def run_mode(self, mode):
        return subprocess.run(["sh", str(SCRIPT), mode], env=self.env, capture_output=True, text=True)

    def commands(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_hourly_budget_only_prunes_build_cache_to_5gb(self):
        result = self.run_mode("--budget")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), ["docker buildx prune --all --force --max-used-space=5GB"])

    def test_weekly_cleanup_only_prunes_cache_unused_for_72_hours(self):
        result = self.run_mode("--stale")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), ["docker buildx prune --all --force --filter until=72h"])

    def test_after_release_checks_health_before_both_cleanups(self):
        result = self.run_mode("--after-release")
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = self.commands()
        self.assertEqual(len(commands), 4)
        self.assertIn("https://api.filfitclub.ru/health", commands[0])
        self.assertIn("https://app.filfitclub.ru", commands[1])
        self.assertEqual(commands[2:], [
            "docker buildx prune --all --force --filter until=72h",
            "docker buildx prune --all --force --max-used-space=5GB",
        ])

    def test_failed_health_does_not_delete_cache(self):
        self.env["TEST_CURL_EXIT"] = "22"
        result = self.run_mode("--after-release")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(command.startswith("docker ") for command in self.commands()))

    def test_docker_failure_is_not_reported_as_success(self):
        self.env["TEST_DOCKER_EXIT"] = "7"
        result = self.run_mode("--budget")
        self.assertEqual(result.returncode, 7)
        self.assertNotIn("BUILD_CACHE_OK", result.stdout)

    def test_concurrent_maintenance_skips_without_deleting(self):
        with self.lock.open("w") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_mode("--budget")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), [])
        self.assertIn("BUILD_CACHE_BUSY", result.stdout)

    def test_unknown_mode_does_not_run_docker(self):
        result = self.run_mode("--everything")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.commands(), [])


if __name__ == "__main__":
    unittest.main()