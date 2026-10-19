"""Merge data/*.json into techtree.json and bake it into index.html.

Usage: python3 build.py  (writes the website to site/)

Merge rules:
- spine.json first, then domain files alphabetically; on duplicate id the
  first wins and the later node's prerequisites are folded into it.
- Nodes whose Wikipedia article resolves to one already used are folded
  into the earlier node (their id becomes an alias).
- Titles are canonicalized to the resolved article (needs .wikicache.json
  from `validate.py --wiki`); titles known to be missing are dropped.
- data/patches/*.json ({id: [extra prerequisite ids]}) add edges.
- Edges to unknown ids, edges back in time and edges closing a cycle are
  dropped.
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OVERRIDE = {  # bad titles found by validation -> correct article
    "Blender": "Blender (appliance)", "Cam": "Cam (mechanism)",
    "Screw machine": "Screw machine (automatic lathe)",
    "Intensity-modulated radiation therapy": "External beam radiotherapy",
}
cache = json.load(open(os.path.join(HERE, ".wikicache.json")))

files = [os.path.join(DATA, "spine.json")] + sorted(
    f for f in glob.glob(os.path.join(DATA, "*.json")) if not f.endswith(("spine.json", "images.json")))

nodes, by_id, alias, log = [], {}, {}, []
for f in files:
    for n in json.load(open(f)):
        n["wiki"] = OVERRIDE.get(n["wiki"], n["wiki"])
        if n["id"] in by_id:
            by_id[n["id"]]["req"] += n["req"]
            continue
        by_id[n["id"]] = n
        nodes.append(n)

# fold nodes sharing a Wikipedia article; canonicalize titles
by_title, kept = {}, []
for n in nodes:
    c = cache.get(n["wiki"])
    if c and not c["ok"]:
        log.append(f"drop {n['id']}: wiki '{n['wiki']}' {c['why']}")
        alias[n["id"]] = None
        continue
    if c:
        n["wiki"] = c["final"]
    t = n["wiki"]
    if t in by_title:
        k = by_title[t]
        alias[n["id"]] = k["id"]
        k["req"] += n["req"]
        log.append(f"fold {n['id']} -> {k['id']} ({t})")
        continue
    by_title[t] = n
    kept.append(n)
nodes = kept
by_id = {n["id"]: n for n in nodes}

def resolve(i):
    seen = set()
    while i in alias and i not in seen:
        seen.add(i)
        i = alias[i]
        if i is None:
            return None
    return i if i in by_id else None

for p in sorted(glob.glob(os.path.join(DATA, "patches", "*.json"))):
    for k, extra in json.load(open(p)).items():
        k = resolve(k)
        if k:
            by_id[k]["req"] += extra

dropped = {"unknown": 0, "time": 0, "cycle": 0}
for n in nodes:
    out = []
    for r in n["req"]:
        r2 = resolve(r)
        if not r2 or r2 == n["id"]:
            dropped["unknown"] += r2 is None
            continue
        if by_id[r2]["year"] > n["year"]:
            dropped["time"] += 1
            continue
        if r2 not in out:
            out.append(r2)
    n["req"] = out

# break cycles (equal-year edges can still form them)
sys.setrecursionlimit(20000)
state = {}
def visit(n):
    state[n["id"]] = 1
    keep = []
    for r in n["req"]:
        s = state.get(r)
        if s == 1:
            dropped["cycle"] += 1
            continue
        if s is None:
            visit(by_id[r])
        keep.append(r)
    n["req"] = keep
    state[n["id"]] = 2
for n in nodes:
    if n["id"] not in state:
        visit(n)

SITE = os.path.join(HERE, "site")
BUILD = os.path.join(HERE, "build")
os.makedirs(SITE, exist_ok=True)
os.makedirs(BUILD, exist_ok=True)
dataset = "[\n" + ",\n".join(json.dumps({k: n[k] for k in ("id", "name", "year", "cat", "wiki", "req", "desc")}, ensure_ascii=False) for n in nodes) + "\n]\n"
open(os.path.join(SITE, "techtree.json"), "w", encoding="utf-8").write(dataset)
with open(os.path.join(BUILD, "build.log"), "w") as f:
    f.write("\n".join(log) + "\n")

# lead images from Wikipedia (see fetch_images.py), stored compactly as
# [path under upload.wikimedia.org/wikipedia/, width, height, 1 if a /thumb/ URL can be built]
IMG_RE = re.compile(r"wikipedia/([a-z]+)/(?:thumb/)?([0-9a-f]/[0-9a-f]{2}/[^/?]+)")
images = {}
img_path = os.path.join(DATA, "images.json")
if os.path.exists(img_path):
    for title, v in json.load(open(img_path, encoding="utf-8")).items():
        m = v and IMG_RE.search(v[0])
        if m:
            images[title] = [m.group(1) + "/" + m.group(2), v[1], v[2], 1 if "/thumb/" in v[0] else 0]
rows = [[n["id"], n["name"], n["year"], n["cat"], n["wiki"], n["req"], n["desc"], images.get(n["wiki"], 0)] for n in nodes]
data = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
part = lambda f: open(os.path.join(HERE, "parts", f), encoding="utf-8").read()
page = (open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
        .replace("/*GRAPHCSS*/", part("graph.css"))
        .replace("/*FLOATCSS*/", part("float.css"))
        .replace("/*DESKCSS*/", part("desk.css"))
        .replace("<!--GRAPHHTML-->", part("graph.html"))
        .replace("/*GRAPHJS*/", part("graph.js"))
        .replace("/*DATA*/[]", data))

# embeddable page body (no document skeleton)
open(os.path.join(BUILD, "embed.html"), "w", encoding="utf-8").write(page)

# standalone website for lineage.luu.dev
URL = "https://lineage.luu.dev/"
DESC = (f"Lineage is a browsable technology tree: {len(nodes):,} inventions from stone tools to today, "
        "linked by what each one required. Every entry links to Wikipedia.")
cut = page.index("</style>") + len("</style>")
head_part, body_part = page[:cut], page[cut:]
open(os.path.join(SITE, "favicon.svg"), "w").write(part("favicon.svg"))
meta = f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="canonical" href="{URL}">
<meta name="theme-color" content="#f1f0eb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1b1a" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:url" content="{URL}">
<meta property="og:title" content="Lineage, the technology tree">
<meta property="og:description" content="{DESC}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/json" href="/techtree.json" title="Lineage dataset">"""
head_part = "\n" + meta + head_part
site = f'<!doctype html>\n<html lang="en">\n<head>{head_part}\n</head>\n<body>{body_part}</body>\n</html>\n'
open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(site)
roots = sum(1 for n in nodes if not n["req"])
print(f"{len(nodes)} nodes ({roots} roots), {len(log)} folded/dropped, edges dropped: {dropped}, "
      f"{len(page) // 1024} KB page -> site/index.html")
