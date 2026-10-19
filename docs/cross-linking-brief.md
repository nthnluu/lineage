# Cross-domain linking pass

The tech-tree index (3,241 technologies) was written by separate domain
authors who could only link to their own domain plus a shared spine. So
many prerequisites that cross domains are missing (e.g. a railway node may
not list the Bessemer process; MRI may not list superconducting magnets;
a CPU node may not list a lithography node).

`data/allnodes.txt` lists every node as `id | name | year | cat | current prerequisites`,
sorted by category then year. Read ALL of it (use offset/limit reads).

For each node in YOUR categories (given in the task), decide whether it is
missing DIRECT prerequisites from anywhere in the index, especially from
other categories. Add only genuine, direct, historically accurate
dependencies: things without which the node could not have been built or
discovered. Typically 0–3 additions per node; many nodes need none. Do not
add grandparents of existing prerequisites. A prerequisite must have a year
less than or equal to the node's year.

Output: write ONE JSON file (path given in the task), an object mapping
node id to a list of ids to ADD:

    {"railway_bridge": ["bessemer_process"], "mri": ["superconducting_magnet"]}

Use only ids that appear in allnodes.txt, spelled exactly. Do not edit any
other file. Put any helper scripts in your own new folder named after your
output file; never reuse a shared filename.

Before finishing, verify with a short script that every key and value is a
known id and that each added prerequisite's year <= the node's year; fix
any that fail. Reply with only: number of nodes touched, number of edges
added, and 3 example additions.
