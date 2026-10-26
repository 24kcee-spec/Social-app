#!/usr/bin/env python3
"""Read-only HTTPS deployment smoke checks. No credentials or user fixtures needed."""
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='https://social-platform-web-two.vercel.app')
    args = parser.parse_args()
    parsed = urllib.parse.urlsplit(args.url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise SystemExit('Deployment URL must be an HTTPS origin')
    base = args.url.rstrip('/')
    results = []
    for path in ['/', '/api/sidle/ready', '/api/sidle/me']:
        passed = False
        started = time.monotonic()
        for _ in range(3):
            try:
                with urllib.request.urlopen(base + path, timeout=55) as response:
                    body = response.read(2_000_000)
                    if path == '/':
                        passed = response.status == 200 and b'Sidle' in body and response.headers.get('X-Content-Type-Options') == 'nosniff'
                    elif path.endswith('/ready'):
                        status = json.loads(body)
                        passed = response.status == 200 and status.get('status') == 'ready' and all(status.get('checks', {}).get(key) == 'ok' for key in ['configuration','database','schema'])
            except urllib.error.HTTPError as error:
                passed = path.endswith('/me') and error.code == 401
            except Exception:
                pass
            if passed: break
        results.append({'path': path, 'passed': passed, 'seconds': round(time.monotonic()-started, 1)})
    print(json.dumps({'deployment': base, 'checks': results}, indent=2))
    return 0 if all(item['passed'] for item in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
