/* CRANIA hero — interactive 3D neural constellation.
   Hand-rolled canvas renderer: brain-shaped point cloud, k-nearest edges,
   travelling synapse pulses, cursor proximity glow, drag-to-rotate.
   No dependencies. Pauses offscreen; static frame under reduced motion. */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var hero = document.querySelector(".hero");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isNarrow = window.matchMedia("(max-width: 640px)").matches;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;

  /* ---------- Geometry: brain-shaped point cloud ---------- */
  var N = isNarrow ? 360 : 660;
  var nodes = [];
  var edges = [];
  var adj = [];

  function pushNode(px, py, pz) {
    nodes.push({ x: px, y: py, z: pz, sx: 0, sy: 0, sc: 0, glow: 0 });
  }

  // Uniform point in the unit ball, optionally pushed out to the shell.
  function samplePoint(surfaceBias) {
    var x, y, z, r;
    for (;;) {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      r = Math.sqrt(x * x + y * y + z * z);
      if (r > 0 && r <= 1) break;
    }
    if (surfaceBias) {
      var s = (0.88 + Math.random() * 0.12) / r;
      x *= s; y *= s; z *= s;
    }
    return [x, y, z];
  }

  function buildCloud() {
    nodes = [];
    var i;
    var cerebellumN = Math.round(N * 0.14);
    var stemN = Math.round(N * 0.05);
    var cerebrumN = N - cerebellumN - stemN;

    // Cerebrum: long ellipsoid with a cortical ripple, temporal-lobe
    // bulges on the lower flanks, a flattened underside and a shallow
    // interhemispheric groove along the crown (depth axis, so the side
    // view stays solid).
    for (i = 0; i < cerebrumN; i++) {
      var p = samplePoint(i % 10 < 6);
      var px = p[0] * 1.5, py = p[1] * 0.88, pz = p[2] * 0.78;

      var w = 1 + 0.05 * Math.sin(px * 5.3) * Math.sin(py * 4.1 + 1.7) * Math.sin(pz * 6.1 + 0.5);
      px *= w; py *= w; pz *= w;

      // Canvas y grows downward, so "up" is negative py throughout.
      py -= px * 0.08;
      if (py > 0 && px > -0.5 && px < 0.6) pz *= 1.14;
      if (py > 0.38) py = 0.38 + (py - 0.38) * 0.5;
      if (py < -0.15) {
        var groove = (-0.15 - py) * 0.22;
        pz += pz > 0 ? groove : -groove;
      }

      pushNode(px, py, pz);
    }

    // Cerebellum: small finely-rippled lobe tucked under the back.
    for (i = 0; i < cerebellumN; i++) {
      var c = samplePoint(i % 10 < 7);
      var qx = c[0] * 0.36, qy = c[1] * 0.28, qz = c[2] * 0.44;
      var wc = 1 + 0.07 * Math.sin(qy * 18);
      pushNode(-0.9 + qx * wc, 0.56 + qy * wc, qz * wc);
    }

    // Brain stem: short tapering column angling down from the midbrain.
    for (i = 0; i < stemN; i++) {
      var t = Math.random();
      var ang = Math.random() * Math.PI * 2;
      var rad = Math.sqrt(Math.random()) * (0.14 - t * 0.05);
      pushNode(
        -0.26 - t * 0.16 + Math.cos(ang) * rad,
        0.46 + t * 0.44,
        Math.sin(ang) * rad
      );
    }

    // k-nearest edges with a distance cutoff.
    edges = [];
    adj = [];
    for (i = 0; i < N; i++) adj.push([]);
    var seen = {};
    for (i = 0; i < N; i++) {
      var best = [];
      for (var j = 0; j < N; j++) {
        if (i === j) continue;
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var dz = nodes[i].z - nodes[j].z;
        var d = dx * dx + dy * dy + dz * dz;
        if (d < 0.16) best.push([d, j]);
      }
      best.sort(function (a, b) { return a[0] - b[0]; });
      for (var k = 0; k < Math.min(3, best.length); k++) {
        var a = Math.min(i, best[k][1]);
        var b = Math.max(i, best[k][1]);
        var key = a + "_" + b;
        if (!seen[key]) {
          seen[key] = true;
          edges.push([a, b]);
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }
  }

  /* ---------- Synapse pulses ---------- */
  var pulses = [];

  function spawnPulse() {
    if (pulses.length >= 4 || edges.length === 0) return;
    var start = Math.floor(Math.random() * N);
    var path = [start];
    var cur = start;
    var hops = 3 + Math.floor(Math.random() * 3);
    for (var h = 0; h < hops; h++) {
      var nbrs = adj[cur];
      if (!nbrs || nbrs.length === 0) break;
      var next = nbrs[Math.floor(Math.random() * nbrs.length)];
      if (next === path[path.length - 2]) continue;
      path.push(next);
      cur = next;
    }
    if (path.length > 1) pulses.push({ path: path, t: 0, speed: 0.012 + Math.random() * 0.01 });
  }

  /* ---------- Interaction state ---------- */
  var autoAngle = 0;
  var userRX = -0.12, userRY = 0.18;     // current user rotation offset
  var targetRX = -0.12, targetRY = 0.18; // eased target
  var velX = 0, velY = 0;
  var dragging = false;
  var lastPX = 0, lastPY = 0;
  var pointerX = -9999, pointerY = -9999;
  var running = false, inView = true, rafId = null;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---------- Render ---------- */
  function render() {
    ctx.clearRect(0, 0, W, H);

    var cx = W * (isNarrow ? 0.5 : 0.64);
    var cy = H * (isNarrow ? 0.34 : 0.5);
    var size = Math.min(W, H) * (isNarrow ? 0.34 : 0.40);
    var persp = 3.2;

    if (!dragging) {
      targetRY += velY; targetRX += velX;
      velX *= 0.94; velY *= 0.94;
    }
    userRX += (targetRX - userRX) * 0.06;
    userRY += (targetRY - userRY) * 0.06;
    // Gentle sway around the profile pose (instead of a full spin) so the
    // silhouette keeps reading as a brain; dragging still rotates freely.
    var rx = userRX, ry = Math.sin(autoAngle) * 0.24 + userRY;

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
      n.sx = cx + x1 * sc * size;
      n.sy = cy + y2 * sc * size;
      n.sc = sc;

      // Cursor proximity glow (desktop pointer only).
      if (pointerX > -9000) {
        var dxp = n.sx - pointerX, dyp = n.sy - pointerY;
        var dp = dxp * dxp + dyp * dyp;
        n.glow += ((dp < 8100 ? 1 - Math.sqrt(dp) / 90 : 0) - n.glow) * 0.12;
      } else if (n.glow > 0.01) {
        n.glow *= 0.9;
      }
    }

    // Edges.
    ctx.lineWidth = 1;
    for (i = 0; i < edges.length; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      var depth = (a.sc + b.sc) * 0.5;
      var glow = Math.max(a.glow, b.glow);
      var alpha = 0.05 + (depth - 0.78) * 0.35 + glow * 0.3;
      if (alpha <= 0.02) continue;
      ctx.strokeStyle = glow > 0.25
        ? "rgba(217, 179, 108," + Math.min(alpha + 0.15, 0.75) + ")"
        : "rgba(56, 189, 178," + Math.min(alpha, 0.42) + ")";
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    // Nodes.
    for (i = 0; i < N; i++) {
      n = nodes[i];
      var rad = Math.max((n.sc - 0.72) * 3.4, 0.4) + n.glow * 2.2;
      var na = 0.25 + (n.sc - 0.78) * 0.9 + n.glow * 0.5;
      if (na <= 0.03) continue;
      ctx.fillStyle = n.glow > 0.3
        ? "rgba(232, 200, 134," + Math.min(na + 0.2, 0.95) + ")"
        : "rgba(103, 232, 217," + Math.min(na, 0.85) + ")";
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, rad, 0, 6.2832);
      ctx.fill();
    }

    // Synapse pulses (gold comets travelling along edges).
    for (i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += p.speed;
      var total = p.path.length - 1;
      var seg = Math.min(Math.floor(p.t * total), total - 1);
      var f = p.t * total - seg;
      if (p.t >= 1) { pulses.splice(i, 1); continue; }
      var pa = nodes[p.path[seg]], pb = nodes[p.path[seg + 1]];
      var px = pa.sx + (pb.sx - pa.sx) * f;
      var py = pa.sy + (pb.sy - pa.sy) * f;
      var fade = Math.sin(Math.PI * p.t);
      var g = ctx.createRadialGradient(px, py, 0, px, py, 14);
      g.addColorStop(0, "rgba(232, 200, 134," + 0.9 * fade + ")");
      g.addColorStop(1, "rgba(232, 200, 134, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, 6.2832);
      ctx.fill();
    }
  }

  var lastSpawn = 0;
  function loop(ts) {
    if (!running) return;
    autoAngle += 0.0038;
    if (ts - lastSpawn > 850) { spawnPulse(); lastSpawn = ts; }
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

  /* ---------- Events ---------- */
  window.addEventListener("resize", function () {
    isNarrow = window.matchMedia("(max-width: 640px)").matches;
    resize();
    if (reduceMotion) render();
  });

  /* The hero's height can still shift after boot — most commonly when the
     Google Fonts finish loading and swap in over the fallback font, which
     changes text line-wrapping and therefore the section's content height.
     A plain window "resize" listener never fires for that, so the canvas
     would stay sized to the pre-swap layout until an actual window resize.
     ResizeObserver reacts to the hero's real box size instead, whatever
     the cause. */
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () {
      resize();
      if (reduceMotion) render();
    });
    ro.observe(hero);
  } else if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      resize();
      if (reduceMotion) render();
    });
  }

  hero.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    pointerX = e.clientX - r.left;
    pointerY = e.clientY - r.top;
    if (dragging) {
      velY = (e.clientX - lastPX) * 0.004;
      velX = (e.clientY - lastPY) * 0.003;
      targetRY += velY;
      targetRX = Math.max(-1.1, Math.min(1.1, targetRX + velX));
      lastPX = e.clientX; lastPY = e.clientY;
    } else if (e.pointerType === "mouse") {
      // Gentle parallax steering when not dragging.
      targetRY = 0.18 + ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      targetRX = -0.12 + ((e.clientY - r.top) / r.height - 0.5) * 0.35;
    }
  });

  hero.addEventListener("pointerleave", function () {
    pointerX = pointerY = -9999;
    targetRX = -0.12; targetRY = 0.18;
  });

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    lastPX = e.clientX; lastPY = e.clientY;
    canvas.classList.add("is-dragging");
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  ["pointerup", "pointercancel"].forEach(function (evt) {
    canvas.addEventListener(evt, function () {
      dragging = false;
      canvas.classList.remove("is-dragging");
    });
  });

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
  buildCloud();
  resize();
  if (reduceMotion) {
    render(); // single static frame — the form without the motion
  } else {
    start();
  }
})();
