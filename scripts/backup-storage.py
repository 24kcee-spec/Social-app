#!/usr/bin/env python3
"""Encrypt Sidle Storage bytes and a checksum manifest directly to an age archive.

Uses the saved service credential. Never writes plaintext media to disk. The
operator must copy the resulting encrypted archive/checksum offsite separately.
"""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request

BUCKETS = ('profile-media', 'sidle-social-media')
MAX_OBJECT_BYTES = 64 * 1024 * 1024


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise ValueError('Unsafe object path')
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ('', '.', '..') for part in value.split('/')):
        raise ValueError('Unsafe object path')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def main():
    os.umask(0o077)
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    if not re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co', url):
        raise ValueError('SUPABASE_URL must identify the intended project')
    key = os.environ.get('SUPABASE_SECRET_KEY')
    recipient = os.environ.get('BACKUP_AGE_RECIPIENT', '')
    directory = os.environ.get('BACKUP_DIRECTORY')
    if not key or not directory or not re.fullmatch(r'age1[0-9a-z]+', recipient) or not shutil.which('age'):
        raise ValueError('Configure the service binding, age recipient, private backup directory and age binary')
    opener = urllib.request.build_opener(NoRedirect())

    def request(path, body=None):
        return opener.open(urllib.request.Request(url + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}), timeout=55)

    def objects(bucket, prefix='', depth=0):
        if depth > 20: raise ValueError('Object nesting exceeds backup limit')
        offset = 0
        while True:
            with request('/storage/v1/object/list/' + bucket, {'prefix': prefix, 'limit': 1000, 'offset': offset, 'sortBy': {'column': 'name', 'order': 'asc'}}) as response:
                rows = json.load(response)
            if not isinstance(rows, list): raise ValueError('Invalid Storage listing')
            for row in rows:
                path = safe_path((prefix + '/' if prefix else '') + row['name'])
                if row.get('id') is None: yield from objects(bucket, path, depth+1)
                else: yield path
            if len(rows) < 1000: return
            offset += len(rows)

    destination = Path(directory); destination.mkdir(parents=True, exist_ok=True)
    target = destination / ('sidle-storage-' + str(time.time_ns()) + '.tar.age')
    temporary = target.with_suffix('.partial')
    process = subprocess.Popen(['age', '-r', recipient, '-o', str(temporary)], stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    manifest = {'version': 1, 'project': urllib.parse.urlsplit(url).hostname.split('.')[0], 'created_at': time.time(), 'objects': []}
    try:
        with tarfile.open(fileobj=process.stdin, mode='w|') as archive:
            for bucket in BUCKETS:
                for path in objects(bucket):
                    with request('/storage/v1/object/authenticated/' + bucket + '/' + urllib.parse.quote(path, safe='/')) as response:
                        content = response.read(MAX_OBJECT_BYTES + 1)
                        mime = response.headers.get('Content-Type', 'application/octet-stream')
                    if len(content) > MAX_OBJECT_BYTES: raise ValueError('An object exceeds the bounded backup size')
                    name = bucket + '/' + path
                    info = tarfile.TarInfo(name); info.size = len(content); info.mode = 0o600
                    archive.addfile(info, io.BytesIO(content))
                    manifest['objects'].append({'path': name, 'size': len(content), 'sha256': hashlib.sha256(content).hexdigest(), 'content_type': mime})
            content = json.dumps(manifest).encode()
            info = tarfile.TarInfo('manifest.json'); info.size = len(content); info.mode = 0o600
            archive.addfile(info, io.BytesIO(content))
        process.stdin.close()
        if process.wait(timeout=30) != 0: raise ValueError('Archive encryption failed')
        temporary.replace(target)
        digest = hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()
        target.with_name(target.name + '.sha256').write_text(digest + '  ' + target.name + '\n')
        print(json.dumps({'archive': str(target), 'encrypted_objects': len(manifest['objects']), 'offsite_copy_verified': False}))
    finally:
        if process.poll() is None: process.kill(); process.wait()
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try: main()
    except Exception:
        print('Storage backup did not complete. Check secure bindings, operator tooling and provider access. Provider responses withheld.', file=sys.stderr)
        sys.exit(1)
