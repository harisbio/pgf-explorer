// Explorer: faceted filters with live counts, sortable columns, expandable rows with supporting quotes.
// URL parameters pre-select filters: ?q=, ?family=, ?species=, ?country=, ?condition=, ?journal=, ?meta=1
const { searchIndex: DATA, bucket: BUCKET = 250 } = window.__GENE_FAMILY_DB__;

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const yn = (v) => (v === true ? "Yes" : "—");

// ---------------------------------------------------------------- columns
const COLUMNS = [
  { key: "paper_id", label: "ID", get: (p) => p.paper_id, num: true, on: true },
  { key: "year", label: "Year", get: (p) => p.year ?? "", num: true, on: true },
  { key: "title", label: "Title", get: (p) => p.title, on: true, wide: true },
  { key: "family", label: "Gene family", get: (p) => (p.gene_families || []).join(", "), on: true },
  { key: "species", label: "Species", get: (p) => (p.primary_organisms || []).join(", "), on: true, italic: true },
  { key: "genes", label: "Genes", get: (p) => p.number_of_genes_identified ?? "", num: true, on: true },
  { key: "rna", label: "RNA-seq", get: (p) => yn(p.rna_seq_used, p), on: true },
  { key: "qpcr", label: "qPCR", get: (p) => yn(p.experimental_validation_qpcr, p), on: true },
  { key: "journal", label: "Journal", get: (p) => p.journal, on: false },
  { key: "country", label: "Country", get: (p) => p.country, on: false },
  { key: "dup", label: "Duplication", get: (p) => p.duplication_summary, on: false },
  { key: "functional", label: "Functional tests", get: (p) => (p.functional || []).join(", "), on: false },
  { key: "cites", label: "Citations", get: (p) => p.cited_by ?? "", num: true, on: false },
  { key: "link", label: "Article", get: (p) => p.link, on: true, link: true },
];

// ---------------------------------------------------------------- facets
const FACETS = [
  { key: "meta", label: "Meta-analysis", values: (p) => (p.meta ? ["In the meta-analysis"] : []), open: true },
  { key: "family", label: "Gene family", values: (p) => p.gene_families || [], open: true, search: true },
  { key: "species", label: "Species", values: (p) => p.primary_organisms || [], open: true, search: true, italic: true },
  { key: "country", label: "Country", values: (p) => (p.country && p.country !== "Not stated" ? [p.country] : []), search: true },
  {
    key: "evidence",
    label: "Expression and validation",
    values: (p) =>
      [
        p.rna_seq_used === true && "RNA-seq",
        p.experimental_validation_qpcr === true && "RT-qPCR",
        (p.functional || []).length && "Functional experiment",
      ].filter(Boolean),
    open: true,
  },
  { key: "conditions", label: "Condition studied", values: (p) => p.conditions || [], search: true },
  { key: "journal", label: "Journal", values: (p) => (p.journal ? [p.journal] : []), search: true },
];

const state = {
  q: "",
  sel: Object.fromEntries(FACETS.map((f) => [f.key, new Set()])),
  yearFrom: "",
  yearTo: "",
  sort: { key: "year", dir: -1 },
  page: 0,
  pageSize: 50,
  open: new Set(),
  facetQuery: {},
  facetMore: new Set(),
  cols: new Set(COLUMNS.filter((c) => c.on).map((c) => c.key)),
};

// text index built once
const TEXT = new Map(
  DATA.map((p) => [
    p.paper_id,
    [p.title, p.journal, p.country, p.doi, ...(p.authors || []), ...(p.gene_families || []), ...(p.primary_organisms || []),
      ...(p.tools || []), ...(p.conditions || [])].join(" ").toLowerCase(),
  ])
);

function passes(p, skipFacet) {
  if (state.q) {
    const t = TEXT.get(p.paper_id);
    if (!state.q.split(/\s+/).every((w) => t.includes(w))) return false;
  }
  if (state.yearFrom && (p.year ?? 0) < +state.yearFrom) return false;
  if (state.yearTo && (p.year ?? 9999) > +state.yearTo) return false;
  for (const f of FACETS) {
    if (f.key === skipFacet) continue;
    const s = state.sel[f.key];
    if (!s.size) continue;
    const vals = f.values(p);
    if (!vals.some((v) => s.has(v))) return false;
  }
  return true;
}

function filtered() {
  const items = DATA.filter((p) => passes(p));
  const col = COLUMNS.find((c) => c.key === state.sort.key);
  const d = state.sort.dir;
  items.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (col.num) return ((x === "" ? -Infinity : x) - (y === "" ? -Infinity : y)) * d || a.paper_id - b.paper_id;
    return String(x).localeCompare(String(y)) * d;
  });
  return items;
}

// ---------------------------------------------------------------- render: facets
function renderFacets() {
  const html = [];
  html.push(`
    <div class="tb-facet">
      <div class="tb-facet__title">Year</div>
      <div class="tb-years">
        <input type="number" id="yearFrom" placeholder="From" value="${esc(state.yearFrom)}" />
        <span>to</span>
        <input type="number" id="yearTo" placeholder="To" value="${esc(state.yearTo)}" />
      </div>
    </div>`);
  for (const f of FACETS) {
    const counts = new Map();
    for (const p of DATA) {
      if (!passes(p, f.key)) continue;
      for (const v of new Set(f.values(p))) counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const v of state.sel[f.key]) if (!counts.has(v)) counts.set(v, 0);
    let entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const fq = (state.facetQuery[f.key] || "").toLowerCase();
    if (fq) entries = entries.filter(([v]) => v.toLowerCase().includes(fq));
    const limit = state.facetMore.has(f.key) ? 60 : 8;
    const shown = entries.slice(0, limit);
    html.push(`
      <details class="tb-facet" ${f.open || state.sel[f.key].size ? "open" : ""} data-facet="${f.key}">
        <summary class="tb-facet__title">${f.label}${state.sel[f.key].size ? ` <span class="tb-badge">${state.sel[f.key].size}</span>` : ""}</summary>
        ${f.search ? `<input class="tb-facet__search" data-fsearch="${f.key}" type="search" placeholder="Find ${f.label.toLowerCase()}" value="${esc(state.facetQuery[f.key] || "")}" />` : ""}
        <ul class="tb-facet__list">
          ${shown
            .map(
              ([v, n]) => `
            <li><label class="${n ? "" : "is-zero"}">
              <input type="checkbox" data-facet-key="${f.key}" value="${esc(v)}" ${state.sel[f.key].has(v) ? "checked" : ""} />
              <span class="tb-facet__val ${f.italic ? "is-italic" : ""}">${esc(v)}</span>
              <span class="tb-facet__n">${n.toLocaleString()}</span>
            </label></li>`
            )
            .join("")}
        </ul>
        ${entries.length > limit ? `<button type="button" class="tb-link" data-more="${f.key}">Show more (${(entries.length - limit).toLocaleString()})</button>` : ""}
        ${state.facetMore.has(f.key) ? `<button type="button" class="tb-link" data-less="${f.key}">Show fewer</button>` : ""}
      </details>`);
  }
  document.getElementById("facetList").innerHTML = html.join("");
}

// ---------------------------------------------------------------- render: table
function renderHead() {
  const cols = COLUMNS.filter((c) => state.cols.has(c.key));
  document.getElementById("thead").innerHTML = `<tr>${cols
    .map((c) => {
      const active = state.sort.key === c.key;
      const arrow = active ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
      return `<th class="${c.num ? "is-num" : ""} ${c.wide ? "is-wide" : ""}" aria-sort="${active ? (state.sort.dir > 0 ? "ascending" : "descending") : "none"}">
        ${c.link ? c.label : `<button type="button" data-sort="${c.key}">${c.label}${arrow}</button>`}</th>`;
    })
    .join("")}</tr>`;
}

function cell(c, p) {
  const v = c.get(p);
  if (c.key === "title") {
    return `<button type="button" class="tb-title" data-toggle="${p.paper_id}" aria-expanded="${state.open.has(p.paper_id)}">${esc(v)}</button>
      ${p.meta ? `<span class="tb-tag">Meta-analysis</span>` : ""}`;
  }
  if (c.link) return v ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${p.link_type === "search" ? "Find" : "Open"}</a>` : "";
  if (c.key === "rna" || c.key === "qpcr") return `<span class="tb-yn tb-yn--${v === "Yes" ? "yes" : "na"}" title="${v === "—" ? "Not reported" : v}">${v}</span>`;
  if (c.key === "species") {
    const sp = p.primary_organisms || [];
    return `<i>${esc(sp.slice(0, 2).join(", "))}</i>${sp.length > 2 ? ` <span class="tb-muted">+${sp.length - 2} more</span>` : ""}`;
  }
  return c.italic ? `<i>${esc(v)}</i>` : esc(v);
}

const detailCache = new Map();
async function loadDetails(id) {
  const b = Math.floor(id / BUCKET);
  if (!detailCache.has(b)) detailCache.set(b, fetch(`./data/details/${b}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return (await detailCache.get(b))[id] || null;
}

function detailHtml(p, d) {
  const quote = (...f) => {
    const q = (d?.evidence || []).find((e) => f.includes(e.field));
    return q ? `<blockquote>${esc(q.quote)}</blockquote>` : "";
  };
  const row = (label, value, q = "") =>
    `<div class="tb-d"><dt>${label}</dt><dd>${value || '<span class="tb-muted">Not reported</span>'}${q}</dd></div>`;
  // optional rows are shown only when the record has a value
  const opt = (label, value, q = "") => (value ? row(label, value, q) : "");
  const list = (a) => esc((a || []).join(", "));
  const methods = [...new Set([...(p.tools || []), ...(d?.analyses || [])])];
  return `
    <div class="tb-detail">
      <p class="tb-detail__meta">${esc((d?.authors || []).join(", "))}${p.journal ? ` · <i>${esc(p.journal)}</i>` : ""}${p.year ? ` (${p.year})` : ""}${p.doi ? ` · DOI ${esc(p.doi)}` : ""}</p>
      <dl class="tb-dl">
        ${row("Gene family", esc((p.gene_families || []).join(", ")) + (p.family_class ? ` <span class="tb-muted">(${esc(p.family_class)})</span>` : ""), quote("Gene Family", "gene_family"))}
        ${row("Species", `<i>${esc((p.primary_organisms || []).join(", "))}</i>`, quote("Primary Organism", "organisms"))}
        ${row("Genes identified", (p.number_of_genes_identified ?? "") + (d?.genes_per_species ? ` (${esc(d.genes_per_species)})` : ""), quote("Number of Genes Identified", "genes_total"))}
        ${opt("Phylogenetic groups", esc(p.phylogenetic_structure), quote("Phylogenetic Structure", "groups"))}
        ${opt("Duplication", esc(d?.duplication_summary), quote("Gene Duplication Events (TANDEM/SEGMENTAL)", "duplication"))}
        ${row("Expression", `RNA-seq: ${yn(p.rna_seq_used)} · RT-qPCR: ${yn(p.experimental_validation_qpcr)} · Microarray/EST: ${yn(p.microarray)}`)}
        ${opt("Functional experiments", list(p.functional))}
        ${opt("Conditions", list(p.conditions))}
        ${opt("Methods and tools", esc(methods.join(", ")))}
        ${opt("Genome source", list(d?.genome_sources), quote("Genome Source"))}
        ${opt("HMMER / Pfam", esc(d?.hmmer), quote("HMMER (with Pfam domains ID)"))}
        ${opt("BLAST E-value", esc(d?.blast_threshold), quote("BLAST (E-value cut-off used)"))}
        ${(d?.secondary_organisms || []).length ? row("Reference species", `<i>${list(d.secondary_organisms)}</i>`) : ""}
        ${d?.key_genes ? row("Key genes", esc(d.key_genes), quote("key_genes")) : ""}
        ${p.cited_by != null ? row("Citations", `${p.cited_by}${d?.fwci != null ? ` (FWCI ${d.fwci})` : ""}`) : ""}
      </dl>
      <p class="tb-muted tb-small">Indented text is the sentence each value was taken from.</p>
    </div>`;
}

async function renderTable() {
  const items = filtered();
  const pages = Math.max(1, Math.ceil(items.length / state.pageSize));
  state.page = Math.min(state.page, pages - 1);
  const slice = items.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
  const cols = COLUMNS.filter((c) => state.cols.has(c.key));
  document.getElementById("count").textContent = `${items.length.toLocaleString()} of ${DATA.length.toLocaleString()} papers`;
  document.getElementById("pageInfo").textContent = `Page ${state.page + 1} of ${pages}`;
  document.getElementById("prev").disabled = state.page === 0;
  document.getElementById("next").disabled = state.page >= pages - 1;
  const rows = [];
  for (const p of slice) {
    rows.push(`<tr class="${state.open.has(p.paper_id) ? "is-open" : ""}">${cols
      .map((c) => `<td class="${c.num ? "is-num" : ""} ${c.wide ? "is-wide" : ""}">${cell(c, p)}</td>`)
      .join("")}</tr>`);
    if (state.open.has(p.paper_id)) rows.push(`<tr class="tb-detailrow"><td colspan="${cols.length}" data-detail="${p.paper_id}">Loading…</td></tr>`);
  }
  document.getElementById("tbody").innerHTML = rows.join("") || `<tr><td colspan="${cols.length}" class="tb-empty">No papers match these filters.</td></tr>`;
  for (const td of document.querySelectorAll("[data-detail]")) {
    const p = DATA.find((x) => x.paper_id === +td.dataset.detail);
    td.innerHTML = detailHtml(p, await loadDetails(p.paper_id));
  }
}

function renderChips() {
  const chips = [];
  if (state.q) chips.push(["q", "", `“${state.q}”`]);
  if (state.yearFrom || state.yearTo) chips.push(["year", "", `${state.yearFrom || "…"}–${state.yearTo || "…"}`]);
  for (const f of FACETS) for (const v of state.sel[f.key]) chips.push([f.key, v, `${f.label}: ${v}`]);
  document.getElementById("chips").innerHTML = chips
    .map(([k, v, t]) => `<button type="button" class="tb-chip" data-chip="${k}" data-val="${esc(v)}">${esc(t)} ×</button>`)
    .join("");
}

function renderColumns() {
  document.getElementById("columnChooser").innerHTML = COLUMNS.map(
    (c) => `<label><input type="checkbox" data-col="${c.key}" ${state.cols.has(c.key) ? "checked" : ""} /> ${c.label}</label>`
  ).join("");
}

function render(all = true) {
  if (all) renderFacets();
  renderChips();
  renderHead();
  renderTable();
}

// ---------------------------------------------------------------- events
let timer;
document.getElementById("q").addEventListener("input", (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.q = e.target.value.trim().toLowerCase();
    state.page = 0;
    render();
  }, 180);
});

document.getElementById("facetList").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.facetKey) {
    const s = state.sel[t.dataset.facetKey];
    t.checked ? s.add(t.value) : s.delete(t.value);
  } else if (t.id === "yearFrom" || t.id === "yearTo") {
    state[t.id] = t.value;
  } else return;
  state.page = 0;
  render();
});

document.getElementById("facetList").addEventListener("input", (e) => {
  const k = e.target.dataset.fsearch;
  if (!k) return;
  state.facetQuery[k] = e.target.value;
  const pos = e.target.selectionStart;
  renderFacets();
  const el = document.querySelector(`[data-fsearch="${k}"]`);
  el.focus();
  el.setSelectionRange(pos, pos);
});

document.getElementById("facetList").addEventListener("click", (e) => {
  const more = e.target.dataset.more, less = e.target.dataset.less;
  if (more) state.facetMore.add(more);
  if (less) state.facetMore.delete(less);
  if (more || less) renderFacets();
});

document.getElementById("chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-chip]");
  if (!b) return;
  const k = b.dataset.chip;
  if (k === "q") {
    state.q = "";
    document.getElementById("q").value = "";
  } else if (k === "year") {
    state.yearFrom = state.yearTo = "";
  } else state.sel[k].delete(b.dataset.val);
  state.page = 0;
  render();
});

document.getElementById("clearAll").addEventListener("click", () => {
  state.q = "";
  document.getElementById("q").value = "";
  state.yearFrom = state.yearTo = "";
  for (const s of Object.values(state.sel)) s.clear();
  state.page = 0;
  render();
});

document.getElementById("thead").addEventListener("click", (e) => {
  const k = e.target.closest("[data-sort]")?.dataset.sort;
  if (!k) return;
  state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : COLUMNS.find((c) => c.key === k).num ? -1 : 1 };
  render(false);
});

document.getElementById("tbody").addEventListener("click", (e) => {
  const id = +e.target.closest("[data-toggle]")?.dataset.toggle;
  if (!id) return;
  state.open.has(id) ? state.open.delete(id) : state.open.add(id);
  renderTable();
});

document.getElementById("columnChooser").addEventListener("change", (e) => {
  const k = e.target.dataset.col;
  e.target.checked ? state.cols.add(k) : state.cols.delete(k);
  render(false);
});

document.getElementById("prev").addEventListener("click", () => {
  state.page--;
  renderTable();
  window.scrollTo({ top: 0 });
});
document.getElementById("next").addEventListener("click", () => {
  state.page++;
  renderTable();
  window.scrollTo({ top: 0 });
});
document.getElementById("pageSize").addEventListener("change", (e) => {
  state.pageSize = +e.target.value;
  state.page = 0;
  renderTable();
});

document.getElementById("download").addEventListener("click", () => {
  const cols = COLUMNS.filter((c) => state.cols.has(c.key));
  const lines = [cols.map((c) => c.label).join(",")].concat(
    filtered().map((p) => cols.map((c) => `"${String(c.get(p) ?? "").replace(/"/g, '""')}"`).join(","))
  );
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "pgf_explorer_view.csv" });
  a.click();
  URL.revokeObjectURL(url);
});

// filters passed in the address (links from the home page)
const params = new URLSearchParams(location.search);
if (params.get("q")) {
  state.q = params.get("q").trim().toLowerCase();
  document.getElementById("q").value = params.get("q");
}
for (const [param, facet] of [["family", "family"], ["species", "species"], ["country", "country"], ["condition", "conditions"], ["journal", "journal"]]) {
  for (const v of params.getAll(param)) state.sel[facet].add(v);
}
if (params.get("meta")) state.sel.meta.add("In the meta-analysis");

renderColumns();
render();
