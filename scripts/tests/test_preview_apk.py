import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('apk', Path(__file__).resolve().parents[1] / 'verify-preview-apk.py')
apk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk)


class APKArchitectures(unittest.TestCase):
    def fixture(self, path, abis, missing=None, wrong_elf=False, bundle=True):
        with ZipFile(path, 'w') as archive:
            if bundle:
                archive.writestr('assets/index.android.bundle', b'fixture')
            for abi in abis:
                header = bytearray(20)
                header[:4] = b'\x7fELF'
                header[4], machine = apk.ABIS[abi]
                header[5] = 1
                struct.pack_into('<H', header, 18, 0 if wrong_elf else machine)
                for library in apk.CORE - ({missing} if missing else set()):
                    archive.writestr('lib/' + abi + '/' + library, header)

    def test_universal_apk_has_complete_runtimes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'preview.apk'
            self.fixture(path, apk.ABIS)
            self.assertEqual(apk.verify(path, list(apk.ABIS))['abis'], sorted(apk.ABIS))

    def test_arm64_only_apk_cannot_be_reported_as_universal(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'preview.apk'
            self.fixture(path, ['arm64-v8a'])
            with self.assertRaisesRegex(ValueError, 'architectures do not match'):
                apk.verify(path, list(apk.ABIS))

    def test_library_directory_name_does_not_prove_binary_architecture(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'preview.apk'
            self.fixture(path, ['armeabi-v7a'], wrong_elf=True)
            with self.assertRaisesRegex(ValueError, 'wrong ELF architecture'):
                apk.verify(path, ['armeabi-v7a'])

    def test_incomplete_native_runtime_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'preview.apk'
            self.fixture(path, ['armeabi-v7a'], missing='libhermesvm.so')
            with self.assertRaisesRegex(ValueError, 'required native runtime'):
                apk.verify(path, ['armeabi-v7a'])

    def test_missing_offline_bundle_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'preview.apk'
            self.fixture(path, ['armeabi-v7a'], bundle=False)
            with self.assertRaisesRegex(ValueError, 'bundled JavaScript'):
                apk.verify(path, ['armeabi-v7a'])
