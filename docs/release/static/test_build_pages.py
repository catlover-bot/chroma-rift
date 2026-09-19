"""Exercise the actual generator without editing content or approval inputs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BUILDER = Path(__file__).with_name('build-pages.py')
CONFIG = Path(__file__).with_name('public-fields.json')


class OutputBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / 'site'
        self.config = self.root / 'unapproved-fields.json'
        values = json.loads(CONFIG.read_text())
        values.update(operatorName=None, contactUrl=None,
                      publicInformationApproved=False, productionPrivacyReviewConfirmed=False)
        self.config.write_text(json.dumps(values))

    def run_builder(self, *extra, draft=True):
        return subprocess.run([sys.executable, str(BUILDER), '--config', str(self.config),
                               '--output', str(self.output), *(['--draft'] if draft else []),
                               *map(str, extra)], capture_output=True, text=True, check=False)

    def approve_page_fixture(self, **overrides):
        # Isolated unit-test data; never written to the real owner configuration.
        values = dict(operatorName='テスト運営者', copyrightHolder=None,
                      effectiveDate='2026-09-20', contactLabel='テスト問い合わせ先',
                      contactUrl='mailto:fixture@icloud.com',
                      privacyUrl='https://pages.github.io/fixture/privacy.html',
                      supportUrl='https://pages.github.io/fixture/support.html',
                      externalDataHandling='最終製品の確認は完了していません。',
                      hostingDataHandling='ホスティングについての承認済み本文。',
                      supportDataHandling='問い合わせについての承認済み本文。',
                      publicInformationApproved=True, productionPrivacyReviewConfirmed=False)
        values.update(overrides)
        self.config.write_text(json.dumps(values))
        return values

    def test_draft_contains_only_three_public_files_and_external_record(self):
        before = CONFIG.read_bytes()
        result = self.run_builder()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(p.name for p in self.output.iterdir()),
                         ['privacy.html', 'site.css', 'support.html'])
        record = json.loads((self.root / 'site.local-build.json').read_text())
        self.assertTrue(record['draft'])
        self.assertFalse(record['deployed'])
        for name, expected in record['files'].items():
            self.assertEqual(hashlib.sha256((self.output / name).read_bytes()).hexdigest(), expected)
        for name in ('privacy.html', 'support.html'):
            content = (self.output / name).read_text()
            self.assertIn('noindex,nofollow', content)
            self.assertIn('公開前の下書き', content)
            self.assertIn('未確定', content)
            self.assertNotIn('<script', content)
        self.assertEqual(CONFIG.read_bytes(), before)

    def test_old_page_or_extra_script_refuses_all_generation_and_preserves_bytes(self):
        for name in ('support.html', 'unexpected.js'):
            with self.subTest(name=name):
                self.output.mkdir(exist_ok=True)
                existing = self.output / name
                existing.write_bytes(b'pre-existing bytes')
                result = self.run_builder()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('new or empty', result.stderr)
                self.assertEqual(list(self.output.iterdir()), [existing])
                self.assertEqual(existing.read_bytes(), b'pre-existing bytes')
                self.assertFalse((self.root / 'site.local-build.json').exists())
                existing.unlink()

    def test_manifest_inside_public_output_is_rejected(self):
        result = self.run_builder('--manifest', self.output / 'local-build.json')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('outside', result.stderr)
        self.assertFalse(self.output.exists())

    def test_existing_private_manifest_is_not_overwritten(self):
        manifest = self.root / 'site.local-build.json'
        manifest.write_bytes(b'old reviewed record')
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('already exists', result.stderr)
        self.assertEqual(manifest.read_bytes(), b'old reviewed record')
        self.assertFalse(self.output.exists())

    def test_symlink_output_is_not_followed(self):
        actual = self.root / 'actual'
        actual.mkdir()
        self.output.symlink_to(actual, target_is_directory=True)
        result = self.run_builder()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.output.is_symlink())
        self.assertEqual(list(actual.iterdir()), [])

    def test_unapproved_public_build_stays_blocked_before_any_output(self):
        self.approve_page_fixture(publicInformationApproved=False)
        result = self.run_builder(draft=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Publication is pending', result.stderr)
        self.assertIn('publicInformationApproved', result.stderr)
        self.assertFalse(self.output.exists())
        self.assertFalse((self.root / 'site.local-build.json').exists())

    def test_approved_pages_build_without_claiming_production_review_or_copyright(self):
        before = CONFIG.read_bytes()
        values = self.approve_page_fixture()
        result = self.run_builder(draft=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(p.name for p in self.output.iterdir()),
                         ['privacy.html', 'site.css', 'support.html'])
        record = json.loads((self.root / 'site.local-build.json').read_text())
        self.assertTrue(record['publicInformationApproved'])
        self.assertFalse(record['productionPrivacyReviewConfirmed'])
        self.assertFalse(record['draft'])
        self.assertFalse(record['deployed'])
        self.assertFalse(record['publicReachabilityVerified'])
        for name in ('privacy.html', 'support.html'):
            content = (self.output / name).read_text()
            self.assertIn('運営者：テスト運営者', content)
            self.assertNotIn('著作権者', content)
            self.assertNotIn('noindex', content)
            self.assertNotIn('公開前の下書き', content)
            self.assertNotIn('未確定', content)
            self.assertNotIn('{{', content)
            self.assertIn('href="' + values['contactUrl'] + '"', content)
            self.assertIn('href="' + values['privacyUrl'] + '"', content)
            self.assertIn('href="' + values['supportUrl'] + '"', content)
        self.assertEqual(CONFIG.read_bytes(), before)
        self.assertFalse(json.loads(self.config.read_text())['productionPrivacyReviewConfirmed'])

    def test_explicit_optional_copyright_is_escaped_and_displayed(self):
        self.approve_page_fixture(copyrightHolder='権利者 <script> & 関係者')
        result = self.run_builder(draft=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in ('privacy.html', 'support.html'):
            content = (self.output / name).read_text()
            self.assertIn('著作権者：権利者 &lt;script&gt; &amp; 関係者', content)
            self.assertNotIn('<script>', content)


if __name__ == '__main__':
    unittest.main()
