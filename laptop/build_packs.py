"""
Build Krillion prompt packs from Wikidata (free, no API key).

    python build_packs.py            # build every prompt not built yet
    python build_packs.py shark moon # build only some
    python build_packs.py --force    # rebuild even if the pack exists

If Wikidata is rate-limiting (HTTP 429), the script waits and retries on its
own, so just leave it running.

Each prompt in prompts.json has a SPARQL "where" clause that binds ?item.
The script fetches every matching item with its English name, English aliases
and its number of Wikipedia language editions ("sitelinks"), which is used as
the popularity score. Add your own prompts by adding entries to prompts.json.
"""

import json
import ssl
import sys
import urllib.error
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "KrillionTabletop/1.0 (hobby Arduino trivia game)"
HERE = Path(__file__).parent
OUT = HERE / "packs"

QUERY = """
SELECT ?item ?label ?sitelinks
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?common; separator="|") AS ?commons)
WHERE {{
  {where}
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= {min_sitelinks})
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL {{ ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }}
  {common}
}}
GROUP BY ?item ?label ?sitelinks
"""
COMMON = 'OPTIONAL { ?item wdt:P1843 ?common . FILTER(LANG(?common) = "en") }'


# Use certifi's CA bundle when available: python.org installs on macOS ship
# without system certificates ("CERTIFICATE_VERIFY_FAILED").
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

gap_seconds = 2          # pause between queries; grows if Wikidata throttles us


def run_query(q: str, tries: int = 5) -> list[dict]:
    global gap_seconds
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Accept": "application/sparql-results+json"})
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
                return json.load(r)["results"]["bindings"]
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or attempt == tries:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 65
            if e.code == 429:
                gap_seconds = max(gap_seconds, 62)   # stay under their limit from now on
            print(f"(Wikidata busy, HTTP {e.code} — waiting {wait}s)", end=" ", flush=True)
            time.sleep(wait + 1)


def build(p: dict) -> dict:
    q = QUERY.format(where=p["where"], min_sitelinks=p.get("min_sitelinks", 1),
                     common=COMMON if p.get("common_names") else "")
    rows = run_query(q)
    answers = {}
    for r in rows:
        qid = r["item"]["value"].rsplit("/", 1)[-1]
        label = r["label"]["value"]
        aliases = [a for a in r.get("aliases", {}).get("value", "").split("|") if a]
        commons = [c for c in r.get("commons", {}).get("value", "").split("|") if c]
        name = commons[0] if commons and label[:1].isupper() and " " in label and label.split()[1].islower() else label
        answers[qid] = {
            "qid": qid,
            "name": name,
            "aliases": sorted(set(aliases + commons + [label]) - {name}),
            "popularity": int(r["sitelinks"]["value"]),
        }
    return {"id": p["id"], "prompt": p["prompt"], "source": "wikidata",
            "built": time.strftime("%Y-%m-%d"),
            "answers": sorted(answers.values(), key=lambda a: -a["popularity"])}


def main():
    prompts = json.loads((HERE / "prompts.json").read_text())
    force = "--force" in sys.argv
    wanted = {a for a in sys.argv[1:] if not a.startswith("--")}
    OUT.mkdir(exist_ok=True)
    todo = [p for p in prompts
            if (not wanted or p["id"] in wanted)
            and (force or wanted or not (OUT / f"{p['id']}.json").exists())]
    if not todo:
        print("All packs already built (use --force to rebuild).")
    for i, p in enumerate(todo):
        if i:
            time.sleep(gap_seconds)          # be polite to the public endpoint
        print(f"{p['id']:<14}", end=" ", flush=True)
        try:
            pack = build(p)
        except Exception as e:  # network / timeout / bad query
            print(f"FAILED: {e}")
            continue
        (OUT / f"{p['id']}.json").write_text(json.dumps(pack, indent=1, ensure_ascii=False))
        top = ", ".join(a["name"] for a in pack["answers"][:3])
        print(f"{len(pack['answers']):>5} answers  (most common: {top})")


if __name__ == "__main__":
    main()
    