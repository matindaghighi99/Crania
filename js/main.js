/* CRANIA homepage interactions.
   Mobile nav · Join dialog · scroll reveal · orbital core tabs ·
   tilt cards · counting ledger · project showcase · magnetic buttons. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------- Mobile navigation ---------- */
  var navToggle = document.getElementById("nav-toggle");
  var siteNav = document.getElementById("site-nav");

  function closeNav() {
    if (!siteNav) return;
    siteNav.classList.remove("is-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () {
      var open = siteNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    siteNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && siteNav.classList.contains("is-open")) {
        closeNav();
        navToggle.focus();
      }
    });
  }

  /* ---------- Join CRANIA dialog ---------- */
  var joinDialog = document.getElementById("join-dialog");
  if (joinDialog) {
    document.querySelectorAll("[data-open-join]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeNav();
        if (typeof joinDialog.showModal === "function") joinDialog.showModal();
        else joinDialog.setAttribute("open", "");
      });
    });
    joinDialog.querySelectorAll("[data-close-join]").forEach(function (btn) {
      btn.addEventListener("click", function () { joinDialog.close(); });
    });
    joinDialog.addEventListener("click", function (e) {
      if (e.target === joinDialog) joinDialog.close();
    });
  }

  /* ---------- Orbital core selector (ARIA tabs) ---------- */
  (function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".orbit-dot"));
    var panels = Array.prototype.slice.call(document.querySelectorAll(".orbit-panel"));
    var bgLayers = Array.prototype.slice.call(document.querySelectorAll(".cores-bg-layer"));
    var spokes = Array.prototype.slice.call(document.querySelectorAll(".orbit-spoke"));
    if (!tabs.length) return;

    function select(idx, focus) {
      tabs.forEach(function (tab, i) {
        var active = i === idx;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[i].classList.toggle("is-active", active);
        if (active) { panels[i].hidden = false; }
        else { panels[i].hidden = true; }
        if (bgLayers[i]) bgLayers[i].classList.toggle("is-active", active);
        if (spokes[i]) spokes[i].classList.toggle("is-active", active);
      });
      if (focus) tabs[idx].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(i, false); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
  })();

  /* Scientist roster search/render/admin now lives in js/scientists-admin.js,
     since the grid is fetched from the API instead of static markup. */

  /* ---------- Tilt cards (mission / vision) ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-tilt]").forEach(function (card) {
      var inner = card.querySelector(".tilt-inner");
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        var rx = (0.5 - py) * 8;
        var ry = (px - 0.5) * 10;
        card.style.transform = "rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateY(-4px)";
        card.style.setProperty("--mx", (px * 100) + "%");
        card.style.setProperty("--my", (py * 100) + "%");
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- Counting ledger ---------- */
  (function () {
    var values = document.querySelectorAll(".ledger-value[data-count]");
    if (!values.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) return; // final values already in markup

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        obs.unobserve(el);
        var target = parseFloat(el.getAttribute("data-count"));
        var suffix = el.getAttribute("data-suffix") || "";
        var start = performance.now();
        var dur = 1400;
        function step(now) {
          var t = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(step);
          else el.textContent = target + suffix;
        }
        el.textContent = "0" + suffix;
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    values.forEach(function (v) { obs.observe(v); });
  })();

  /* ---------- Project showcase gallery ---------- */
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".showcase-slide"));
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".showcase-tab"));
    var prev = document.querySelector("[data-prev]");
    var next = document.querySelector("[data-next]");
    if (slides.length < 2) return;

    var current = 0;
    var timer = null;

    function go(idx) {
      idx = (idx + slides.length) % slides.length;
      slides[current].classList.remove("is-active");
      tabs[current].classList.remove("is-active");
      current = idx;
      slides[current].classList.add("is-active");
      tabs[current].classList.add("is-active");
    }
    function advance() { go(current + 1); }
    function restart() {
      if (timer) clearInterval(timer);
      if (!reduceMotion) timer = setInterval(advance, 6000);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { go(i); restart(); });
    });
    if (prev) prev.addEventListener("click", function () { go(current - 1); restart(); });
    if (next) next.addEventListener("click", function () { go(current + 1); restart(); });

    // Pause on hover / when offscreen.
    var showcase = document.querySelector(".showcase");
    if (showcase) {
      showcase.addEventListener("pointerenter", function () { if (timer) clearInterval(timer); });
      showcase.addEventListener("pointerleave", restart);
    }
    if ("IntersectionObserver" in window && showcase) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) restart();
        else if (timer) clearInterval(timer);
      }, { threshold: 0.2 }).observe(showcase);
    } else {
      restart();
    }
  })();

  /* ---------- Magnetic buttons ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".btn-magnetic").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = (e.clientX - r.left - r.width / 2) * 0.25;
        var my = (e.clientY - r.top - r.height / 2) * 0.35;
        btn.style.setProperty("--btn-x", mx + "px");
        btn.style.setProperty("--btn-y", my + "px");
      });
      btn.addEventListener("pointerleave", function () {
        btn.style.setProperty("--btn-x", "0px");
        btn.style.setProperty("--btn-y", "0px");
      });
    });
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    var targets = document.querySelectorAll(
      ".duality-card, .duality-emblem, .duality-blurb, .therapy-card, .ledger-row, .news-entry, .roster-card, .salon-card, .concierge-row, .orbital-stage, .orbital-panels"
    );
    targets.forEach(function (el) { el.classList.add("reveal"); });
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    targets.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + "ms";
      revObs.observe(el);
    });
  }
})();
