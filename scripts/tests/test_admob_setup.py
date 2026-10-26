import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('admob_site', Path(__file__).resolve().parents[1] / 'prepare-admob-site.py')
admob = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admob)


class AdMobSetup(unittest.TestCase):
    def setUp(self):
        self.env = {'ADMOB_PUBLISHER_ID': 'pub-1234567890123456',
                    'ADMOB_APP_ADS_TXT': 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0',
                    'ADMOB_ANDROID_APP_ID': 'ca-app-pub-1234567890123456~1234567890'}

    def test_rejects_another_publisher_and_injected_records(self):
        for record in [self.env['ADMOB_APP_ADS_TXT'].replace('1234567890123456', '9999999999999999'),
                       self.env['ADMOB_APP_ADS_TXT'] + '\nother.example, account, DIRECT, authority']:
            with self.assertRaises(ValueError):
                admob.publisher_record({**self.env, 'ADMOB_APP_ADS_TXT': record})

    def test_rejects_unit_ids_sample_accounts_and_app_owner_mismatch(self):
        for values in [{'ADMOB_ANDROID_APP_ID': self.env['ADMOB_ANDROID_APP_ID'].replace('~', '/')},
                       {'ADMOB_ANDROID_APP_ID': 'ca-app-pub-9999999999999999~1234567890'},
                       {'ADMOB_PUBLISHER_ID': 'pub-3940256099942544'}]:
            with self.assertRaises(ValueError):
                admob.publisher_record({**self.env, **values})

    def test_generated_site_contains_no_server_keys_or_paid_firebase_services(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'site'
            env = {**self.env, 'SMTP_PASSWORD': 'SECRET_NOT_FOR_PUBLICATION', 'SUPABASE_SECRET_KEY': 'SERVER_KEY_NOT_FOR_PUBLICATION'}
            admob.prepare(output, env)
            self.assertEqual((output / 'public/app-ads.txt').read_text(), self.env['ADMOB_APP_ADS_TXT'] + '\n')
            self.assertEqual(set(json.loads((output / 'firebase.json').read_text())), {'hosting'})
            for file in output.rglob('*'):
                if file.is_file():
                    self.assertNotIn(env['SMTP_PASSWORD'], file.read_text())
                    self.assertNotIn(env['SUPABASE_SECRET_KEY'], file.read_text())
            self.assertNotIn('<script', (output / 'public/index.html').read_text())
            with self.assertRaises(FileExistsError):
                admob.prepare(output, env)

    def test_rejects_unsafe_site_origin_before_writing_files(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'site'
            for origin in ['javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/path']:
                with self.assertRaises(ValueError):
                    admob.prepare(output, {**self.env, 'PUBLIC_WEB_URL': origin})
                self.assertFalse(output.exists())
