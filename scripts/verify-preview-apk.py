#!/usr/bin/env python3
"""Check actual APK native libraries, not just Gradle's requested architectures."""
import argparse
import json
import struct
import sys
from zipfile import BadZipFile, ZipFile

ABIS = {'armeabi-v7a': (1, 40), 'arm64-v8a': (2, 183), 'x86': (1, 3), 'x86_64': (2, 62)}
CORE = {'libappmodules.so', 'libreactnative.so', 'libhermesvm.so', 'libexpo-modules-core.so',
        'libreact_codegen_safeareacontext.so', 'libc++_shared.so', 'libfbjni.so'}


def verify(path, requested):
    if not requested or len(set(requested)) != len(requested) or set(requested) - ABIS.keys():
        raise ValueError('Requested ABIs must be unique supported Android architectures.')
    with ZipFile(path) as archive:
        names = set(archive.namelist())
        packaged = {name.split('/')[1] for name in names if name.startswith('lib/') and name.endswith('.so')}
        if packaged != set(requested):
            raise ValueError('APK native architectures do not match the requested ABIs.')
        if 'assets/index.android.bundle' not in names:
            raise ValueError('APK is missing its bundled JavaScript; it is not self-contained.')
        for abi in requested:
            libraries = {name for name in names if name.startswith('lib/' + abi + '/') and name.endswith('.so')}
            if not CORE.issubset({name.rsplit('/', 1)[1] for name in libraries}):
                raise ValueError('APK is missing required native runtime libraries for ' + abi + '.')
            for name in libraries:
                with archive.open(name) as library:
                    header = library.read(20)
                if len(header) < 20 or header[:4] != b'\x7fELF' or header[5] != 1 or (header[4], struct.unpack_from('<H', header, 18)[0]) != ABIS[abi]:
                    raise ValueError('APK contains a native library with the wrong ELF architecture for ' + abi + '.')
    return {'abis': sorted(requested), 'bundled_javascript': True, 'native_runtime_verified': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk')
    parser.add_argument('--abis', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.apk, args.abis.split(','))))
    except (ValueError, OSError, BadZipFile) as error:
        print('APK verification failed: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
