import json
import os
import re
import time
import urllib.parse
import urllib.request

WIKI_API = "https://tdx.fandom.com/api.php"
OUT_DIR = os.path.join("images", "tdx")
HEADERS = {"User-Agent": "TDesign-personal-tool/1.0 (fan project, image fetch)"}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def tower_names():
    # reads the tower names from the tdx block in games.js
    text = open("games.js", encoding="utf-8").read()
    start = text.index("tdx:")
    end = text.find("custom:", start)
    block = text[start:end if end != -1 else len(text)]
    block = block[block.index("towers:"):]
    return re.findall(r'name:\s*"([^"]+)"', block)


def image_url(title):
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "pageimages",
        "piprop": "original",
        "format": "json",
        "redirects": 1,
    })
    data = json.loads(get(WIKI_API + "?" + params))
    for page in data.get("query", {}).get("pages", {}).values():
        original = page.get("original")
        if original:
            return original["source"]
    return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    missing = []
    not_png = []

    for name in tower_names():
        base = slug(name)
        have = [f for f in os.listdir(OUT_DIR) if f.rsplit(".", 1)[0] == base]
        if have:
            print("already have:", name)
            continue

        try:
            url = image_url(name)
            if not url:
                print("no image found:", name)
                missing.append(name)
            else:
                path = urllib.parse.urlparse(url).path.split("/revision")[0]
                ext = os.path.splitext(path)[1].lower() or ".png"
                filename = base + ext
                with open(os.path.join(OUT_DIR, filename), "wb") as f:
                    f.write(get(url))
                print("saved:", filename)
                if ext != ".png":
                    not_png.append((name, filename))
        except Exception as e:
            print("failed:", name, "-", e)
            missing.append(name)

        time.sleep(1)  # be polite to the wiki

    print("\n--- Summary ---")
    if missing:
        print("No image for these (they'll show badges):")
        for n in missing:
            print("  ", n)
    if not_png:
        print("\nSaved as a different file type. Add an img line in games.js:")
        for n, fn in not_png:
            print('   { name: "%s", img: "images/tdx/%s" },' % (n, fn))


main()