#!/usr/bin/env python3
"""Opt-in SQL-only nominal recovery; URLs, Auth rows and dumps stay private."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from urllib.parse import unquote, urlparse
import uuid

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
PRIVATE = Path('/tmp/zarix-runtime-20261015/cnf12-private')
TARGETS = PRIVATE / 'targets.json'
PURPOSE = 'cnf12-nominal-two-database-recovery'
REPORT = HERE / 'verification.json'
STAMP = '2026-10-05T13:00:00Z'

def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def assert_private(path):
    info = path.stat()
    assert stat.S_ISREG(info.st_mode) and info.st_mode & 0o077 == 0, 'Private input must be a regular0600 file'

def connection(url, expected):
    u = urlparse(url)
    name = unquote(u.path[1:])
    assert u.scheme in ('postgres', 'postgresql') and u.hostname == '127.0.0.1' and u.port == 55322
    assert not u.query and not u.fragment and name == expected
    assert re.fullmatch(r'cnf12_[a-z]+_[0-9a-f]{32}', name), 'New exact UUID database only'
    clean = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    return {**clean, 'PGHOST': '127.0.0.1', 'PGHOSTADDR': '127.0.0.1', 'PGPORT': '55322',
            'PGDATABASE': name, 'PGUSER': unquote(u.username or ''), 'PGPASSWORD': unquote(u.password or ''),
            'PGCONNECT_TIMEOUT': '10', 'PGAPPNAME': 'zarix-cnf12-nominal',
            'PGOPTIONS': '-c statement_timeout=45000 -c lock_timeout=5000'}

def command(name, args, env, timeout=60):
    result = subprocess.run([str(BIN / name), *args], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        location = PRIVATE / ('error-' + uuid.uuid4().hex + '.log')
        location.write_bytes(result.stderr)
        location.chmod(0o600)
        raise RuntimeError(name + ' failed; private diagnostic retained')
    return result.stdout.decode().strip()

def sql(statement, env):
    return command('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], env)

def query(statement, env):
    return json.loads(sql(statement, env))

def tables(env):
    names = query("SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','auth','storage')", env) or []
    data = {}
    for row in names:
        schema, table = row['schema'], row['table']
        assert re.fullmatch(r'[A-Za-z0-9_]+', schema) and re.fullmatch(r'[A-Za-z0-9_]+', table)
        data[schema + '.' + table] = query(f'''SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex')) FROM "{schema}"."{table}" t''', env)
    return data

CATALOG = """SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl) ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname IN ('public','auth','storage','extensions')),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'enums',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'type',t.typname,'order',e.enumsortorder,'label',e.enumlabel) ORDER BY n.nspname,t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','storage')),
 'views',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('v','m')),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.schemaname,s.sequencename) FROM pg_sequences s WHERE s.schemaname IN ('public','auth','storage')),
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl,'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','v','S','m')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind<>'a'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname IN ('public','auth','storage')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname IN ('public','auth','storage')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY n.nspname,r.relname,c.conname) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','auth','storage')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,r.relname,t.tgname) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal),
 'defaultPrivileges',(SELECT jsonb_agg(jsonb_build_object('role',d.defaclrole::regrole::text,'schema',d.defaclnamespace::regnamespace::text,'kind',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole::regrole::text,d.defaclnamespace::regnamespace::text,d.defaclobjtype) FROM pg_default_acl d)
)"""

def catalog(env):
    data = query(CATALOG, env)
    for rows in data.values():
        for row in rows or []:
            for field in ['acl', 'options']:
                if isinstance(row.get(field), list):
                    row[field].sort()
    return data

def save():
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

def check(name, actual, expected):
    passed = actual == expected
    report['assertions'].append({'name': name, 'actual': actual, 'expected': expected, 'status': 'PASS' if passed else 'FAIL'})
    save()
    assert passed, name

def owner_sql(statement, owner, env, rollback=False):
    # SQL claims exercise actual RLS roles; this is deliberately not an HTTP/JWT session.
    claims = json.dumps({'sub': owner, 'role': 'authenticated'})
    return sql("BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub'," + literal(owner) + ",true); SELECT set_config('request.jwt.claims'," + literal(claims) + ",true); " + statement + ('; ROLLBACK' if rollback else '; COMMIT'), env)

