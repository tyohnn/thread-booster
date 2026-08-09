#!/usr/bin/env python3
"""
심리 기법(M1~M17) + 자체제작 템플릿(N1~N10) → Notion 적재.

`load_posts_to_notion.py` 와 같은 구조: 파이썬이 JSON 을 만들어 `ntn api` 에
stdin 으로 넘긴다. 모델이 한국어를 재생성하지 않으므로 손상이 불가능하다.

하는 일
  1. 심리 기법 DB 에 M1~M17 생성
  2. 스레드 템플릿 DB 에 N1~N10 생성 (출처=자체제작, 신뢰도=미검증)
  3. 기존 T1~T18 에 출처=추출 + 심리 기법 관계 연결

사용:
  python3 shared/load_psych_to_notion.py --dry-run
  python3 shared/load_psych_to_notion.py
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data_export")

MECH_DB = "5763c1fb-d254-4982-9d65-a0b9cd630978"   # 심리 기법
TMPL_DB = "4571ef6b-4d2b-40c1-a293-6caad3db6322"   # 스레드 템플릿
OUT = os.path.join(D, "mechanism_pages.json")
SLEEP = 0.34


def ntn(path, payload=None, method=None):
    cmd = ["ntn", "api", path]
    if method:
        cmd += ["-X", method]
    body = json.dumps(payload, ensure_ascii=False) if payload else None
    for attempt in range(5):
        r = subprocess.run(cmd, input=body, capture_output=True, text=True, timeout=90)
        if r.returncode == 0:
            return json.loads(r.stdout)
        err = (r.stderr or r.stdout)[:300]
        if any(s in err for s in ("429", "rate", "502", "503", "504")):
            time.sleep(2 ** attempt)
            continue
        raise SystemExit(f"ntn 실패 {path}: {err}")
    raise SystemExit("재시도 소진")


def rich(s, limit=2000):
    s = s or ""
    return [{"text": {"content": s[i:i + limit]}} for i in range(0, len(s), limit)] if s else []


def pid(u):
    s = (u or "").rstrip("/").split("/")[-1].split("-")[-1].split("?")[0]
    s = "".join(c for c in s if c in "0123456789abcdefABCDEF")
    return f"{s[:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:]}" if len(s) == 32 else u


def main():
    dry = "--dry-run" in sys.argv
    mechs = json.load(open(os.path.join(D, "mechanisms.json"), encoding="utf-8"))
    news = json.load(open(os.path.join(D, "new_templates.json"), encoding="utf-8"))
    tpages = {k: pid(v) for k, v in json.load(open(os.path.join(D, "template_pages.json"), encoding="utf-8")).items()}

    # T코드 -> 이 템플릿이 쓰는 M코드들 (기법의 used_by 를 뒤집는다)
    t2m = {}
    for m in mechs:
        for t in m["used_by"]:
            t2m.setdefault(t, []).append(m["code"])

    print(f"기법 {len(mechs)} | 신규 템플릿 {len(news)} | 기존 템플릿 {len(tpages)}")
    if dry:
        for m in mechs[:2]:
            print(f"  {m['code']} {m['name'][:30]} 검증={'데이터 확인' if m['evidence'] else '문헌 해석'} 사용={m['used_by']}")
        for n in news[:2]:
            print(f"  {n['code']} {n['name'][:34]} 기반={n['based_on']}")
        print(f"  T→M 매핑 {len(t2m)}건, 예: T1 -> {t2m.get('T1')}")
        print("  (--dry-run: 아무것도 쓰지 않았습니다)")
        return

    # 1) 심리 기법
    mpages = {}
    for m in mechs:
        props = {
            "Name": {"title": [{"text": {"content": m["name"]}}]},
            "코드": {"rich_text": rich(m["code"])},
            "정의": {"rich_text": rich(m["definition"])},
            "데이터 근거": {"rich_text": rich(m["evidence"])},
            "검증": {"select": {"name": "데이터 확인" if m["evidence"] else "문헌 해석"}},
            "안티패턴": {"checkbox": m["code"] == "M17"},
            "템플릿": {"relation": [{"id": tpages[t]} for t in m["used_by"] if t in tpages]},
        }
        res = ntn("v1/pages", {"parent": {"database_id": MECH_DB}, "properties": props})
        mpages[m["code"]] = res["id"]
        print(f"  기법 {m['code']} ✓")
        time.sleep(SLEEP)
    json.dump(mpages, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 2) 자체제작 템플릿
    for n in news:
        props = {
            "Name": {"title": [{"text": {"content": n["name"]}}]},
            "코드": {"rich_text": rich(n["code"])},
            "골격": {"rich_text": rich(n["skeleton"])},
            "출처": {"select": {"name": "자체제작"}},
            "신뢰도": {"select": {"name": "미검증"}},   # 아직 0회 발행 — 성과 데이터 없음
            "안티패턴": {"checkbox": False},
            "표본수": {"number": 0},
            "비고": {"rich_text": rich(f"대응 원본: {n['maps_to']} | {n['notes']}"[:1900])},
            "심리 기법": {"relation": [{"id": mpages[c]} for c in n["based_on"] if c in mpages]},
        }
        ntn("v1/pages", {"parent": {"database_id": TMPL_DB}, "properties": props})
        print(f"  신규 {n['code']} ✓")
        time.sleep(SLEEP)

    # 3) 기존 T1~T18: 출처=추출 + 기법 연결
    for t, page in tpages.items():
        props = {
            "출처": {"select": {"name": "추출"}},
            "심리 기법": {"relation": [{"id": mpages[c]} for c in t2m.get(t, []) if c in mpages]},
        }
        ntn(f"v1/pages/{page}", {"properties": props}, method="PATCH")
        print(f"  기존 {t} ✓")
        time.sleep(SLEEP)

    print(f"완료 | 기법 페이지 매핑: {OUT}")


if __name__ == "__main__":
    main()
