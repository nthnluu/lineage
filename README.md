# Lineage

A browsable technology tree. Around 3,200 inventions, from stone tools to large language models, each linked to the technologies it depended on and to its Wikipedia article.

Live at [lineage.luu.dev](https://lineage.luu.dev).

## Running locally

```
python3 build.py
python3 -m http.server --directory site
```

The data lives in `data/`. To check it, run `python3 validate.py --wiki site/techtree.json` after building.

## Corrections

Much of the dataset was drafted with AI assistance, and not every date and link has been reviewed yet. If you find an error, please open an issue or a pull request, ideally with a source.
