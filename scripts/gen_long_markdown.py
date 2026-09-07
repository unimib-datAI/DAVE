#!/usr/bin/env python3
"""
Generate a large markdown document (and a matching DAVE document fixture with
entity annotations + clusters) for stress-testing the virtualized markdown
document view.

Outputs:
  frontend/tests/data/long-markdown.txt   - raw markdown, upload via the TXT tab
  frontend/tests/data/long-markdown.json  - same text + entities_, upload via JSON tab

The .json fixture has hundreds of entities spread across the whole document so
you can test: virtualization while scrolling, click-a-mention -> right sidebar,
click a cluster-list mention -> scroll+pulse to it, soft line breaks, tables,
fenced code blocks with blank lines, blockquotes, loose/tight lists.
"""
import json
import os
import random

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "frontend", "tests", "data")

FIRST = ["Alice", "Marco", "Priya", "Johan", "Chen", "Fatima", "Diego", "Lena",
         "Kwame", "Sofia", "Ravi", "Emma", "Tomas", "Yuki", "Noah", "Amara"]
LAST = ["Rossi", "Nguyen", "Okafor", "Bianchi", "Kowalski", "Haddad", "Silva",
        "Andersson", "Kim", "Petrov", "Meyer", "Costa", "Larsen", "Tanaka"]
ORGS = ["Northwind Logistics S.p.A.", "Helios Data Registry", "Meridian Trust Bank",
        "Aurora Compliance Office", "Continental Freight GmbH", "Blue Harbor Authority",
        "Sable & Finch LLP", "Vanguard Technical Support", "Orion Municipal Court",
        "Delta Regulatory Board"]
PLACES = ["Milano", "Rotterdam", "Lagos", "Kraków", "Marseille", "Turin",
          "Hamburg", "Porto", "Copenhagen", "Bergamo"]
NORMS = ["Art. 2043 c.c.", "Art. 1218 c.c.", "GDPR Art. 6(1)(f)", "Reg. (EU) 2016/679",
         "Art. 96 c.p.c.", "D.Lgs. 231/2001", "Art. governance-clause 14", "Directive 2011/83/EU"]
STATUSES = ["closed", "under review", "appealed", "settled", "dismissed"]

def money():
    return f"EUR {random.randint(2, 940)},{random.randint(0, 999):03d}.00"

def date():
    return f"20{random.randint(19, 25):02d}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"

def person():
    return f"{random.choice(FIRST)} {random.choice(LAST)}"

def case_id(n):
    return f"EXT-CASE-{500000 + n * 137}"


class Doc:
    def __init__(self):
        self.buf = []
        self.len = 0
        self.anns = []              # {start,end,type,id,features:{text}}
        self.clusters = {}          # title -> {type, title, mentions:[{id,mention}]}
        self.next_id = 0

    def w(self, s):
        self.buf.append(s)
        self.len += len(s)

    def e(self, text, etype):
        """write `text` and record it as an entity of type `etype`."""
        start = self.len
        self.w(text)
        end = self.len
        aid = self.next_id
        self.next_id += 1
        self.anns.append({
            "type": etype, "start": start, "end": end, "id": aid,
            "features": {"text": text},
        })
        c = self.clusters.setdefault(text, {"type": etype, "title": text, "mentions": []})
        c["mentions"].append({"id": aid, "mention": text})
        return text

    def text(self):
        return "".join(self.buf)


d = Doc()

d.w("# Case Compendium - Support & Regulatory Archive\n\n")
d.w("This archive collects procedural records, correspondence and rulings.\n")
d.w("Lines are wrapped at the source; every newline should render as a break.\n")
d.w("It is intentionally long so the document view has to virtualize it.\n\n")

# ---- overview table ----
N_CASES = int(os.environ.get("N_CASES", "220"))
d.w("## Overview\n\n")
d.w("| Case | Claimant | Registry | Amount | Status |\n")
d.w("|------|----------|----------|--------|--------|\n")
overview = []
for i in range(1, N_CASES + 1):
    cid = case_id(i)
    who = person()
    org = random.choice(ORGS)
    amt = money()
    st = random.choice(STATUSES)
    overview.append((i, cid, who, org, amt, st))
    d.w("| ")
    d.e(cid, "id")
    d.w(f" | {who} | {org} | {amt} | {st} |\n")
d.w("\n---\n\n")

LOREM = (
    "The parties exchanged submissions over several weeks and the tribunal "
    "reviewed the technical record in full.\nCorrespondence was logged as it "
    "arrived and each attachment was verified against the manifest.\nWhere a "
    "discrepancy was found the submitting party was asked to re-file within "
    "five working days.\nNo adverse inference was drawn from the initial "
    "formatting issues, which were treated as clerical.\n"
)

for (i, cid, claimant, org, amt, st) in overview:
    d.w(f"## Case {i}: ")
    d.e(cid, "id")
    d.w("\n\n")

    d.w("**Filed:** ")
    d.e(date(), "data")
    d.w("  \n**Registry:** ")
    d.e(org, "organizzazione")
    d.w("  \n**Jurisdiction:** ")
    d.e(random.choice(PLACES), "luogo")
    d.w("\n\n")

    d.w("### Summary\n\n")
    d.w(LOREM)
    d.w("\n")
    d.w("The claimant, ")
    d.e(claimant, "persona")
    d.w(", alleged losses of ")
    d.e(amt, "money")
    d.w(" arising from the events described below.\n")
    d.w("The respondent, ")
    d.e(org, "organizzazione")
    d.w(", denied liability and relied on ")
    d.e(random.choice(NORMS), "norma")
    d.w(".\n\n")

    d.w("### Parties\n\n")
    counsel = person()
    judge = person()
    d.w("- Claimant: ")
    d.e(claimant, "persona")
    d.w(", represented by ")
    d.e(counsel, "persona")
    d.w("\n- Respondent: ")
    d.e(org, "organizzazione")
    d.w("\n- Presiding: ")
    d.e(judge, "persona")
    d.w("\n\n")

    d.w("### Statutory basis\n\n")
    n1 = random.choice(NORMS)
    n2 = random.choice(NORMS)
    d.w("The tribunal considered ")
    d.e(n1, "norma")
    d.w(" alongside ")
    d.e(n2, "norma")
    d.w(".\nDamages, if any, were to be assessed at ")
    d.e(amt, "money")
    d.w(".\n\n")

    d.w("> On the question of foreseeability the tribunal observed that\n")
    d.w("> the risk was known to ")
    d.e(org, "organizzazione")
    d.w(" well before the filing date.\n\n")

    d.w("### Procedural log\n\n")
    for step, label in enumerate(
        ["filing received", "hearing scheduled", "evidence exchanged",
         "oral argument", "decision rendered"], start=1):
        d.w(f"{step}. ")
        d.e(date(), "data")
        d.w(f" - {label}\n")
        if step == 3:
            d.w("\n")  # make it a loose list
    d.w("\n")

    d.w("### Machine record\n\n")
    d.w("```json\n")
    d.w("{\n")
    d.w(f'  "case": "{cid}",\n')
    d.w(f'  "registry": "{org}",\n')
    d.w("\n")  # blank line inside a fenced block - must NOT split here
    d.w(f'  "amount": "{amt}",\n')
    d.w(f'  "status": "{st}"\n')
    d.w("}\n")
    d.w("```\n\n")

    d.w("### Correspondence\n\n")
    for _ in range(2):
        sender = person()
        d.w("From: ")
        d.e(sender, "persona")
        d.w("  \nDate: ")
        d.e(date(), "data")
        d.w("\n\n")
        d.w(
            "Thank you for the update regarding this matter.\nWe have reviewed "
            "the latest submission and will respond in due course.\nPlease "
            "direct any further correspondence to the registry.\n\n"
        )

    d.w("---\n\n")

text = d.text()

os.makedirs(OUT_DIR, exist_ok=True)

md_path = os.path.join(OUT_DIR, "long-markdown.txt")
with open(md_path, "w") as f:
    f.write(text)

# order annotations by start (matches what the backend/pipeline produces)
d.anns.sort(key=lambda a: (a["start"], -a["end"]))

# clusters need sequential ids; keep only clusters with >= 1 mention
clusters = []
for cid, c in enumerate(d.clusters.values(), start=1):
    clusters.append({
        "id": cid,
        "title": c["title"],
        "type": c["type"],
        "nelements": len(c["mentions"]),
        "mentions": c["mentions"],
    })

fixture = {
    "name": "long-markdown",
    "text": text,
    "offset_type": "p",
    "features": {"clusters": {"entities_": clusters}},
    "annotation_sets": {
        "entities_": {
            "name": "entities_",
            "next_annid": d.next_id,
            "annotations": d.anns,
        }
    },
}

json_path = os.path.join(OUT_DIR, "long-markdown.json")
with open(json_path, "w") as f:
    json.dump(fixture, f, ensure_ascii=False)

# sanity: every annotation's recorded text matches the slice at its offsets
bad = [a for a in d.anns if text[a["start"]:a["end"]] != a["features"]["text"]]
print(f"markdown : {md_path}")
print(f"           {len(text):,} chars, {text.count(chr(10)):,} newlines, "
      f"{len(d.buf):,} write ops")
print(f"fixture  : {json_path}")
print(f"           {len(d.anns)} entities, {len(clusters)} clusters, "
      f"offset check: {'OK' if not bad else str(len(bad)) + ' MISMATCH'}")
