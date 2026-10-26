#!/usr/bin/env python3
"""Inspect/apply the additive Supabase product RPC migrations over authenticated HTTPS.

The portable API's schema_migrations ledger is intentionally untouched.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sidle_maintenance', ROOT / 'scripts/supabase-maintenance.py')
maintenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maintenance)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply reviewed pending Supabase-only migrations')
    parser.add_argument('--verify', action='store_true', help='Execute rollback-only product/RLS probes')
    args = parser.parse_args()
    try:
        client = maintenance.Supabase()
        files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
        if not files or any(not re.fullmatch(r'[0-9]{12}_[a-z0-9_]+\.sql', f.name) for f in files):
            raise RuntimeError('Invalid Supabase product migration filenames')
        exists = client.sql("select to_regclass('app_private.product_migrations') is not null as installed")[0]['installed']
        applied = client.sql('select name,sha256 from app_private.product_migrations order by name') if exists else []
        names = [f.name for f in files]
        if [r['name'] for r in applied] != names[:len(applied)]:
            raise RuntimeError('Product migration ledger is not a prefix of this checkout')
        for file, record in zip(files, applied):
            if hashlib.sha256(file.read_bytes()).hexdigest() != record['sha256']:
                raise RuntimeError('An applied product migration was edited; add a new migration instead')
        pending = files[len(applied):]
        if args.apply:
            for file in pending:
                digest = hashlib.sha256(file.read_bytes()).hexdigest()
                # The lock plus in-transaction ledger check rejects concurrent/uncertain retries.
                query = """begin; set local lock_timeout='5s'; set local statement_timeout='40s';
select pg_advisory_xact_lock(hashtext('sidle_product_migrations'));
create schema if not exists app_private;
create table if not exists app_private.product_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());
alter table app_private.product_migrations enable row level security;
revoke all on app_private.product_migrations from public,anon,authenticated;
""" + file.read_text() + f"\ninsert into app_private.product_migrations(name,sha256) values('{file.name}','{digest}'); commit;"
                client.sql(query, False)
                rows = client.sql('select sha256 from app_private.product_migrations where name=$$' + file.name + '$$')
                if not rows or rows[0]['sha256'] != digest:
                    raise RuntimeError('Migration persistence could not be verified; inspect before retrying')
                print('Applied and verified:', file.name)
            pending = []
        if args.verify:
            if pending:
                raise RuntimeError('Apply the reviewed product migration before live verification')
            for probe in ['verify-supabase-product.sql','verify-supabase-platform.sql','verify-supabase-commerce.sql','verify-supabase-media.sql','verify-supabase-chat.sql']:
                result=client.sql((ROOT/'scripts'/probe).read_text(),False)
                if not result or not str(result[0].get('result','')).startswith('PASS:'):
                    raise RuntimeError('Product probes did not return a verified result: '+probe)
                print(result[0]['result'])
        print(json.dumps({'project': client.project, 'product_migrations': len(files)-len(pending), 'pending': [f.name for f in pending]}, indent=2))
        if pending:
            return 1
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
