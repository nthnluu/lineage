# Technology tree dataset: brief for domain authors

We are building an exhaustive, browsable index of human technology as a
prerequisite graph (a DAG), from stone tools to 2026. Each node links to its
Wikipedia article. The site lets people start from basic inventions and drill
down into what each one enabled. Accuracy matters: this should read as a real
reference, not a game tech tree.

## Your job

Write ONE JSON file (path given in your task) containing an array of nodes for
your domain. Aim for the count given in your task. Cover the domain
exhaustively: the major milestones AND the important intermediate steps that
connect them, from ancient to cutting-edge (2020s). Prefer distinct, notable
technologies with their own Wikipedia articles. Do not pad with trivia,
product models, or brands, except where a specific machine is the landmark
(e.g. "ENIAC", "Saturn V", "Model T" are fine as landmark nodes).

## Node schema (all fields required)

```json
{"id": "watt_steam_engine", "name": "Watt steam engine", "year": 1776,
 "cat": "energy", "wiki": "Watt steam engine",
 "req": ["steam_engine", "boring_machine"],
 "desc": "James Watt's separate-condenser engine, which made steam power efficient."}
```

- `id`: lowercase snake_case, unique, stable. Use a short form of the name.
  Prefix nothing. Avoid generic ids that another domain might also create
  (e.g. use `steam_turbine`, not `turbine`).
- `name`: short display name, sentence case.
- `year`: integer, year of the first working/practical instance (invention or
  first demonstration). Negative = BCE. Use your best scholarly estimate; for
  prehistory round sensibly (e.g. -10000).
- `cat`: one of the categories assigned to you in the task.
- `wiki`: exact English Wikipedia article title (spaces, not underscores;
  correct capitalization and diacritics). Must be a real article, not a
  disambiguation page. Pick the article most specifically about the
  technology. Two nodes must not point to the same article.
- `req`: ids of DIRECT prerequisites: technologies (or scientific
  knowledge) without which this could not have been made. 1–4 entries
  usually; only true roots have none. List only direct parents, not
  grandparents. Each prerequisite must be dated no later than the node.
  Every id in `req` must exist either in `data/spine.json` or in your own file.
- `desc`: one plain sentence (max ~160 chars) saying what it is and why it
  mattered. No marketing tone, no em-dashes.

## The spine

`data/spine.json` holds ~145 core nodes shared by every domain (fire,
agriculture, writing, smelting, steam engine, electricity, transistor,
internet, etc.). Read it first. Use its ids as prerequisites wherever they
apply and DO NOT redefine those nodes. Connect your domain to the spine
generously: most of your early nodes should hang off spine nodes, and spine
nodes in your domain should gain many children from you.

Other domains are being written in parallel by other authors. You cannot
reference their ids, so stay inside your scope. If something essential from
another domain is a prerequisite and is not in the spine, use the nearest
spine node instead. A later pass will add cross-domain links.

## Validation (required)

From the project root run:

    python3 validate.py --wiki data/spine.json data/<your file>.json

It checks schema, unknown prerequisites, cycles, dates, and that every
Wikipedia title exists and is not a disambiguation page (it calls the
Wikipedia API). Fix every ERROR. Fix WARN lines about dates and about two
nodes sharing one article (merge or re-point them). Re-run until clean.
Do not edit spine.json or validate.py.

Write the file compactly: one node per line inside the array.

When done, reply with just: the node count, the earliest and latest years,
and anything you deliberately left out or were unsure about (one short list).
