"""Prepare the landing reel's clips and upload them to Cloudinary.

Usage: python3 media/make_reel.py <unsigned-upload-preset>

For each clip in media/reel.json: downloads an MP4 rendition from Wikimedia Commons
(cached in media/.src/), cuts the 13-second segment shown on the site without
re-encoding (macOS `avconvert`), and uploads it to Cloudinary as lineage/<id>.
Cloudinary then resizes and re-encodes per browser; the page builds the URLs.
"""
import json, os, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, CUT = os.path.join(HERE, ".src"), os.path.join(HERE, "cut")
CLOUD = "daij1adry"
UA = "LineageFootage/1.0 (https://lineage.luu.dev)"
SECONDS = 13
os.makedirs(SRC, exist_ok=True)
os.makedirs(CUT, exist_ok=True)
preset = sys.argv[1]


def best_mp4(title):
    q = urllib.parse.urlencode({"action": "query", "prop": "videoinfo", "viprop": "derivatives",
                                "titles": title, "format": "json", "formatversion": 2})
    req = urllib.request.Request("https://commons.wikimedia.org/w/api.php?" + q, headers={"User-Agent": UA})
    for attempt in range(6):
        try:
            info = json.load(urllib.request.urlopen(req, timeout=30))["query"]["pages"][0]["videoinfo"][0]
            break
        except Exception:
            time.sleep(3 * 2 ** attempt)
    mp4 = [d for d in info["derivatives"] if "mp4" in d.get("type", "") or "mpeg4" in d["src"]]
    return max([d for d in mp4 if (d.get("height") or 0) <= 720] or mp4, key=lambda d: d.get("height") or 0)["src"]


for clip in json.load(open(os.path.join(HERE, "reel.json"))):
    cid = clip["id"]
    src = os.path.join(SRC, cid + ".mp4")
    if not os.path.exists(src):
        req = urllib.request.Request(best_mp4(clip["file"]), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(src, "wb") as f:
            f.write(r.read())
    out = None
    for ext in (".mp4", ".mov"):  # some older codecs only fit a QuickTime container
        path = os.path.join(CUT, cid + ext)
        r = subprocess.run(["avconvert", "-s", src, "-o", path, "-p", "PresetPassthrough", "--start", str(clip["start"]),
                            "--duration", str(SECONDS), "--replace"], capture_output=True)
        if r.returncode == 0 and os.path.exists(path):
            out = path
            break
    if not out:
        print(f"{cid}: could not cut")
        continue
    r = subprocess.run(["curl", "-s", "-X", "POST", f"https://api.cloudinary.com/v1_1/{CLOUD}/video/upload",
                        "-F", f"file=@{out}", "-F", f"upload_preset={preset}", "-F", f"public_id={cid}"],
                       capture_output=True, text=True)
    res = json.loads(r.stdout or "{}")
    print(f"{cid:22s}", res.get("public_id") or res.get("error", {}).get("message"))
