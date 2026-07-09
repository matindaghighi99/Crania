/* Scientists roster: fetches the live list from the D1-backed API, renders
   the grid client-side, and (only once an admin session is confirmed
   server-side) reveals add/remove controls. The server is always the real
   gate — this file only toggles UI, it never decides who is allowed to
   write. */
(function () {
  "use strict";

  var grid = document.getElementById("sci-grid");
  if (!grid) return; // not on scientists.html

  var searchInput = document.getElementById("sci-search");
  var countEl = document.getElementById("sci-count");
  var emptyEl = document.getElementById("sci-empty");

  var adminLoginBtn = document.getElementById("admin-login-btn");
  var adminToolbar = document.getElementById("admin-toolbar");
  var adminLogoutBtn = document.getElementById("admin-logout-btn");

  var loginDialog = document.getElementById("admin-login-dialog");
  var loginForm = document.getElementById("admin-login-form");
  var loginError = document.getElementById("admin-login-error");

  var addDialog = document.getElementById("add-scientist-dialog");
  var addForm = document.getElementById("add-scientist-form");
  var addError = document.getElementById("add-scientist-error");

  var scientists = [];
  var isAdmin = false;

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  function closeDialog(dialog) {
    if (dialog) dialog.close();
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function buildCard(sci) {
    var li = document.createElement("li");
    li.className = "sci-card";
    li.setAttribute("data-name", sci.name.toLowerCase());
    li.setAttribute("data-id", String(sci.id));

    var a = document.createElement("a");
    a.href = sci.profile_url;

    var portrait = document.createElement("span");
    portrait.className = "sci-portrait";
    var img = document.createElement("img");
    img.src = sci.photo_url;
    img.alt = "Portrait of " + sci.name;
    img.loading = "lazy";
    img.decoding = "async";
    portrait.appendChild(img);

    var nameEl = document.createElement("span");
    nameEl.className = "sci-name";
    nameEl.textContent = sci.name;

    var viewEl = document.createElement("span");
    viewEl.className = "sci-view";
    viewEl.appendChild(document.createTextNode("View profile "));
    var arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    viewEl.appendChild(arrow);

    a.appendChild(portrait);
    a.appendChild(nameEl);
    a.appendChild(viewEl);
    li.appendChild(a);

    if (isAdmin) {
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "sci-remove";
      removeBtn.setAttribute("data-id", String(sci.id));
      removeBtn.setAttribute("aria-label", "Remove " + sci.name);
      removeBtn.textContent = "×";
      li.appendChild(removeBtn);
    }

    return li;
  }

  function render() {
    var q = (searchInput && searchInput.value.trim().toLowerCase()) || "";
    var filtered = scientists.filter(function (sci) {
      return !q || sci.name.toLowerCase().indexOf(q) !== -1;
    });

    grid.innerHTML = "";
    filtered.forEach(function (sci) {
      grid.appendChild(buildCard(sci));
    });

    var total = scientists.length;
    if (countEl) {
      countEl.textContent = q
        ? filtered.length + " of " + total + " scientists"
        : total + " scientist" + (total === 1 ? "" : "s");
    }
    if (emptyEl) emptyEl.hidden = filtered.length !== 0;
  }

  function setAdminUi(authenticated) {
    isAdmin = authenticated;
    if (adminLoginBtn) adminLoginBtn.hidden = authenticated;
    if (adminToolbar) adminToolbar.hidden = !authenticated;
  }

  function apiFetch(url, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (options.method && options.method !== "GET") {
      options.headers["X-Requested-With"] = "cr-admin";
    }
    return fetch(url, options);
  }

  // Static roster shipped with the site. Used when the D1-backed API is
  // unavailable (e.g. the database binding hasn't been provisioned) so the
  // public page still renders the full directory. Admin add/remove requires
  // the live API and stays disabled in this fallback mode.
  //
  // Prefer the roster embedded via js/scientists-data.js (a global), because
  // that works even when the page is opened directly from disk (file://),
  // where fetch() is blocked. Fall back to fetching the JSON only if the
  // global isn't present.
  function loadFallback() {
    if (Array.isArray(window.CRANIA_SCIENTISTS)) {
      scientists = window.CRANIA_SCIENTISTS.slice();
      render();
      return Promise.resolve();
    }
    return fetch("assets/data/scientists.json")
      .then(function (res) {
        if (!res.ok) throw new Error("fallback unavailable");
        return res.json();
      })
      .then(function (data) {
        scientists = Array.isArray(data) ? data : [];
        render();
      })
      .catch(function () {
        if (countEl) countEl.textContent = "Couldn't load scientists.";
      });
  }

  function loadScientists() {
    return fetch("/api/scientists", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("api error " + res.status);
        return res.json();
      })
      .then(function (data) {
        scientists = Array.isArray(data) ? data : [];
        render();
      })
      .catch(function () {
        // API unreachable or misconfigured — fall back to the static roster.
        return loadFallback();
      });
  }

  function loadSession() {
    return fetch("/api/session", { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        setAdminUi(!!(data && data.authenticated));
        render();
      })
      .catch(function () {
        setAdminUi(false);
      });
  }

  if (searchInput) {
    searchInput.addEventListener("input", render);
  }

  if (adminLoginBtn) {
    adminLoginBtn.addEventListener("click", function () {
      showError(loginError, "");
      if (loginForm) loginForm.reset();
      openDialog(loginDialog);
    });
  }
  if (loginDialog) {
    loginDialog.querySelectorAll("[data-close-admin-login]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeDialog(loginDialog); });
    });
    loginDialog.addEventListener("click", function (e) {
      if (e.target === loginDialog) closeDialog(loginDialog);
    });
  }
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showError(loginError, "");
      var password = new FormData(loginForm).get("password");
      apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Login failed."); });
          return res.json();
        })
        .then(function () {
          closeDialog(loginDialog);
          setAdminUi(true);
          render();
        })
        .catch(function (err) {
          showError(loginError, err.message || "Login failed.");
        });
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", function () {
      apiFetch("/api/logout", { method: "POST" }).then(function () {
        setAdminUi(false);
        render();
      });
    });
  }

  var addScientistBtn = document.getElementById("admin-add-btn");
  if (addScientistBtn) {
    addScientistBtn.addEventListener("click", function () {
      showError(addError, "");
      if (addForm) addForm.reset();
      openDialog(addDialog);
    });
  }
  if (addDialog) {
    addDialog.querySelectorAll("[data-close-add-scientist]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeDialog(addDialog); });
    });
    addDialog.addEventListener("click", function (e) {
      if (e.target === addDialog) closeDialog(addDialog);
    });
  }
  if (addForm) {
    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showError(addError, "");
      var data = new FormData(addForm);
      var name = data.get("name");
      var profileUrl = data.get("profile_url");
      var photoFile = data.get("photo_file");
      var submitBtn = addForm.querySelector("button[type=submit]");

      if (!photoFile || !photoFile.size) {
        showError(addError, "Please choose a photo to upload.");
        return;
      }

      var photoData = new FormData();
      photoData.append("photo", photoFile);

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Uploading photo…"; }

      apiFetch("/api/photos", { method: "POST", body: photoData })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Couldn't upload photo."); });
          return res.json();
        })
        .then(function (photoResult) {
          if (submitBtn) submitBtn.textContent = "Adding scientist…";
          return apiFetch("/api/scientists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name,
              photo_url: photoResult.url,
              profile_url: profileUrl,
            }),
          }).then(function (res) {
            if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || "Couldn't add scientist."); });
            return res.json();
          });
        })
        .then(function () {
          closeDialog(addDialog);
          return loadScientists();
        })
        .catch(function (err) {
          showError(addError, err.message || "Couldn't add scientist.");
        })
        .then(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Add scientist"; }
        });
    });
  }

  grid.addEventListener("click", function (e) {
    var btn = e.target.closest(".sci-remove");
    if (!btn) return;
    var card = btn.closest(".sci-card");
    var name = card ? card.querySelector(".sci-name").textContent : "this scientist";
    if (!window.confirm("Remove " + name + " from the roster?")) return;
    apiFetch("/api/scientists/" + btn.getAttribute("data-id"), { method: "DELETE" })
      .then(function (res) {
        if (!res.ok) throw new Error("Couldn't remove scientist.");
        return loadScientists();
      })
      .catch(function () {
        window.alert("Couldn't remove scientist. Please try again.");
      });
  });

  loadScientists();
  loadSession();
})();
