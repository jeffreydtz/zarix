// Real two-connection PostgreSQL for advisory-lock races. Not PGlite.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { platformSql, bootstrapSources, ids, seedDatabase } from './test-isolated-database.mjs';

function pgBinDir() {
  const env = process.env.ZARIX_PG_BIN;
  if (env) return env;
  const candidates = ['16', '17', '15', '18'].map((v) => `/usr/lib/postgresql/${v}/bin`);
  return candidates.find((dir) => existsSync(path.join(dir, 'initdb'))) || '';
}

function bin(dir, name) {
  return dir ? path.join(dir, name) : name;
}

export function postgresServerAvailable() {
  return Boolean(pgBinDir());
}

export async function withTwoSessionPostgres(work) {
  const dir = pgBinDir();
  if (!dir) {
    throw new Error('PostgreSQL server binaries required (install postgresql and postgresql-contrib).');
  }
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zarix-pg-'));
  const sockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zarix-pg-sock-'));
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH || ''}`,
    PGDATA: dataDir,
    PGHOST: sockDir,
    PGPORT: '55432',
    PGUSER: 'postgres',
    PGDATABASE: 'zarix',
    TZ: 'UTC',
    PGTZ: 'UTC',
  };
  const run = (name, args, extra = {}) => {
    const result = spawnSync(bin(dir, name), args, {
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      ...extra,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(`${name} failed: ${result.stderr || result.stdout}`);
      error.code = `EXIT_${result.status}`;
      throw error;
    }
    return result.stdout;
  };
  run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust', '--no-sync', '--locale=C']);
  await fs.appendFile(
    path.join(dataDir, 'postgresql.conf'),
    `\nlisten_addresses = ''\nunix_socket_directories = '${sockDir}'\nport = 55432\ntimezone = 'UTC'\nmax_connections = 20\n`
  );
  run('pg_ctl', ['-D', dataDir, '-l', path.join(dataDir, 'pg.log'), '-w', 'start']);
  try {
    run('createdb', ['-h', sockDir, '-p', '55432', '-U', 'postgres', 'zarix']);
    const sqlFile = path.join(dataDir, 'bootstrap.sql');
    const sources = await bootstrapSources();
    await fs.writeFile(sqlFile, `${platformSql}\n${sources.map((file) => file.sql).join('\n')}\n`);
    try {
      run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', sqlFile]);
    } catch (error) {
      const log = await fs.readFile(path.join(dataDir, 'pg.log'), 'utf8').catch(() => '');
      error.message = `${error.message}\n--- pg.log ---\n${log.slice(-4000)}`;
      throw error;
    }
    const query = (statement, database = 'zarix') =>
      run('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c', statement]).trim();
    const parallelSql = (statement) =>
      new Promise((resolve) => {
        const child = spawn(
          bin(dir, 'psql'),
          ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement],
          { env }
        );
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', (error) => resolve({ status: -1, stdout, stderr: error.message }));
        child.on('close', (status) => resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() }));
      });
    const db = {
      query: async (sql, params = []) => {
        if (params.length) {
          throw new Error('two-session helper uses interpolated SQL only');
        }
        const text = query(sql);
        return { rows: text ? text.split('\n').map((line) => ({ value: line })) : [] };
      },
    };
    await seedDatabase({
      query: async (sql, params = []) => {
        let encoded = sql;
        for (let index = params.length; index >= 1; index -= 1) {
          const value = params[index - 1];
          const lit =
            value === null
              ? 'NULL'
              : `'${String(value).replaceAll("'", "''")}'`;
          encoded = encoded.replaceAll(`$${index}`, lit);
        }
        query(encoded);
        return { rows: [] };
      },
    });
    return await work({ env, query, parallelSql, ids, sockDir });
  } finally {
    spawnSync(bin(dir, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'], { env, encoding: 'utf8' });
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(sockDir, { recursive: true, force: true });
  }
}
