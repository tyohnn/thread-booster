#!/usr/bin/env python3
"""
체인 → 템플릿 관계를 Notion 에 반영.

`chains.json` 의 `template_code` 를 스레드 체인 DB 의 `템플릿` relation 에 쓴다.
바뀐 체인만 PATCH 한다 (전체 866 을 매번 쓰지 않는다).

`load_posts_to_notion.py` 와 같은 구조 — 파이썬이 JSON 을 만들어 `ntn api` 에 넘긴다.
여기서는 관계 ID 만 다루므로 한국어가 경로에 없지만, 일관성을 위해 같은 방식을 쓴다.

사용:
  python3 shared/sync_chain_templates.py --dry-run
  python3 shared/sync_chain_templates.py
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data_export")
SLEEP = 0.34


def pid(u):
    s = (u or "").rstrip("/").split("/")[-1].split("-")[-1].split("?")[0]
    s = "".join(c for c in s if c in "0123456789abcdefABCDEF")
    return f"{s[:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:]}" if len(s) == 32 else u


def ntn(path, payload, method="PATCH"):
    body = json.dumps(payload, ensure_ascii=False)
    for attempt in range(5):
        r = subprocess.run(["ntn", "api", path, "-X", method],
                           input=body, capture_output=True, text=True, timeout=90)
        if r.returncode == 0:
            return json.loads(r.stdout)
        err = (r.stderr or r.stdout)[:300]
        if any(s in err for s in ("429", "rate", "502", "503", "504")):
            time.sleep(2 ** attempt)
            continue
        raise SystemExit(f"ntn 실패 {path}: {err}")
    raise SystemExit("재시도 소진")


def main():
    dry = "--dry-run" in sys.argv
    chains = json.load(open(os.path.join(D, "chains.json"), encoding="utf-8"))
    cmap = {k: pid(v) for k, v in json.load(open(os.path.join(D, "chain_map_verified.json"), encoding="utf-8")).items()}
    tmpl = {k: pid(v) for k, v in json.load(open(os.path.join(D, "template_pages.json"), encoding="utf-8")).items()}

    todo = [c for c in chains if c.get("template_code") != c.get("template_code_prev")]
    missing = [c["chain_id"] for c in todo if c["chain_id"] not in cmap]
    if missing:
        sys.exit(f"체인 페이지 매핑 누락 {len(missing)}건 — 중단합니다: {missing[:3]}")

    added = sum(1 for c in todo if c.get("template_code"))
    cleared = len(todo) - added
    print(f"갱신 대상 {len(todo)}건 (부여/변경 {added}, 해제 {cleared})")
    if dry:
        for c in todo[:5]:
            print(f"  {c['chain_id']}  {c.get('template_code_prev')} -> {c.get('template_code')}")
        print("  (--dry-run: 아무것도 쓰지 않았습니다)")
        return

    ok = fail = 0
    for i, c in enumerate(todo, 1):
        code = c.get("template_code")
        rel = [{"id": tmpl[code]}] if code and code in tmpl else []
        try:
            ntn(f"v1/pages/{cmap[c['chain_id']]}", {"properties": {"템플릿": {"relation": rel}}})
            ok += 1
        except SystemExit as e:
            print(f"  실패 {c['chain_id']}: {e}")
            fail += 1
        if i % 50 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)}  성공 {ok} 실패 {fail}")
        time.sleep(SLEEP)
    print(f"완료: 성공 {ok} 실패 {fail}")


if __name__ == "__main__":
    main()
