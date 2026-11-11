// Shared behaviour: mobile menu, reveal-on-scroll, count-up numbers.
(function () {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function countUp(el) {
    const target = Number(el.dataset.count || 0);
    const decimals = Number(el.dataset.decimals || 0);
    const fmt = (v) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (reduce) {
      el.textContent = fmt(target);
      return;
    }
    const start = performance.now();
    const dur = 1100;
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // reveal sections and run any one-time animation inside them
  window.pgfObserve = function (root) {
    const items = (root || document).querySelectorAll(".reveal, [data-count], [data-grow]");
    if (!("IntersectionObserver" in window) || reduce) {
      items.forEach((el) => {
        el.classList.add("is-visible");
        if (el.dataset.count) countUp(el);
        if (el.dataset.grow) el.style[el.dataset.growProp || "width"] = el.dataset.grow;
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add("is-visible");
          if (el.dataset.count) countUp(el);
          if (el.dataset.grow) el.style[el.dataset.growProp || "width"] = el.dataset.grow;
          io.unobserve(el);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" }
    );
    items.forEach((el) => io.observe(el));
  };
  window.pgfObserve();
})();
