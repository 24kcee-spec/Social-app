#!/usr/bin/env python3
"""Prepare a static developer site for Firebase Hosting Spark. Never deploys or enables ads."""
import argparse
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


def publisher_record(env):
    publisher = env.get('ADMOB_PUBLISHER_ID', '').strip()
    if not re.fullmatch(r'pub-[0-9]{16}', publisher) or publisher == 'pub-3940256099942544':
        raise ValueError('ADMOB_PUBLISHER_ID must be your own pub- followed by 16 digits.')
    record = env.get('ADMOB_APP_ADS_TXT', '').strip()
    fields = [field.strip() for field in record.split(',')]
    if re.search(r'[\x00-\x1f\x7f]', record) or fields != ['google.com', publisher, 'DIRECT', 'f08c47fec0942fa0']:
        raise ValueError('ADMOB_APP_ADS_TXT must be the single Google DIRECT record for this publisher.')
    app_id = env.get('ADMOB_ANDROID_APP_ID', '').strip()
    if app_id and not re.fullmatch(r'ca-app-' + re.escape(publisher) + r'~[0-9]{10}', app_id):
        raise ValueError('ADMOB_ANDROID_APP_ID must belong to the same publisher, and use ~ rather than /.')
    return ', '.join(fields) + '\n'


def prepare(output, env):
    record = publisher_record(env)
    web = env.get('PUBLIC_WEB_URL', 'https://social-platform-web-two.vercel.app').rstrip('/')
    parsed = urlsplit(web)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
        raise ValueError('PUBLIC_WEB_URL must be an HTTPS origin without credentials or a path.')
    # A new directory avoids overwriting an existing Firebase project or operator files.
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    public = output / 'public'
    public.mkdir()
    (public / 'app-ads.txt').write_text(record, encoding='utf-8')
    safe_web = html.escape(web, quote=True)
    (public / 'index.html').write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sidle — low-pressure connection</title>
<style>body{font:18px/1.6 system-ui,sans-serif;background:#f7f6f2;color:#1d2925;max-width:680px;margin:12vh auto;padding:24px}h1{font-size:3rem;margin-bottom:0}a{color:#145743}nav{display:flex;gap:24px;flex-wrap:wrap}</style>
<main><h1>Sidle</h1><p>Low-pressure connection. Profiles, communities and conversations at your pace.</p>
<nav aria-label="Sidle links"><a href="''' + safe_web + '''/">Open Sidle</a><a href="''' + safe_web + '''/privacy">Privacy overview</a></nav>
</main></html>\n''', encoding='utf-8')
    config = {'hosting': {'public': 'public', 'ignore': ['firebase.json', '**/.*', '**/node_modules/**'],
                          'headers': [{'source': '**', 'headers': [
                              {'key': 'X-Content-Type-Options', 'value': 'nosniff'},
                              {'key': 'Referrer-Policy', 'value': 'no-referrer'},
                              {'key': 'Content-Security-Policy', 'value': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}]},
                              {'source': '/app-ads.txt', 'headers': [{'key': 'Content-Type', 'value': 'text/plain; charset=utf-8'}, {'key': 'Cache-Control', 'value': 'public, max-age=300'}]}]}}
    (output / 'firebase.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='A new directory outside the repository')
    args = parser.parse_args()
    try:
        prepare(args.output, os.environ)
    except (ValueError, OSError) as error:
        # Provider values and environment contents are never included in errors.
        print('Preparation failed: ' + (str(error) if isinstance(error, ValueError) else 'output must be a new writable directory'), file=sys.stderr)
        return 1
    print('Prepared static developer site and matching app-ads.txt. No deployment, billing or live ads enabled.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
