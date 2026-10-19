"""Validate tech-tree data files.

Usage: python3 validate.py [--wiki] file1.json [file2.json ...]

Checks schema, duplicate ids, unknown prerequisites, cycles and
prerequisites dated after the node. With --wiki, also checks that every
Wikipedia title exists and is not a disambiguation page (results cached
in .wikicache.json next to this script).
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

CATS = {"foundations", "knowledge", "agriculture", "materials", "construction",
        "manufacturing", "energy", "electronics", "computing", "communication",
        "transport", "aerospace", "medicine", "biotech", "instruments",
        "military", "daily"}
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".wikicache.json")
UA = "TechTreeIndexValidator/1.0 (offline data check)"


def load(paths):
    nodes = []
    for p in paths:
        with open(p) as f:
            data = json.load(f)
        for n in data:
            n["_file"] = os.path.basename(p)
        nodes.extend(data)
    return nodes


def wiki_check(titles):
    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE))
    todo = [t for t in titles if t not in cache]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "redirects": 1,
            "prop": "pageprops|description", "ppprop": "disambiguation",
            "titles": "|".join(batch)})
        req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q,
                                     headers={"User-Agent": UA})
        for attempt in range(8):
            try:
                r = json.load(urllib.request.urlopen(req, timeout=30))["query"]
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == 7:
                    raise
                time.sleep(5 * 2 ** attempt)
        time.sleep(1)
        alias = {}
        for k in ("normalized", "redirects"):
            for m in r.get(k, []):
                alias[m["from"]] = m["to"]
        pages = {p["title"]: p for p in r["pages"].values()}
        for t in batch:
            final = t
            seen = set()
            while final in alias and final not in seen:
                seen.add(final)
                final = alias[final]
            p = pages.get(final, {})
            if "missing" in p or "invalid" in p or not p:
                cache[t] = {"ok": False, "why": "missing"}
            elif "disambiguation" in p.get("pageprops", {}):
                cache[t] = {"ok": False, "why": "disambiguation", "final": final}
            else:
                cache[t] = {"ok": True, "final": final,
                            "sd": p.get("description", "")}
        json.dump(cache, open(CACHE, "w"))
    return cache


def main():
    args = sys.argv[1:]
    wiki = "--wiki" in args
    paths = [a for a in args if a != "--wiki"]
    nodes = load(paths)
    errs, warns = [], []
    ids = {}
    for n in nodes:
        for k, t in (("id", str), ("name", str), ("year", int), ("cat", str),
                     ("wiki", str), ("req", list), ("desc", str)):
            if not isinstance(n.get(k), t):
                errs.append(f"{n.get('id')} ({n['_file']}): bad field {k}")
        if n.get("cat") not in CATS:
            errs.append(f"{n.get('id')}: unknown cat {n.get('cat')}")
        if n["id"] in ids:
            errs.append(f"duplicate id {n['id']} in {n['_file']} and {ids[n['id']]['_file']}")
        ids[n["id"]] = n
    for n in nodes:
        for r in n["req"]:
            if r not in ids:
                errs.append(f"{n['id']} ({n['_file']}): unknown req {r}")
            elif ids[r]["year"] > n["year"]:
                warns.append(f"{n['id']} ({n['year']}) requires later {r} ({ids[r]['year']})")
            if r == n["id"]:
                errs.append(f"{n['id']}: requires itself")
    # cycles
    state = {}
    def visit(i, stack):
        state[i] = 1
        for r in ids[i]["req"]:
            if r not in ids:
                continue
            if state.get(r) == 1:
                errs.append("cycle: " + " -> ".join(stack + [i, r]))
            elif r not in state:
                visit(r, stack + [i])
        state[i] = 2
    sys.setrecursionlimit(10000)
    for i in ids:
        if i not in state:
            visit(i, [])
    if wiki:
        cache = wiki_check(sorted({n["wiki"] for n in nodes}))
        for n in nodes:
            c = cache[n["wiki"]]
            if not c["ok"]:
                errs.append(f"{n['id']} ({n['_file']}): wiki '{n['wiki']}' {c['why']}")
        finals = {}
        for n in nodes:
            c = cache[n["wiki"]]
            if c["ok"]:
                finals.setdefault(c["final"], []).append(n["id"])
        for f, lst in finals.items():
            if len(lst) > 1:
                warns.append(f"same Wikipedia article '{f}': {', '.join(lst)}")
    for w in warns:
        print("WARN", w)
    for e in errs:
        print("ERROR", e)
    print(f"{len(nodes)} nodes, {len(errs)} errors, {len(warns)} warnings")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
