"""Look up each entry's lead image on Wikipedia and save it to data/images.json.

Usage: python3 fetch_images.py   (run after build.py; reads site/techtree.json)

Only free-licensed lead images are returned by Wikipedia's PageImages API.
The result maps Wikipedia title -> [thumbnail URL, width, height, file name].
Titles without an image map to null, so they are not looked up again.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "images.json")
UA = "LineageImageIndex/1.0 (https://lineage.luu.dev)"
SIZE = 960

nodes = json.load(open(os.path.join(HERE, "site", "techtree.json")))
images = json.load(open(OUT)) if os.path.exists(OUT) else {}
todo = sorted({n["wiki"] for n in nodes} - set(images))
force = "--all" in sys.argv
if force:
    todo = sorted({n["wiki"] for n in nodes})

for i in range(0, len(todo), 50):
    batch = todo[i:i + 50]
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "formatversion": 2, "redirects": 1,
        "prop": "pageimages", "piprop": "thumbnail|name", "pithumbsize": SIZE,
        "titles": "|".join(batch)})
    req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": UA})
    for attempt in range(6):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=30))["query"]
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(5 * 2 ** attempt)
    alias = {}
    for k in ("normalized", "redirects"):
        for m in r.get(k, []):
            alias[m["from"]] = m["to"]
    pages = {p["title"]: p for p in r.get("pages", [])}
    for t in batch:
        final, seen = t, set()
        while final in alias and final not in seen:
            seen.add(final)
            final = alias[final]
        p = pages.get(final, {})
        th = p.get("thumbnail")
        images[t] = [th["source"], th["width"], th["height"], p.get("pageimage", "")] if th else None
    print(f"{min(i + 50, len(todo))}/{len(todo)}", end="\r", flush=True)
    time.sleep(0.5)

with open(OUT, "w") as f:
    json.dump(images, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
have = sum(1 for n in nodes if images.get(n["wiki"]))
print(f"\n{have} of {len(nodes)} entries have an image")
