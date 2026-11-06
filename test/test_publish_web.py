import os
from pathlib import Path
import subprocess
import tempfile
import unittest


@unittest.skipUnless(os.name == 'nt', 'Script PowerShell do Windows')
class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='calibrador-publish-test-')
        self.root = Path(self.temp.name)
        self.script = Path(__file__).resolve().parents[1] / 'prepare_web_data.ps1'
        (self.root / 'data').mkdir()
        (self.root / 'data/index.html').write_text('versao anterior', encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def make_build(self):
        (self.root / 'WEB/dist/assets').mkdir(parents=True)
        (self.root / 'WEB/dist/index.html').write_text('<script src="/assets/app.js"></script>', encoding='utf-8')
        (self.root / 'WEB/dist/assets/app.js').write_text('console.log(42)', encoding='utf-8')

    def run_script(self, extra='', prefix=''):
        command = prefix + "& '" + str(self.script).replace("'", "''") + "' -ProjectRoot '" + str(self.root).replace("'", "''") + "' " + extra
        return subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
                              capture_output=True, text=True, timeout=20)

    def assert_previous_preserved(self):
        self.assertEqual((self.root / 'data/index.html').read_text(encoding='utf-8'), 'versao anterior')

    def test_missing_build_preserves_data(self):
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assert_previous_preserved()

    def test_missing_asset_preserves_data(self):
        self.make_build()
        (self.root / 'WEB/dist/assets/app.js').unlink()
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assert_previous_preserved()

    def test_copy_failure_preserves_data(self):
        self.make_build()
        result = self.run_script(prefix="function Copy-Item { throw 'falha de copia simulada' }; ")
        self.assertNotEqual(result.returncode, 0)
        self.assert_previous_preserved()

    def test_failed_swap_restores_backup(self):
        self.make_build()
        prefix = "function Move-Item { param($LiteralPath,$Destination,$ErrorAction); if ($LiteralPath -like '*.data-staging-*') { throw 'falha de troca simulada' }; Microsoft.PowerShell.Management\\Move-Item -LiteralPath $LiteralPath -Destination $Destination -ErrorAction Stop }; "
        self.assertNotEqual(self.run_script(prefix=prefix).returncode, 0)
        self.assert_previous_preserved()

    def test_success_keeps_previous_version(self):
        self.make_build()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.root / 'data/assets/app.js').is_file())
        backups = list(self.root.glob('.data-backup-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'index.html').read_text(encoding='utf-8'), 'versao anterior')

    def test_filesystem_only_does_not_require_build(self):
        result = self.run_script('-UseExistingData')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_previous_preserved()
        self.assertEqual(list(self.root.glob('.data-*')), [])


if __name__ == '__main__':
    unittest.main()
