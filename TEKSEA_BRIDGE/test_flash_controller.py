import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

from flash_controller import FlashController, WindowsJob


@unittest.skipUnless(os.name == 'nt', 'Valida os Job Objects reais do Windows')
class FlashTests(unittest.TestCase):
    def wait_done(self, controller, seconds=12):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            result = controller.snapshot()
            if result['state'] in ('succeeded', 'failed', 'cancelled', 'timed_out'):
                return result
            time.sleep(0.05)
        self.fail(f'Supervisor não terminou: {controller.snapshot()}')

    def start_script(self, controller, script, operation='test', timeout=4):
        return controller.start(operation, [sys.executable, '-u', '-c', script], timeout)

    def test_success_and_duplicate_id(self):
        controller = FlashController()
        self.start_script(controller, "print('Verified')")
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'succeeded')
        self.assertFalse(result['busy'])
        self.assertIn('Verified', result['log'])
        repeated, code = self.start_script(controller, 'raise RuntimeError()')
        self.assertEqual(code, 200)
        self.assertEqual(result, repeated)

    def test_error_exit_retains_log_and_allows_retry(self):
        controller = FlashController()
        self.start_script(controller, "print('falha simulada'); raise SystemExit(7)")
        result = self.wait_done(controller)
        self.assertEqual(result['exit_code'], 7)
        self.assertEqual(result['state'], 'failed')
        self.assertIn('falha simulada', result['log'])
        self.assertTrue(result['cleanup_confirmed'])
        self.assertEqual(self.start_script(controller, 'print(1)', 'retry')[1], 202)
        self.assertEqual(self.wait_done(controller)['state'], 'succeeded')

    def test_silent_process_times_out(self):
        controller = FlashController()
        self.start_script(controller, 'import time; time.sleep(60)', timeout=1)
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'timed_out')
        self.assertTrue(result['cleanup_confirmed'])

    def test_cancel_and_concurrency(self):
        controller = FlashController()
        self.start_script(controller, 'import time; time.sleep(60)', timeout=10)
        self.assertEqual(self.start_script(controller, 'print(2)', 'other')[1], 409)
        self.assertEqual(controller.cancel('wrong')[1], 409)
        controller.cancel('test')
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'cancelled')
        self.assertFalse(result['busy'])

    def test_child_surviving_parent_is_terminated(self):
        controller = FlashController()
        self.start_script(controller,
            "import subprocess,sys; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); print('child',p.pid)")
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'succeeded')
        self.assertTrue(result['cleanup_confirmed'])
        # A consulta real do Job confirmou zero processos, não só término do pai.
        self.assertTrue(any(line.startswith('child ') for line in result['log']))

    def test_creation_failure_is_terminal(self):
        def fail(*args, **kwargs):
            raise OSError('Falha simulada no Popen')
        controller = FlashController(process_factory=fail)
        self.start_script(controller, 'print(1)')
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'failed')
        self.assertFalse(result['busy'])

    def test_cleanup_failure_blocks_new_operation(self):
        class FailedQueryJob(WindowsJob):
            def active_count(self):
                raise OSError('Falha simulada na verificação de limpeza')
        controller = FlashController(job_factory=FailedQueryJob)
        self.start_script(controller, 'print(1)')
        result = self.wait_done(controller)
        self.assertEqual(result['state'], 'failed')
        self.assertTrue(result['busy'])
        self.assertFalse(result['cleanup_confirmed'])
        self.assertEqual(self.start_script(controller, 'print(2)', 'other')[1], 409)


if __name__ == '__main__':
    unittest.main()
