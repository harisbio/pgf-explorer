# PGF-Explorer data dictionary

Every paper is one record. Studies of the meta-analysis are marked with `meta = true`.

## Files

| File | Contents |
|---|---|
| `data/pgf_explorer_records.csv` | complete download: one row per record, all fields |
| `data/pgf_explorer_citations.bib` | BibTeX entry for every paper |
| `raw_data/evidence.csv` | supporting quotes: `record_id`, `field`, `quote` |
| `raw_data/*_records.csv` | source records the site is built from |
| `data/bundle.js` | browsing index loaded by the site |
| `data/details/<n>.json` | per-record details and quotes for records with `paper_id // 250 == n` |
| `data/stats.json` | summary counts |

## Record fields

| Field | Meaning |
|---|---|
| `paper_id` | record ID |
| `meta` | study is included in the meta-analysis |
| `title`, `year`, `journal`, `authors` | bibliographic details (Crossref / OpenAlex) |
| `doi`, `pmid`, `link`, `link_type` | article link: DOI, else PubMed, else a title search |
| `country` | country of the corresponding author |
| `primary_organisms` | species in which the family was identified |
| `secondary_organisms` | species used only for comparison |
| `gene_families`, `family_class` | standardized family names; family type |
| `number_of_genes_identified`, `genes_per_species` | genes identified (sum over study species), and per species |
| `phylogenetic_structure` | groups in the phylogenetic classification |
| `duplication_summary`, `selection` | duplication types; Ka/Ks selection |
| `rna_seq_used`, `experimental_validation_qpcr`, `microarray` | expression evidence: "Yes" or "Not reported" |
| `functional`, `conditions`, `key_genes` | functional experiments, conditions studied and key genes |
| `tools`, `analyses`, `hmmer`, `pfam_ids`, `blast_threshold`, `genome_sources`, `keywords` | methods and tools |
| `cited_by`, `fwci` | citations and field-weighted citation impact (OpenAlex) |
| `evidence` (details files) | the sentence each value was taken from |

## Missing information

An empty field, or "Not reported", means the extracted text does not report the item. The study may still have done
it, so shares of methods are lower limits.
