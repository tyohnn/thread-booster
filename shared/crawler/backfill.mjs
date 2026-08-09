/**
 * 누락 훅 시드 생성기.
 *
 * 두 종류의 '아직 안 받은 훅' 을 찾아 계정별 시드 파일로 떨군다.
 *
 *  (1) 관련 글로 딸려왔을 뿐인 글 — 다른 훅의 퍼머링크 페이지에 실려 posts.json 에는
 *      있지만, 정작 자기 퍼머링크는 열린 적이 없어 체인도 조회수도 없다.
 *  (2) 피드 하베스트로 존재만 확인한 훅 — feed_*.jsonl 에는 있으나 아직 fetch 안 됐다.
 *
 * 사용: node backfill.mjs                    # 계정별 시드 파일 생성
 *       node backfill.mjs --handle beyond.cho
 */
import fs from 'node:fs';
import { loadAccounts, loadFetchedCodes, loadSeenCodes } from './state.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const ONLY = arg('handle');

const fetched = loadFetchedCodes();
const seen = loadSeenCodes();
const handles = new Set(loadAccounts().map((a) => a.handle));

const missing = new Map(); // handle -> Set(code)
const add = (h, c) => {
  if (!handles.has(h)) return;
  if (ONLY && h !== ONLY) return;
  if (fetched.has(c)) return;
  if (!missing.has(h)) missing.set(h, new Set());
  missing.get(h).add(c);
};

// (1) posts.json 의 체인 미소속 독립 글
const pf = '../../data_export/normalized/posts.json';
if (fs.existsSync(pf)) {
  for (const p of JSON.parse(fs.readFileSync(pf, 'utf8'))) {
    if (p.is_reply || p.chain_id) continue;
    add(p.author, p.code);
  }
}

// (2) 피드에서 본 훅
for (const [code, p] of seen) {
  if (p.is_reply) continue;
  add(p.author, code);
}

if (!missing.size) {
  console.log('누락된 훅이 없습니다.');
  process.exit(0);
}

console.log(`퍼머링크 수집 완료 ${fetched.size.toLocaleString()}건 기준\n`);
for (const [handle, codes] of missing) {
  const file = `seeds_backfill_${handle.replace(/[^a-z0-9_]/gi, '_')}.txt`;
  fs.writeFileSync(file, [...codes].map((c) => `${handle},${c}`).join('\n') + '\n');
  console.log(`${handle.padEnd(18)} 누락 ${String(codes.size).padStart(4)}건 → ${file}`);
}
console.log('\n다음 단계 (한 번에 한 계정씩):');
console.log('  node fetch.mjs --codes <시드파일> --out ../../data_export/raw/hooks_<handle>_<date>.jsonl');
