import duckdb from 'duckdb';
import fs from 'node:fs';
import path from 'node:path';

/** DuckDB read_json rejects lone UTF-16 surrogates found in some post texts. */
function scrubString(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      } else {
        out += '\uFFFD';
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out += '\uFFFD';
    } else {
      out += s[i];
    }
  }
  return out;
}

function scrub(value) {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = scrub(v);
    return o;
  }
  return value;
}

function jsonSafe(value) {
  return JSON.stringify(scrub(value));
}

/**
 * @param {string} sql
 * @param {InstanceType<typeof duckdb.Database>} db
 */
function runSql(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * @param {string} sql
 * @param {InstanceType<typeof duckdb.Database>} db
 */
function allSql(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/**
 * DuckDB analysis store — rebuild from normalized JSON (ADR-002).
 *
 * @param {string} dbPath
 * @returns {import('../ports/index.mjs').AnalysisStorePort}
 */
export function createDuckdbAnalysisStore(dbPath) {
  return {
    async rebuild({ accounts, chains, posts, metricsPath, retention }) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

      const staging = path.join(path.dirname(dbPath), '.duckdb-staging');
      fs.mkdirSync(staging, { recursive: true });
      const accountsFile = path.join(staging, 'accounts.json');
      const chainsFile = path.join(staging, 'chains.json');
      const postsFile = path.join(staging, 'posts.json');
      const retentionFile = path.join(staging, 'retention.json');
      fs.writeFileSync(accountsFile, jsonSafe(accounts));
      fs.writeFileSync(chainsFile, jsonSafe(chains));
      fs.writeFileSync(postsFile, jsonSafe(posts));
      fs.writeFileSync(retentionFile, jsonSafe(retention));

      const metricsFile = path.join(staging, 'metrics.jsonl');
      if (fs.existsSync(metricsPath)) {
        const lines = fs
          .readFileSync(metricsPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => {
            try {
              return jsonSafe(JSON.parse(l));
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        fs.writeFileSync(metricsFile, lines.join('\n') + '\n');
      } else {
        fs.writeFileSync(metricsFile, '');
      }

      const db = new duckdb.Database(dbPath);
      try {
        const esc = (p) => p.replaceAll('\\', '/').replaceAll("'", "''");
        await runSql(
          db,
          `
          CREATE TABLE accounts AS
            SELECT * FROM read_json_auto('${esc(accountsFile)}');
          CREATE TABLE chains AS
            SELECT * FROM read_json_auto('${esc(chainsFile)}');
          CREATE TABLE posts AS
            SELECT * FROM read_json_auto('${esc(postsFile)}');
          CREATE TABLE retention AS
            SELECT * FROM read_json_auto('${esc(retentionFile)}');
          CREATE TABLE metrics AS
            SELECT * FROM read_json_auto('${esc(metricsFile)}', format='newline_delimited');
        `,
        );
      } finally {
        await new Promise((resolve) => db.close(resolve));
      }

      fs.rmSync(staging, { recursive: true, force: true });
      console.log(`DuckDB 스토어 재생성: ${dbPath}`);
    },

    async stats() {
      if (!fs.existsSync(dbPath)) {
        return { accountCount: 0, chainCount: 0, multiObservationPosts: 0 };
      }
      const db = new duckdb.Database(dbPath, { access_mode: 'READ_ONLY' });
      try {
        const [a] = await allSql(db, `SELECT COUNT(*)::INTEGER AS n FROM accounts WHERE coalesce(status, 'active') = 'active'`);
        const [c] = await allSql(db, `SELECT COUNT(*)::INTEGER AS n FROM chains`);
        const [m] = await allSql(
          db,
          `SELECT COUNT(*)::INTEGER AS n FROM (
             SELECT code FROM metrics GROUP BY code HAVING COUNT(DISTINCT observed_at) > 1
           )`,
        );
        return {
          accountCount: a?.n ?? 0,
          chainCount: c?.n ?? 0,
          multiObservationPosts: m?.n ?? 0,
        };
      } finally {
        await new Promise((resolve) => db.close(resolve));
      }
    },
  };
}
