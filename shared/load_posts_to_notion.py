#!/usr/bin/env python3
"""
게시물 → Notion 적재기 (Notion REST API 직접 호출)

왜 스크립트인가:
  LLM이 데이터 경로에 있으면 한국어가 깨진다. 이 세션에서 세 번 재현됐다
  (골드만삭스→계율삭스, 뭐가→뻐가, 나눴습니다→나똌습니다).
  배치 크기·이스케이프 방식·검증 주기를 다 바꿔봤지만 원인은 하나였다 —
  모델이 텍스트를 재생성하는 것. 이 스크립트는 posts.json 을 읽어 그대로 POST 하므로
  손상 확률이 0이다.

백엔드 두 가지:
  ntn  (기본) — 공식 Notion CLI. `ntn api v1/pages` 가 stdin 으로 본문을 받고
                CLI 로그인 인증을 그대로 쓴다. 별도 토큰 발급이 필요 없다.
  http        — 통합 토큰으로 REST API 직접 호출. NOTION_TOKEN 환경변수 또는
                프로젝트 루트 .env.local 에서 읽는다. 값은 로그에 출력하지 않는다.

사용:
  python3 shared/load_posts_to_notion.py --dry-run          # 무엇을 넣을지만 출력
  python3 shared/load_posts_to_notion.py                    # ntn 백엔드로 적재
  python3 shared/load_posts_to_notion.py --backend http     # 토큰 방식으로 적재
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data_export")

POSTS = os.path.join(D, "posts.json")
CHAIN_MAP = os.path.join(D, "chain_map_verified.json")
DONE = os.path.join(D, "notion_post_pages.json")
EXISTING = os.path.join(D, "existing_post_pages.json")

DATABASE_ID = "ac7a03bb-35c7-4b7a-b96f-f900367d7963"  # 스레드 게시물
ACCOUNTS = {
    "beyond.cho": "3af346da-c456-813c-b549-e5cd33a1fba8",
    "ho_ho_ju_ju": "3af346da-c456-810f-9821-c0b06824a480",
}
API = "https://api.notion.com/v1"
VERSION = "2022-06-28"
RATE_SLEEP = 0.34  # Notion 권장 ~3 req/s


def token():
    t = os.environ.get("NOTION_TOKEN")
    if t:
        return t.strip()
    p = os.path.join(ROOT, ".env.local")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line.startswith("NOTION_TOKEN="):
                return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit(
        "NOTION_TOKEN 을 찾지 못했습니다.\n"
        "  export NOTION_TOKEN=... 하거나\n"
        f"  {os.path.join(ROOT, '.env.local')} 에 NOTION_TOKEN=... 를 넣어주세요."
    )


def req_ntn(payload):
    """`ntn api v1/pages` 에 stdin 으로 본문을 넘긴다.

    본문은 파이썬이 만들어 파이프로 보낸다 — 모델이 텍스트를 재생성하지 않으므로
    한국어 손상이 구조적으로 불가능하다. (이 세션에서 세 번 깨졌던 그 문제)
    """
    body = json.dumps(payload, ensure_ascii=False)
    for attempt in range(5):
        r = subprocess.run(
            ["ntn", "api", "v1/pages"],
            input=body, capture_output=True, text=True, timeout=90,
        )
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError:
                raise SystemExit(f"ntn 응답 파싱 실패: {r.stdout[:300]}")
        err = (r.stderr or r.stdout)[:300]
        if any(s in err for s in ("429", "rate", "502", "503", "504")):
            time.sleep(2 ** attempt)
            continue
        raise SystemExit(f"ntn api 실패 (exit {r.returncode}): {err}")
    raise SystemExit("ntn 재시도 소진")


def req(method, path, payload=None, tok=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    r = urllib.request.Request(
        API + path,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {tok}",
            "Notion-Version": VERSION,
            "Content-Type": "application/json",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 502, 503, 504):
                wait = 2 ** attempt
                print(f"  … {e.code}, {wait}s 후 재시도")
                time.sleep(wait)
                continue
            raise SystemExit(f"HTTP {e.code} {method} {path}\n{detail}")
        except urllib.error.URLError as e:
            time.sleep(2 ** attempt)
            if attempt == 4:
                raise SystemExit(f"연결 실패: {e}")
    raise SystemExit("재시도 소진")


def rich(s, limit=2000):
    """rich_text 는 항목당 2000자 제한이라 잘라서 여러 조각으로 넣는다."""
    s = s or ""
    if not s:
        return []
    return [{"text": {"content": s[i:i + limit]}} for i in range(0, len(s), limit)]


def props(p, chain_page_id):
    title = (p.get("body") or "").strip()[:60] or p["code"]
    out = {
        "Name": {"title": [{"text": {"content": title}}]},
        "code": {"rich_text": rich(p["code"])},
        "본문": {"rich_text": rich(p.get("body") or "")},
        "좋아요": {"number": p.get("like") or 0},
        "답글": {"number": p.get("reply") or 0},
        "리포스트": {"number": p.get("repost") or 0},
        "공유": {"number": p.get("share") or 0},
        "이미지여부": {"checkbox": bool(p.get("has_image"))},
    }
    if p.get("url"):
        out["링크"] = {"url": p["url"]}
    if p.get("date"):
        out["날짜"] = {"date": {"start": p["date"]}}
    if p.get("seq"):
        out["순번"] = {"number": p["seq"]}
    if p.get("role"):
        out["역할"] = {"select": {"name": p["role"]}}
    acct = ACCOUNTS.get(p.get("account"))
    if acct:
        out["계정"] = {"relation": [{"id": acct}]}
    if chain_page_id:
        out["체인"] = {"relation": [{"id": chain_page_id}]}
    # 조회수는 수집한 적이 없다 — 0 을 넣으면 거짓이 되므로 비워 둔다
    return out


def page_id(url_or_id):
    s = (url_or_id or "").rstrip("/").split("/")[-1].split("-")[-1].split("?")[0]
    s = "".join(c for c in s if c in "0123456789abcdefABCDEF")
    if len(s) != 32:
        return url_or_id
    return f"{s[:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:]}"


def main():
    dry = "--dry-run" in sys.argv
    backend = "http" if "--backend" in sys.argv and sys.argv[sys.argv.index("--backend") + 1] == "http" else "ntn"

    tok = None
    if not dry:
        if backend == "ntn":
            if not shutil.which("ntn"):
                sys.exit("ntn 이 설치돼 있지 않습니다. `npm install --global ntn` 후 다시 실행하거나 --backend http 를 쓰세요.")
            probe = subprocess.run(["ntn", "api", "v1/users/me"], capture_output=True, text=True, timeout=60)
            if probe.returncode != 0:
                sys.exit(f"ntn 인증 확인 실패 — `ntn login` 이 필요할 수 있습니다.\n{(probe.stderr or probe.stdout)[:300]}")
            print("ntn 인증 OK")
        else:
            tok = token()

    posts = json.load(open(POSTS, encoding="utf-8"))
    cmap = {k: page_id(v) for k, v in json.load(open(CHAIN_MAP, encoding="utf-8")).items()}
    # notion_post_pages.json 은 [{id,url,code}, …] 리스트로 쓰여 있다 (앞선 에이전트 포맷).
    # 그 포맷을 그대로 유지해 이어붙인다.
    done = json.load(open(DONE, encoding="utf-8")) if os.path.exists(DONE) else []
    if isinstance(done, dict):  # 혹시 dict 로 저장된 이력이 있으면 리스트로 정규화
        done = [{"code": k, "url": v} for k, v in done.items()]
    exist = json.load(open(EXISTING, encoding="utf-8")) if os.path.exists(EXISTING) else {}

    skip = {d["code"] for d in done if d.get("code")} | set(exist)
    todo = [p for p in posts if p["code"] not in skip]

    missing = [p["code"] for p in todo if p.get("chain_id") and p["chain_id"] not in cmap]
    if missing:
        sys.exit(f"체인 매핑 누락 {len(missing)}건: {missing[:5]} … 중단합니다.")

    if "--limit" in sys.argv:
        n = int(sys.argv[sys.argv.index("--limit") + 1])
        todo = todo[:n]
        print(f"[--limit {n}] 이번 실행은 {len(todo)}건만 처리합니다")

    print(f"전체 {len(posts)} | 완료 {len(skip)} | 남은 {len(todo)}")
    if dry:
        for p in todo[:3]:
            print(f"  {p['code']} {p.get('role')} {(p.get('body') or '')[:40]!r}")
        print("  (--dry-run: 아무것도 쓰지 않았습니다)")
        return

    ok = fail = 0
    for i, p in enumerate(todo, 1):
        payload = {
            "parent": {"database_id": DATABASE_ID},
            "properties": props(p, cmap.get(p.get("chain_id"))),
        }
        try:
            res = req_ntn(payload) if backend == "ntn" else req("POST", "/pages", payload, tok)
            done.append({"id": res["id"], "url": res["url"], "code": p["code"]})
            ok += 1
        except SystemExit as e:
            print(f"  실패 {p['code']}: {e}")
            fail += 1
        if i % 25 == 0 or i == len(todo):
            json.dump(done, open(DONE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"  {i}/{len(todo)}  성공 {ok} 실패 {fail}")
        time.sleep(RATE_SLEEP)

    json.dump(done, open(DONE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"완료: 성공 {ok} 실패 {fail} | 체크포인트 {DONE}")


if __name__ == "__main__":
    main()
