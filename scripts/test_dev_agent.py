"""Regression checks for selecting this worktree and protecting unrelated listeners."""
import contextlib
import io
import json
import signal
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import dev_agent


class DevAgentTests(unittest.TestCase):
    def test_python_import_and_uvicorn_resolve_this_worktree(self):
        root = Path("/workspace/agent")
        self.assertEqual(dev_agent.backend_environment(root)["PYTHONPATH"], "/workspace/agent/backend")
        command = dev_agent.api_command(Path("/shared/.venv/bin/python"), root, 8011)
        self.assertEqual(command[command.index("--app-dir") + 1], "/workspace/agent/backend")
        self.assertEqual(command[command.index("--port") + 1], "8011")
        self.assertIn("--reload", command)

    @patch("dev_agent.subprocess.run")
    @patch("dev_agent.listeners", return_value=[123])
    def test_unrelated_listener_is_rejected(self, _listeners, run):
        run.return_value = Mock(returncode=0, stdout="p123\nn/another/project/backend\n")
        with self.assertRaisesRegex(RuntimeError, "leaving it untouched"):
            dev_agent.owned_listeners(8010, Path("/workspace/agent/backend"))

    @patch("dev_agent.os.kill")
    @patch("dev_agent.owned_listeners")
    def test_all_ownership_is_checked_before_any_stop(self, owned, kill):
        owned.side_effect = [[123], RuntimeError("unrelated web listener")]
        with self.assertRaisesRegex(RuntimeError, "unrelated"):
            dev_agent.prepare_ports(Path("/workspace/agent"), 8010, 5174, True)
        kill.assert_not_called()

    @patch("dev_agent.os.kill")
    @patch("dev_agent.owned_listeners", return_value=[123])
    def test_stopping_requires_explicit_restart(self, _owned, kill):
        with self.assertRaisesRegex(RuntimeError, "--restart"):
            dev_agent.prepare_ports(Path("/workspace/agent"), 8010, 5174, False)
        kill.assert_not_called()

    @patch("dev_agent.listeners", return_value=[])
    @patch("dev_agent.os.kill")
    @patch("dev_agent.owned_listeners", side_effect=[[123], [456]])
    def test_restart_stops_only_verified_listeners(self, _owned, kill, _listeners):
        dev_agent.prepare_ports(Path("/workspace/agent"), 8010, 5174, True)
        self.assertEqual(kill.call_args_list, [unittest.mock.call(123, signal.SIGTERM), unittest.mock.call(456, signal.SIGTERM)])

    @patch("dev_agent.urlopen")
    def test_missing_live_chat_route_prevents_frontend_startup(self, open_url):
        open_url.return_value.__enter__.return_value = io.StringIO(json.dumps({"paths": {}}))
        with self.assertRaisesRegex(RuntimeError, "frontend startup stopped"):
            dev_agent.verify_running_api(8010)
        open_url.return_value.__enter__.return_value = io.StringIO(json.dumps({"paths": {dev_agent.CHAT_ROUTE: {}}}))
        dev_agent.verify_running_api(8010)

    def test_launcher_connects_the_proxy_and_stops_both_process_groups(self):
        api, web = Mock(pid=111), Mock(pid=222)
        api.poll.return_value = web.poll.return_value = None
        with (patch("sys.argv", ["dev_agent.py", "--restart", "--web-host", "0.0.0.0"]),
              patch("dev_agent.backend_python", return_value=Path("/shared/python")),
              patch("dev_agent.inspect_backend", return_value={"source": "this/backend/app/main.py", "chat": True, "provider_configured": True}),
              patch("dev_agent.shutil.which", return_value="/bin/tool"),
              patch("dev_agent.Path.is_dir", return_value=True),
              patch("dev_agent.prepare_ports"), patch("dev_agent.verify_running_api") as verify,
              patch("dev_agent.subprocess.Popen", side_effect=[api, web]) as popen,
              patch("dev_agent.time.sleep", side_effect=KeyboardInterrupt), patch("dev_agent.os.killpg") as killpg,
              contextlib.redirect_stdout(io.StringIO())):
            self.assertEqual(dev_agent.main(), 0)
        verify.assert_called_once_with(8010)
        self.assertEqual(popen.call_args_list[1].kwargs["env"]["API_URL"], "http://127.0.0.1:8010")
        self.assertIn("0.0.0.0", popen.call_args_list[1].args[0])
        self.assertIn("127.0.0.1", popen.call_args_list[0].args[0])
        self.assertTrue(all(call.kwargs["start_new_session"] for call in popen.call_args_list))
        self.assertEqual(killpg.call_args_list, [unittest.mock.call(222, signal.SIGTERM), unittest.mock.call(111, signal.SIGTERM)])


if __name__ == "__main__":
    unittest.main()
