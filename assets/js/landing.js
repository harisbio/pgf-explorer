// Landing page: fills numbers and charts from data/stats.json and an example record from its details file.
(function () {
  const esc = (v) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmt = (n) => Number(n).toLocaleString();

  function hbars(el, items, param, italic) {
    const max = Math.max(...items.map((i) => i.count), 1);
    el.innerHTML = items
      .map((i) => {
        const href = param ? `./explorer.html?${param}=${encodeURIComponent(i.label)}` : "./explorer.html";
        return `<li class="hbar"><a href="${href}" title="Open ${esc(i.label)} in the Explorer">
          <span class="hbar__label ${italic ? "is-italic" : ""}">${esc(i.label)}</span>
          <span class="hbar__track"><span class="hbar__fill" data-grow="${((i.count / max) * 100).toFixed(1)}%"></span></span>
          <span class="hbar__n">${fmt(i.count)}</span></a></li>`;
      })
      .join("");
  }

  function years(stats) {
    const entries = Object.entries(stats.years).filter(([y]) => +y >= 2000 && +y <= 2025);
    const max = Math.max(...entries.map(([, v]) => v.full_text + v.abstract), 1);
    const box = document.getElementById("years");
    box.innerHTML = entries
      .map(([y, v]) => {
        const total = v.full_text + v.abstract;
        const h = ((total / max) * 100).toFixed(1);
        return `<div class="years__col" data-year="${y}" data-total="${total}">
          <div class="years__stack" data-grow="${h}%" data-grow-prop="height"><span class="years__ft" style="flex:1"></span></div></div>`;
      })
      .join("");
    document.getElementById("yearsAxis").innerHTML = entries
      .map(([y], i) => `<span>${i % 5 === 0 || i === entries.length - 1 ? y : ""}</span>`)
      .join("");
    const tip = document.getElementById("tip");
    box.addEventListener("mousemove", (e) => {
      const col = e.target.closest(".years__col");
      if (!col) return tip.classList.remove("is-on");
      const d = col.dataset;
      tip.innerHTML = `<strong>${d.year}</strong>: ${fmt(d.total)} papers`;
      const r = col.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2 + window.scrollX}px`;
      tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
      tip.classList.add("is-on");
    });
    box.addEventListener("mouseleave", () => tip.classList.remove("is-on"));
  }

  const FIELDS = [
    ["Gene family", (p) => p.gene_families.join(", "), ["Gene Family"]],
    ["Species", (p) => p.primary_organisms.join(", "), ["Primary Organism"], true],
    ["Genes identified", (p) => p.number_of_genes_identified, ["Number of Genes Identified"]],
    ["Phylogenetic groups", (p) => p.phylogenetic_structure, ["Phylogenetic Structure"]],
    ["Genome source", (p, d) => (d.genome_sources || []).join(", "), ["Genome Source"]],
    ["BLAST E-value", (p, d) => d.blast_threshold, ["BLAST (E-value cut-off used)"]],
    ["Duplication", (p, d) => d.duplication_summary, ["Gene Duplication Events (TANDEM/SEGMENTAL)"]],
  ];

  async function example() {
    const ex = await fetch("./data/landing_example.json").then((r) => r.json());
    const p = ex.record;
    const d = ex.details || {};
    if (!p) return;
    document.getElementById("recTitle").textContent = p.title;
    document.getElementById("recMeta").innerHTML = `${p.year} · <i>${esc(p.journal)}</i> · ${esc(p.country)} · ${
      p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Open article</a>` : ""}`;
    const quotes = d.evidence || [];
    const rows = FIELDS.map(([label, get, keys, italic]) => {
      const value = get(p, d);
      const q = quotes.find((e) => keys.includes(e.field));
      return value && q ? { label, value, quote: q.quote, italic } : null;
    }).filter(Boolean);
    const dl = document.getElementById("recFields");
    dl.innerHTML = rows
      .map((r, i) => `<div class="field-row" tabindex="0" data-i="${i}"><dt>${r.label}</dt><dd>${r.italic ? `<i>${esc(r.value)}</i>` : esc(r.value)}</dd></div>`)
      .join("");
    const quoteEl = document.getElementById("recQuote");
    const show = (i) => {
      const r = rows[i];
      dl.querySelectorAll(".field-row").forEach((el) => el.classList.toggle("is-active", +el.dataset.i === i));
      const words = String(r.value).split(/[,\s()]+/).filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      let html = esc(r.quote);
      if (words.length) html = html.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>");
      quoteEl.style.opacity = 0;
      setTimeout(() => {
        quoteEl.innerHTML = `“${html}”`;
        quoteEl.style.opacity = 1;
      }, 120);
      document.getElementById("recHint").textContent = `Supports: ${r.label} = ${r.value}`;
    };
    dl.addEventListener("mouseover", (e) => {
      const row = e.target.closest(".field-row");
      if (row) show(+row.dataset.i);
    });
    dl.addEventListener("focusin", (e) => {
      const row = e.target.closest(".field-row");
      if (row) show(+row.dataset.i);
    });
    if (rows.length) show(0);
  }

  fetch("./data/stats.json")
    .then((r) => r.json())
    .then((stats) => {
      document.querySelectorAll("[data-key]").forEach((el) => (el.dataset.count = stats[el.dataset.key] ?? 0));
      document.querySelectorAll("[data-text]").forEach((el) => (el.textContent = fmt(stats[el.dataset.text] ?? "")));
      document.getElementById("leadPapers").textContent = fmt(stats.total_papers);
      years(stats);
      hbars(document.getElementById("families"), stats.top_gene_families.slice(0, 8), "family");
      hbars(document.getElementById("species"), stats.top_organisms.slice(0, 8), "species", true);
      hbars(document.getElementById("conditions"), stats.top_conditions.slice(0, 8), "condition");
      hbars(document.getElementById("countries"), stats.top_countries.slice(0, 8), "country");
      if (window.pgfObserve) window.pgfObserve();
    });

  example();
})();
