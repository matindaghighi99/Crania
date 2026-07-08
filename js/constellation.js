/* CRANIA scientists — "Constellation of Minds".
   All 64 scientist portraits orbit as nodes on a 3D Fibonacci sphere,
   linked by synapse lines. Drag to rotate, hover to identify, click to
   open the profile. Data is read from the roster grid — single source
   of truth, no duplication. No dependencies. */
(function () {
  "use strict";

  var canvas = document.getElementById("sci-canvas");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var hero = canvas.closest(".sci-hero");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, narrow = false;

  /* ---------- Data: read the roster ---------- */
  var nodes = [];
  var cards = document.querySelectorAll("#sci-grid .sci-card a");
  if (cards.length === 0) return;

  var GOLDEN = Math.PI * (3 - Math.sqrt(5));
  var N = cards.length;

  Array.prototype.forEach.call(cards, function (a, i) {
    // Fibonacci sphere distribution — evenly spaced minds.
    var y = 1 - 2 * (i + 0.5) / N;
    var r = Math.sqrt(Math.max(1 - y * y, 0));
    var t = i * GOLDEN;
    var img = a.querySelector("img");
    var name = a.querySelector(".sci-name").textContent.trim();
    nodes.push({
      x: r * Math.cos(t), y: y, z: r * Math.sin(t),
      name: name,
      initial: name.charAt(0).toUpperCase(),
      href: a.href,
      src: img ? img.src : null,
      gray: null, color: null,
      sx: 0, sy: 0, sc: 1, z2: 0
    });
  });

  /* ---------- Edges: 2 nearest neighbours in 3D ---------- */
  var edges = [];
  (function () {
    var seen = {};
    for (var i = 0; i < N; i++) {
      var best = [];
      for (var j = 0; j < N; j++) {
        if (i === j) continue;
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var dz = nodes[i].z - nodes[j].z;
        best.push([dx * dx + dy * dy + dz * dz, j]);
      }
      best.sort(function (a, b) { return a[0] - b[0]; });
      for (var k = 0; k < 2; k++) {
        var a2 = Math.min(i, best[k][1]), b2 = Math.max(i, best[k][1]);
        var key = a2 + "_" + b2;
        if (!seen[key]) { seen[key] = true; edges.push([a2, b2]); }
      }
    }
  })();

  /* ---------- Portrait sprites (circular, gray + colour) ---------- */
  function makeSprites(node, img) {
    var SIZE = 112;
    ["gray", "color"].forEach(function (kind) {
      var c = document.createElement("canvas");
      c.width = c.height = SIZE;
      var g = c.getContext("2d");
      g.beginPath();
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, 6.2832);
      g.closePath();
      g.clip();
      if (kind === "gray" && "filter" in g) g.filter = "grayscale(1)";
      var s = Math.max(SIZE / img.width, SIZE / img.height);
      var w = img.width * s, h = img.height * s;
      g.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      node[kind] = c;
    });
    requestRender();
  }

  nodes.forEach(function (node) {
    if (!node.src) return;
    var img = new Image();
    img.onload = function () { makeSprites(node, img); };
    img.src = node.src;
  });

  /* ---------- Interaction state ---------- */
  var autoAngle = 0;
  var userRX = -0.1, userRY = 0, targetRX = -0.1, targetRY = 0;
  var velX = 0, velY = 0;
  var dragging = false, moved = 0;
  var lastPX = 0, lastPY = 0;
  var pointerX = -9999, pointerY = -9999;
  var hovered = -1;
  var running = false, inView = true, rafId = null, needsFrame = false;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    narrow = W < 760;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---------- Render ---------- */
  var order = nodes.map(function (_, i) { return i; });

  function render() {
    ctx.clearRect(0, 0, W, H);

    var cx = narrow ? W * 0.5 : W * 0.64;
    var cy = narrow ? H * 0.62 : H * 0.52;
    var R = Math.min(W, H) * (narrow ? 0.4 : 0.37);
    var base = Math.max(Math.min(Math.min(W, H) * 0.085, 60), 32);
    var persp = 3;

    if (!dragging) {
      targetRY += velY; targetRX += velX;
      velX *= 0.94; velY *= 0.94;
    }
    userRX += (targetRX - userRX) * 0.07;
    userRY += (targetRY - userRY) * 0.07;
    var ry = autoAngle + userRY, rx = userRX;

    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var cosX = Math.cos(rx), sinX = Math.sin(rx);

    var i, n;
    for (i = 0; i < N; i++) {
      n = nodes[i];
      var x1 = n.x * cosY + n.z * sinY;
      var z1 = -n.x * sinY + n.z * cosY;
      var y2 = n.y * cosX - z1 * sinX;
      var z2 = n.y * sinX + z1 * cosX;
      var sc = persp / (persp + z2);
      n.sx = cx + x1 * sc * R;
      n.sy = cy + y2 * sc * R;
      n.sc = sc;
      n.z2 = z2;
    }

    // Hover pick: nearest front-most node under the pointer.
    hovered = -1;
    if (pointerX > -9000 && !dragging) {
      var bestZ = Infinity;
      for (i = 0; i < N; i++) {
        n = nodes[i];
        var rad = base * n.sc * 0.5;
        var dx = pointerX - n.sx, dy = pointerY - n.sy;
        if (dx * dx + dy * dy < rad * rad && n.z2 < bestZ) {
          bestZ = n.z2; hovered = i;
        }
      }
    }
    canvas.style.cursor = dragging ? "grabbing" : (hovered >= 0 ? "pointer" : "grab");

    // Synapse lines.
    ctx.lineWidth = 1;
    for (i = 0; i < edges.length; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      var depth = (a.sc + b.sc) * 0.5;
      var isHot = hovered === edges[i][0] || hovered === edges[i][1];
      var alpha = 0.04 + (depth - 0.75) * 0.3 + (isHot ? 0.3 : 0);
      if (alpha <= 0.02) continue;
      ctx.strokeStyle = isHot
        ? "rgba(228, 197, 134," + Math.min(alpha + 0.2, 0.8) + ")"
        : "rgba(56, 189, 178," + Math.min(alpha, 0.35) + ")";
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    // Painter's sort: far to near.
    order.sort(function (p, q) { return nodes[q].z2 - nodes[p].z2; });

    for (var o = 0; o < N; o++) {
      i = order[o];
      n = nodes[i];
      var isHov = i === hovered;
      var s = base * n.sc * (isHov ? 1.22 : 1);
      var depthNorm = Math.max(Math.min((n.sc - 0.75) / 0.55, 1), 0);
      ctx.globalAlpha = isHov ? 1 : 0.3 + 0.7 * depthNorm;

      var sprite = isHov ? (n.color || n.gray) : (n.gray || n.color);
      if (sprite) {
        ctx.drawImage(sprite, n.sx - s / 2, n.sy - s / 2, s, s);
      } else {
        // Placeholder disc with initial while the portrait loads.
        ctx.fillStyle = "#17273f";
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, s / 2, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = "rgba(228, 197, 134, 0.8)";
        ctx.font = "600 " + Math.round(s * 0.42) + "px Fraunces, Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.initial, n.sx, n.sy + 1);
      }

      // Rim.
      ctx.lineWidth = isHov ? 2.5 : 1;
      ctx.strokeStyle = isHov
        ? "rgba(240, 217, 163, 0.95)"
        : "rgba(103, 232, 217," + (0.12 + 0.25 * depthNorm) + ")";
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, s / 2, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Name label for the hovered mind.
    if (hovered >= 0) {
      n = nodes[hovered];
      var label = n.name;
      ctx.font = "500 13px Inter, system-ui, sans-serif";
      var tw = ctx.measureText(label).width;
      var pad = 10, lh = 26;
      var lx = Math.min(Math.max(n.sx, tw / 2 + pad + 8), W - tw / 2 - pad - 8);
      var ly = n.sy + base * n.sc * 0.61 + 10;
      ctx.fillStyle = "rgba(6, 11, 18, 0.88)";
      ctx.strokeStyle = "rgba(240, 217, 163, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx - tw / 2 - pad, ly, tw + pad * 2, lh, 13);
      else ctx.rect(lx - tw / 2 - pad, ly, tw + pad * 2, lh);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4efe6";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx, ly + lh / 2 + 0.5);
    }
  }

  /* ---------- Loop / render-on-demand ---------- */
  function loop() {
    if (!running) return;
    autoAngle += 0.0022;
    render();
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }
  var renderQueued = false;
  function requestRender() {
    if (running) return; // loop already painting
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () { renderQueued = false; render(); });
  }

  /* ---------- Events ---------- */
  window.addEventListener("resize", function () { resize(); requestRender(); });

  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    pointerX = e.clientX - r.left;
    pointerY = e.clientY - r.top;
    if (dragging) {
      var dx = e.clientX - lastPX, dy = e.clientY - lastPY;
      moved += Math.abs(dx) + Math.abs(dy);
      velY = dx * 0.004; velX = dy * 0.0028;
      targetRY += velY;
      targetRX = Math.max(-1.2, Math.min(1.2, targetRX + velX));
      lastPX = e.clientX; lastPY = e.clientY;
    }
    requestRender();
  });
  canvas.addEventListener("pointerleave", function () {
    pointerX = pointerY = -9999;
    requestRender();
  });
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0;
    lastPX = e.clientX; lastPY = e.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", function () {
    dragging = false;
    if (moved < 7 && hovered >= 0 && nodes[hovered].href) {
      window.location.href = nodes[hovered].href;
    }
    requestRender();
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView && !document.hidden) start(); else stop();
    }, { threshold: 0.02 }).observe(canvas);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (inView) start();
  });

  /* ---------- Boot ---------- */
  resize();
  if (reduceMotion) render(); else start();
})();
