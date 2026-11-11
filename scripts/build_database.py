"""Build the PGF-Explorer web data from the source files in raw_data/.

python scripts/build_database.py

Inputs (raw_data/):
  fulltext_records.csv   full-text records (the 310 meta-analysis studies and re-extracted database papers)
  abstract_records.csv   abstract-level records from the global abstract dataset
  evidence.csv           supporting quotes (record_id, field, quote)
Outputs (data/):
  bundle.js, stats.json   the browsing index loaded by the site
  details/<bucket>.json                      per-record details and supporting quotes, loaded when a record is opened
  pgf_explorer_records.csv                   full download of every record
"""
import json
import re
import shutil
from urllib.parse import quote_plus as requests_quote
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "raw_data", ROOT / "data"
BUCKET = 250                      # records per details file

LABEL = {"PHYLOGENY": "Phylogeny", "GENE_STRUCTURE": "Gene structure", "MOTIF": "Conserved motifs", "DOMAIN": "Conserved domains",
         "PHYSICOCHEMICAL": "Physicochemical properties", "SUBCELLULAR_PREDICTION": "Subcellular prediction",
         "CHROMOSOME_LOCATION": "Chromosome location", "DUPLICATION": "Gene duplication", "SYNTENY": "Synteny/collinearity",
         "KAKS": "Ka/Ks", "CIS_ELEMENTS": "Promoter cis-elements", "PROTEIN_STRUCTURE": "Protein structure",
         "PPI": "Protein interaction network", "MIRNA": "miRNA targeting", "GO_KEGG": "GO/KEGG annotation",
         "COEXPRESSION": "Co-expression", "SNP_HAPLOTYPE": "SNP/haplotype", "EVOLUTION_DIVERGENCE": "Divergence/evolution",
         "OVEREXPRESSION": "Overexpression", "KNOCKOUT": "Knockout/mutant", "SILENCING": "Silencing (VIGS/RNAi)",
         "Y2H": "Protein interaction assay", "SUBCELLULAR_LOCALIZATION": "Subcellular localization", "TRANSACTIVATION": "Transactivation/binding",
         "HETEROLOGOUS": "Heterologous expression", "ENZYME_ASSAY": "Enzyme assay", "PROMOTER_REPORTER": "Promoter reporter",
         "DROUGHT": "Drought", "SALT": "Salt", "COLD": "Cold", "HEAT": "Heat", "OSMOTIC": "Osmotic", "WATERLOGGING": "Waterlogging",
         "HEAVY_METAL": "Heavy metal", "NUTRIENT": "Nutrient", "LIGHT": "Light", "OXIDATIVE": "Oxidative", "ABA": "ABA",
         "HORMONE_OTHER": "Other hormones", "FUNGAL": "Fungal", "BACTERIAL": "Bacterial", "VIRAL": "Viral",
         "INSECT/NEMATODE": "Insect/nematode", "TISSUES": "Tissues/organs", "DEVELOPMENT": "Development", "OTHER": "Other"}
CLASS = {"TF": "Transcription factor", "enzyme": "Enzyme", "transporter/channel": "Transporter/channel",
         "kinase/receptor": "Kinase/receptor", "structural/other protein": "Structural/other protein", "mixed": "Mixed"}
COUNTRY = {"Türkiye": "Turkey", "USA": "United States", "UK": "United Kingdom", "Korea": "South Korea", "Republic of Korea": "South Korea"}
EMPTY = {"", "no", "not available", "not specified", "not stated", "nan", "none", "n/a", "not used"}
SMALL = {"and", "of", "the", "in", "for", "on", "a", "an", "to", "at", "by", "with", "from"}


def clean(v):
    v = re.sub(r"\s+", " ", str(v or "").replace("\xa0", " ")).strip()
    return "" if v.lower() in EMPTY else v


def split(v, sep=r"[,;]"):
    out = []
    for x in re.split(sep, str(v or "")):
        x = clean(x)
        if x and x not in out:
            out.append(x)
    return out


def num(v):
    m = re.search(r"\d[\d,]*", str(v or ""))
    return int(m.group().replace(",", "")) if m else None


def fnum(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def codes(v):
    return [LABEL.get(x.strip(), x.strip().title()) for x in str(v or "").split(";") if x.strip()]


def title_case(j):
    words = j.split()
    return " ".join(w if (i and w.lower() in SMALL) else (w if w.isupper() else w[:1].upper() + w[1:]) for i, w in enumerate(words))


def journal_name(j, preferred):
    j = clean(re.sub(r"\s*\((?:Basel|London|Clifton)[^)]*\)|\s*:\s*[A-Z]{2,}\s*$", "", str(j or "")))
    if not j:
        return ""
    return preferred.get(j.lower(), title_case(j) if j == j.lower() or j[1:] == j[1:].lower() else j)


def link(doi, pmid, title=""):
    if doi:
        return "https://doi.org/" + doi
    if pmid:
        return "https://pubmed.ncbi.nlm.nih.gov/" + pmid + "/"
    if title:                                       # no identifier: search the title
        return "https://scholar.google.com/scholar?q=" + requests_quote(title)
    return ""


ft = pd.read_csv(RAW / "fulltext_records.csv", dtype=str, keep_default_na=False)
ab = pd.read_csv(RAW / "abstract_records.csv", dtype=str, keep_default_na=False)
ev = pd.read_csv(RAW / "evidence.csv", dtype=str, keep_default_na=False)
preferred = {clean(j).lower(): clean(j) for j in ft.Journal if clean(j)}

records = []
YES = lambda v: str(v).strip().lower() == "yes"
for _, r in ft.iterrows():
    tools = [t for t in ["SMART", "CDD", "MEGA", "IQ-TREE", "MEME", "MCScanX", "TBTools"] if YES(r[t])]
    tools = (["HMMER"] if not clean(r["HMMER (with Pfam domains ID)"]).lower().startswith("no") and clean(r["HMMER (with Pfam domains ID)"]) else []) + \
            (["BLAST"] if clean(r["BLAST (E-value cut-off used)"]) else []) + ["TBtools" if t == "TBTools" else t for t in tools]
    for c in ["Other (Tools for Domain Analysis)", "Others (Tools for Motif Analysis)", "Other (Tools for Synteny)",
              "Other (Tools for Visualization)", "Other Tools Used In Methodology"]:
        tools += [t for t in split(r[c], r",") if t not in tools]
    blast = clean(r["BLAST (E-value cut-off used)"])
    m = re.search(r"\(([^)]+)\)", blast)
    records.append(dict(
        paper_id=int(r.record_id), level="full_text", meta=r.in_meta_analysis == "Yes",
        title=clean(r.Title), year=num(r.Year), journal=journal_name(r.Journal, preferred),
        country=COUNTRY.get(clean(r["Country of Origin"]), clean(r["Country of Origin"])) or "Not stated",
        doi=clean(r.DOI).lower(), pmid="", authors=split(r.Authors, r","),
        primary_organisms=split(r["Primary Organism"], r","), secondary_organisms=split(r["Secondary Organism"], r","),
        gene_families=split(r["Gene Family"], r",(?![^(]*\))"), family_class="",
        tools=tools, keywords=split(r.Keywords),
        rna_seq_used=YES(r["Expression Analysis (RNA-seq)"]), experimental_validation_qpcr=YES(r["Experimental Validation (qPCR)"]),
        microarray=YES(r["Expression (microarray/EST)"]),
        functional=codes(r.abstract_validation), conditions=codes(r.abstract_conditions), analyses=[],
        number_of_genes_identified=num(r["Number of Genes Identified"]), genes_per_species=clean(r["Genes per species"]),
        phylogenetic_structure=clean(r["Phylogenetic Structure"]),
        duplication_summary=clean(r["Gene Duplication Events (TANDEM/SEGMENTAL)"]),
        blast_threshold=(m.group(1) if m and m.group(1) != "not specified" else ("Not stated" if blast else "BLAST not used")),
        pfam_ids=re.findall(r"PF\d{5}", r["HMMER (with Pfam domains ID)"]),
        hmmer=clean(r["HMMER (with Pfam domains ID)"]) or "No",
        genome_sources=split(r["Genome Source"], r"[,;]"), selection=clean(r.abstract_selection), key_genes=clean(r.abstract_key_genes),
        cited_by=num(r.abstract_cited_by), fwci=fnum(r.abstract_fwci)))
for _, r in ab.iterrows():
    exp = str(r.expression)
    records.append(dict(
        paper_id=int(r.record_id), level="abstract", meta=False,
        title=clean(r.Title), year=num(r.Year), journal=journal_name(r.Journal, preferred),
        country=COUNTRY.get(clean(r.country), clean(r.country)) or "Not stated",
        doi=clean(r.DOI).lower(), pmid=clean(r.PMID), authors=split(r.Authors, r","),
        primary_organisms=split(r.organisms, r","), secondary_organisms=[],
        gene_families=split(r.gene_family, r",(?![^(]*\))"), family_class=CLASS.get(r.family_class, ""),
        tools=[], keywords=[],
        rna_seq_used=True if "RNA_SEQ" in exp else None, experimental_validation_qpcr=True if "QRT_PCR" in exp else None,
        microarray=True if "MICROARRAY" in exp else None,
        functional=codes(r.validation), conditions=codes(r.conditions), analyses=codes(r.analyses),
        number_of_genes_identified=num(r.genes_total), genes_per_species="", phylogenetic_structure=clean(r.groups),
        duplication_summary=clean(r.duplication), blast_threshold="", pfam_ids=[], hmmer="",
        genome_sources=[], selection=clean(r.selection), key_genes=clean(r.key_genes),
        cited_by=num(r.cited_by), fwci=fnum(r.fwci)))
for rec in records:
    rec["link"] = link(rec["doi"], rec["pmid"], rec["title"])
    rec["link_type"] = "doi" if rec["doi"] else ("pubmed" if rec["pmid"] else "search")

ids = [r["paper_id"] for r in records]
assert len(ids) == len(set(ids)), "duplicate record ids"

# ---------------------------------------------------------------- browsing index (compact) and details (on demand)
DETAIL = ["authors", "secondary_organisms", "keywords", "genes_per_species", "duplication_summary",
          "blast_threshold", "pfam_ids", "hmmer", "genome_sources", "selection", "key_genes", "analyses", "fwci"]
index, details = [], defaultdict(dict)
quotes = defaultdict(list)
for r in ev.itertuples():
    quotes[int(r.record_id)].append({"field": r.field, "quote": r.quote})
for rec in records:
    item = {k: v for k, v in rec.items() if k not in DETAIL}
    item["authors"] = rec["authors"][:3] + (["et al."] if len(rec["authors"]) > 3 else [])
    item["tools"] = rec["tools"]
    index.append(item)
    d = {k: rec[k] for k in DETAIL}
    d["evidence"] = quotes.get(rec["paper_id"], [])
    details[rec["paper_id"] // BUCKET][rec["paper_id"]] = d


def top(items, n=10):
    return [{"label": k, "count": v} for k, v in Counter(items).most_common(n)]


full = [r for r in records if r["level"] == "full_text"]
absr = [r for r in records if r["level"] == "abstract"]
stats = {
    "total_papers": len(records), "fulltext_papers": len(full), "abstract_papers": len(absr),
    "meta_analysis_papers": sum(r["meta"] for r in records),
    "total_organisms": len({o for r in records for o in r["primary_organisms"]}),
    "total_gene_families": len({f for r in records for f in r["gene_families"]}),
    "total_journals": len({r["journal"] for r in records if r["journal"]}),
    "total_countries": len({r["country"] for r in records if r["country"] != "Not stated"}),
    "total_tools": len({t for r in full for t in r["tools"]}),
    "rna_seq_rate": round(100 * sum(r["rna_seq_used"] is True for r in full) / len(full), 1),
    "qPCR_rate": round(100 * sum(r["experimental_validation_qpcr"] is True for r in full) / len(full), 1),
    "abstract_rna_seq_rate": round(100 * sum(r["rna_seq_used"] is True for r in absr) / max(len(absr), 1), 1),
    "abstract_qPCR_rate": round(100 * sum(r["experimental_validation_qpcr"] is True for r in absr) / max(len(absr), 1), 1),
    "functional_rate": round(100 * sum(bool(r["functional"]) for r in absr) / max(len(absr), 1), 1),
    "linked_papers": sum(bool(r["link"]) for r in records),
    "year_range": [min(r["year"] for r in records if r["year"]), max(r["year"] for r in records if r["year"])],
    "top_countries": top([r["country"] for r in records if r["country"] != "Not stated"]),
    "top_journals": top([r["journal"] for r in records if r["journal"]]),
    "top_organisms": top([o for r in records for o in r["primary_organisms"]]),
    "top_gene_families": top([f for r in records for f in r["gene_families"]]),
    "top_tools_fulltext": top([t for r in full for t in r["tools"]]),
    "top_conditions": top([c for r in records for c in r["conditions"]], 8),
    "top_functional": top([c for r in records for c in r["functional"]], 6),
    "family_classes": top([r["family_class"] for r in absr if r["family_class"]], 8),
    "years": {str(y): {"full_text": sum(1 for r in full if r["year"] == y), "abstract": sum(1 for r in absr if r["year"] == y)}
              for y in sorted({r["year"] for r in records if r["year"]})},
    "evidence_quotes": int(len(ev)),
    "records_with_quotes": len(quotes),
    "with_gene_count": sum(r["number_of_genes_identified"] is not None for r in records),
    "median_genes": float(pd.Series([r["number_of_genes_identified"] for r in records if r["number_of_genes_identified"] is not None]).median()),
}

OUT.mkdir(exist_ok=True)
for old in OUT.glob("*.json"):
    old.unlink()
if (OUT / "details").exists():
    shutil.rmtree(OUT / "details")
(OUT / "details").mkdir()
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
(OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
(OUT / "bundle.js").write_text("window.__GENE_FAMILY_DB__=" + dump({"stats": stats, "searchIndex": index, "bucket": BUCKET}) + ";\n",
                               encoding="utf-8")
for b, recs in details.items():
    (OUT / "details" / f"{b}.json").write_text(dump(recs), encoding="utf-8")

flat = []
for rec in records:
    row = {k: ("; ".join(map(str, v)) if isinstance(v, list) else v) for k, v in rec.items()}
    for k in ("rna_seq_used", "experimental_validation_qpcr", "microarray"):
        row[k] = "Yes" if rec[k] else "Not reported"
    flat.append(row)
pd.DataFrame(flat).drop(columns=["level"]).to_csv(OUT / "pgf_explorer_records.csv", index=False, encoding="utf-8-sig")


def bib(rec):
    first = (rec["authors"][0].split()[-1] if rec["authors"] else "anon").lower()
    key = re.sub(r"[^a-z0-9]", "", first) + str(rec["year"] or "") + "_" + str(rec["paper_id"])
    fields = [("author", " and ".join(rec["authors"])), ("title", "{" + rec["title"] + "}"), ("journal", rec["journal"]),
              ("year", rec["year"]), ("doi", rec["doi"])]
    body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v)
    return f"@article{{{key},\n{body}\n}}"


EXAMPLE_ID = 1
ex = next(r for r in index if r["paper_id"] == EXAMPLE_ID)
(OUT / "landing_example.json").write_text(dump({"record": ex, "details": details[EXAMPLE_ID // BUCKET][EXAMPLE_ID]}), encoding="utf-8")
(OUT / "pgf_explorer_citations.bib").write_text("\n\n".join(bib(r) for r in records) + "\n", encoding="utf-8")
# file sizes for the downloads page
sizes = {f"./{f}": (ROOT / f).stat().st_size for f in ["data/pgf_explorer_records.csv", "data/pgf_explorer_citations.bib",
         "raw_data/evidence.csv", "raw_data/fulltext_records.csv", "raw_data/abstract_records.csv"] if (ROOT / f).exists()}
stats["file_sizes"] = sizes
(OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(records)} records ({len(full)} full text, {len(absr)} abstract) | bundle {(OUT / 'bundle.js').stat().st_size / 1e6:.1f} MB"
      f" | details {sum(p.stat().st_size for p in (OUT / 'details').glob('*.json')) / 1e6:.1f} MB in {len(details)} files")
