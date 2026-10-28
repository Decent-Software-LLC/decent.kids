/* ============================================================
   Block Day — kids-task-rewards
   Dependency-free app logic. State lives in localStorage only:
   no accounts, no backend, no tracking.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "blockday.v1";
  var TOWN_SLOTS = 10;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Seed data (illustrative) ---------- */
  var SEED_TASKS = [
    { id: "t1", label: "Make your bed", moment: "morning", category: "yellow", icon: "🛏️", minutes: 10 },
    { id: "t2", label: "Brush your teeth", moment: "morning", category: "red", icon: "🪥", minutes: 10 },
    { id: "t3", label: "Pack your school bag", moment: "morning", category: "blue", icon: "🎒", minutes: 10 },
    { id: "t4", label: "Tidy your room", moment: "after", category: "yellow", icon: "🧸", minutes: 15 },
    { id: "t5", label: "Read for a little while", moment: "after", category: "blue", icon: "📚", minutes: 15 },
    { id: "t6", label: "Help set the table", moment: "after", category: "yellow", icon: "🍽️", minutes: 10 },
    { id: "t7", label: "Put toys back in the bin", moment: "evening", category: "green", icon: "🧩", minutes: 10 },
    { id: "t8", label: "Wash up after dinner", moment: "evening", category: "red", icon: "🫧", minutes: 10 },
    { id: "t9", label: "Say goodnight to your day", moment: "evening", category: "green", icon: "🌙", minutes: 5 }
  ];

  var GAMES = [
    { id: "g1", name: "Block Stack", icon: "🧱", tint: "cat-red", minutes: 10, desc: "A gentle tower-stacking game where no tower falls for long." },
    { id: "g2", name: "Rainbow Path", icon: "🌈", tint: "cat-yellow", minutes: 15, desc: "Hop across a wobbly rainbow bridge to the other side." },
    { id: "g3", name: "Moonlight Music", icon: "🎵", tint: "cat-blue", minutes: 20, desc: "A calm, twinkle-filled puzzle about quiet evening sounds." },
    { id: "g4", name: "Pond Paddles", icon: "🦆", tint: "cat-green", minutes: 25, desc: "Row a tiny pond, collect lily pads, keep it mellow." }
  ];

  var MOMENTS = [
    { id: "morning", name: "Morning", icon: "🌞" },
    { id: "after", name: "After School", icon: "🎒" },
    { id: "evening", name: "Evening", icon: "🌙" }
  ];

  var BADGES = [
    { id: "b1", name: "First Block", icon: "🧱", test: function (s) { return s.doneCount >= 1; }, hint: "Finish 1 task" },
    { id: "b2", name: "Steady Builder", icon: "🏗️", test: function (s) { return s.doneCount >= 3; }, hint: "Finish 3 tasks" },
    { id: "b3", name: "Town Raiser", icon: "🏘️", test: function (s) { return s.doneCount >= TOWN_SLOTS; }, hint: "Finish 10 tasks" },
    { id: "b4", name: "All Day Done", icon: "🌟", test: function (s) { return s.total > 0 && s.doneCount === s.total; }, hint: "Finish every task today" },
    { id: "b5", name: "Play-Ready", icon: "🎮", test: function (s) { return s.playedOnce; }, hint: "Start a play session" }
  ];

  /* ---------- State ---------- */
  function defaultState() {
    return {
      version: 1,
      date: todayKey(),
      tasks: SEED_TASKS.map(function (t) {
        return { id: t.id, label: t.label, moment: t.moment, category: t.category, icon: t.icon, minutes: t.minutes, done: false };
      }),
      balance: 0,
      playedOnce: false,
      session: null // { gameId, totalSeconds, remainingSeconds, status: "playing"|"paused" }
    };
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  var state;
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) {
    state = null;
  }

  // Fresh day: reset check-offs (keep custom tasks and balance).
  if (!state || state.version !== 1) {
    state = defaultState();
  } else if (state.date !== todayKey()) {
    state.date = todayKey();
    state.tasks.forEach(function (t) { t.done = false; });
    state.session = null;
    save();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable (private mode etc.) — app still works in-memory */
    }
  }

  /* ---------- Derived stats ---------- */
  function stats() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (t) { return t.done; }).length;
    return { total: total, done: done, pct: total ? done / total : 0 };
  }

  /* ---------- DOM helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };

  var announcer = $("announcer");
  var announceQueue = [];
  var announceTimer = null;
  function announce(msg) {
    if (!msg) return;
    announceQueue.push(msg);
    if (announceTimer) return;
    (function step() {
      var next = announceQueue.shift();
      if (!next) { announceTimer = null; return; }
      announcer.textContent = "";
      // small delay so repeated identical messages still get read
      setTimeout(function () {
        announcer.textContent = next;
        announceTimer = setTimeout(step, 600);
      }, 40);
    })();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- Views / tabs ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab[data-view]"));
  var views = { home: $("view-home"), games: $("view-games"), grownups: $("view-grownups") };

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
    tabs.forEach(function (t) {
      if (t.getAttribute("data-view") === name) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-view]");
    if (btn) showView(btn.getAttribute("data-view"));
  });

  /* ---------- Reward pop (confetti + "+X min") ---------- */
  function rewardPop(anchorEl, minutes) {
    if (REDUCED || !anchorEl) return;
    var rect = anchorEl.getBoundingClientRect();
    var pop = el("span", "reward-pop", "+" + minutes + " min ✨");
    pop.style.left = Math.max(8, rect.left + rect.width / 2 - 40) + "px";
    pop.style.top = Math.max(8, rect.top - 10) + "px";
    document.body.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 950);

    var colors = ["#d94b3d", "#3574b9", "#f2c84b", "#4f8f62"];
    for (var i = 0; i < 10; i++) {
      var bit = el("span", "confetti-bit");
      bit.style.left = (rect.left + rect.width / 2 + (Math.random() * 90 - 45)) + "px";
      bit.style.top = (rect.top + (Math.random() * 20 - 10)) + "px";
      bit.style.background = colors[i % colors.length];
      document.body.appendChild(bit);
      setTimeout(function (b) { return function () { b.remove(); }; }(bit), 1000);
    }
  }

  /* ---------- Dashboard rendering ---------- */
  function momentName(id) {
    for (var i = 0; i < MOMENTS.length; i++) if (MOMENTS[i].id === id) return MOMENTS[i].name;
    return id;
  }

  function renderDashboard() {
    var s = stats();

    $("balance-minutes").textContent = state.balance;
    var fill = $("progress-fill");
    fill.style.width = Math.round(s.pct * 100) + "%";
    $("progress-track").setAttribute("aria-valuenow", String(s.pct));
    $("progress-track").setAttribute("aria-valuetext", s.done + " of " + s.total + " tasks finished");
    $("progress-caption").textContent =
      s.total === 0
        ? "Add some tasks in the Grown-ups tab"
        : s.done + " of " + s.total + " tasks finished";

    renderTown(s);
    renderBadges(s);
    renderMoments();
  }

  function renderTown(s) {
    var scene = $("town-scene");
    scene.textContent = "";
    var built = s.done;
    var colors = ["tbr", "tbb", "tby", "tbg"];
    var icons = ["🏠", "🚗", "🌳", "🚂", "🏫", "⛲", "🌷", "🐶", "🎡", "🗼"];
    for (var i = 0; i < TOWN_SLOTS; i++) {
      var slot = el("div", "town-slot");
      var block;
      if (i < built) {
        block = el("div", "town-block built " + colors[i % colors.length], icons[i]);
      } else {
        block = el("div", "town-block empty", "?");
      }
      slot.appendChild(block);
      scene.appendChild(slot);
    }
    var pct = s.pct;
    $("town-progress-text").textContent =
      s.total === 0 ? "waiting for tasks" :
      built === s.total ? "all built for today! 🎉" :
      pct >= 0.5 ? "halfway there" : "still being built";
  }

  function renderBadges(s) {
    var row = $("badge-row");
    row.textContent = "";
    BADGES.forEach(function (b) {
      var earned = b.test(s);
      var li = el("li", "badge " + (earned ? "earned" : "locked"));
      var icon = el("span", "badge-icon", earned ? b.icon : "🔒");
      icon.setAttribute("aria-hidden", "true");
      var text = el("span");
      text.appendChild(document.createTextNode(b.name));
      text.appendChild(el("small", null, earned ? "Earned!" : b.hint));
      li.appendChild(icon);
      li.appendChild(text);
      li.setAttribute("aria-label", b.name + (earned ? " — earned" : " — not earned yet. " + b.hint));
      row.appendChild(li);
    });
  }

  function renderMoments() {
    var wrap = $("moments");
    wrap.textContent = "";
    MOMENTS.forEach(function (m) {
      var tasks = state.tasks.filter(function (t) { return t.moment === m.id; });
      if (!tasks.length) return;
      var doneInMoment = tasks.filter(function (t) { return t.done; }).length;

      var section = el("section", "moment moment-" + m.id);
      var head = el("div", "moment-head");
      head.appendChild(el("span", "moment-icon", m.icon));
      var h = el("h2", null, m.name);
      h.id = "moment-" + m.id;
      head.appendChild(h);
      head.appendChild(el("span", "moment-count", doneInMoment + " of " + tasks.length));
      section.appendChild(head);

      var list = el("ul", "task-list");
      list.setAttribute("aria-labelledby", "moment-" + m.id);
      tasks.forEach(function (t) {
        var li = el("li", "task-card" + (t.done ? " done" : ""));

        var check = document.createElement("button");
        check.type = "button";
        check.className = "task-check";
        check.setAttribute("aria-pressed", t.done ? "true" : "false");
        check.setAttribute("aria-label",
          t.done
            ? "Undo: " + t.label
            : "Mark done: " + t.label + ", earns " + t.minutes + " minutes");
        check.textContent = "✓";
        check.addEventListener("click", function () { toggleTask(t.id, check); });

        var cat = el("span", "task-cat cat-" + t.category, t.icon);
        cat.setAttribute("aria-hidden", "true");

        var main = el("div", "task-main");
        main.appendChild(el("p", "task-label", t.label));
        main.appendChild(el("p", "task-meta", momentName(t.moment) + " · " + t.minutes + " min reward"));

        var reward = el("span", "task-reward", "⏱ " + t.minutes + " min");

        li.appendChild(check);
        li.appendChild(cat);
        li.appendChild(main);
        li.appendChild(reward);
        list.appendChild(li);
      });
      section.appendChild(list);
      wrap.appendChild(section);
    });
  }

  /* ---------- Task toggling (no duplicate rewards) ---------- */
  function toggleTask(id, checkEl) {
    var task = state.tasks.filter(function (t) { return t.id === id; })[0];
    if (!task) return;

    if (!task.done) {
      task.done = true; // reward applied exactly once per task per day
      state.balance += task.minutes;
      save();
      renderDashboard();
      var r = checkEl ? checkEl.getBoundingClientRect() : null;
      if (r && r.top > 0) rewardPop(checkEl, task.minutes);
      announce("Nice! " + task.label + " done. You earned " + task.minutes + " minutes. You now have " + state.balance + " minutes to spend.");
    } else {
      task.done = false;
      state.balance = Math.max(0, state.balance - task.minutes);
      save();
      renderDashboard();
      announce(task.label + " unchecked. " + state.balance + " minutes left to spend.");
    }
  }

  /* ---------- Games ---------- */
  function renderGames() {
    var grid = $("game-grid");
    grid.textContent = "";
    GAMES.forEach(function (g) {
      var card = el("article", "game-card");
      var icon = el("div", "game-icon " + g.tint, g.icon);
      icon.setAttribute("aria-hidden", "true");
      card.appendChild(icon);
      card.appendChild(el("h3", null, g.name));
      card.appendChild(el("p", "game-desc", g.desc));
      card.appendChild(el("p", "illustrative-note", "Illustrative game — not a real playable app."));
      card.appendChild(el("p", "game-cost", "Costs " + g.minutes + " minutes"));

      var btn = el("button", "button button-primary", "Start " + g.minutes + " min session");
      btn.type = "button";
      btn.disabled = !!state.session;
      if (state.balance < g.minutes && !state.session) {
        btn.textContent = "Not enough minutes yet";
      }
      btn.addEventListener("click", function () {
        if (state.balance < g.minutes) {
          showNeedMore(g);
          return;
        }
        startSession(g);
      });
      card.appendChild(btn);
      grid.appendChild(card);
    });
    renderSessionUI();
  }

  function showNeedMore(game) {
    var need = (game.minutes - state.balance);
    var box = $("need-more");
    box.hidden = false;
    $("need-more-text").textContent =
      "You need " + game.minutes + " minutes for " + game.name + ", but you have " +
      state.balance + ". Finish " + need + " more minutes of tasks to get started!";
    announce("You need " + need + " more minutes to start " + game.name + ". Go finish a task!");
    box.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
  }

  /* ---------- Play session (countdown) ---------- */
  var tickTimer = null;

  function fmtTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function startSession(game) {
    if (state.session || state.balance < game.minutes) return;
    state.session = {
      gameId: game.id,
      totalSeconds: game.minutes * 60,
      remainingSeconds: game.minutes * 60,
      status: "playing"
    };
    state.balance = Math.max(0, state.balance - game.minutes); // charge up front
    state.playedOnce = true;
    save();
    renderGames();
    announce("Play time started: " + game.minutes + " minutes of " + game.name + ". Have fun!");
    startTicker();
  }

  function startTicker() {
    stopTicker();
    tickTimer = setInterval(function () {
      var s = state.session;
      if (!s || s.status !== "playing") return;
      s.remainingSeconds = Math.max(0, s.remainingSeconds - 1);
      if (s.remainingSeconds === 0) finishSession();
      else {
        save();
        renderSessionUI();
      }
    }, 1000);
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function finishSession() {
    var s = state.session;
    var game = GAMES.filter(function (g) { return g.id === s.gameId; })[0];
    // Full minutes were charged at session start — no refund here, no double charge.
    state.session = null;
    save();
    stopTicker();
    renderGames();
    announce("Great playing! Your " + (game ? game.name : "game") + " time is finished. You now have " + state.balance + " minutes left.");
  }

  function pauseSession() {
    if (!state.session || state.session.status !== "playing") return;
    state.session.status = "paused";
    save();
    stopTicker();
    renderSessionUI();
    announce("Play time paused.");
  }

  function resumeSession() {
    if (!state.session || state.session.status !== "paused") return;
    state.session.status = "playing";
    save();
    startTicker();
    renderSessionUI();
    announce("Play time resumed.");
  }

  function stopSessionEarly() {
    if (!state.session) return;
    var s = state.session;
    var game = GAMES.filter(function (g) { return g.id === s.gameId; })[0];
    // Kid-friendly rule: stopping early refunds the unplayed whole minutes, keeping
    // at least the first minute used. Balance was charged up front and never went
    // negative, so this can never drive it below zero.
    var refund = s.remainingSeconds > 0 ? Math.floor(s.remainingSeconds / 60) : 0;
    if (game) refund = Math.min(refund, game.minutes - 1); // never refund the whole charge
    state.balance = Math.max(0, state.balance + refund);
    state.session = null;
    save();
    stopTicker();
    renderGames();
    announce("Stopped early. " + refund + " minutes went back to your treasure. You now have " + state.balance + " minutes.");
  }

  function renderSessionUI() {
    var s = state.session;
    var panel = $("session-panel");
    if (!s) {
      panel.hidden = true;
      $("need-more").hidden = true;
      // Keep the balance display in sync when a session just ended (e.g. stop
      // early refunded minutes) without a full dashboard re-render.
      $("balance-minutes").textContent = state.balance;
      // refresh start-button availability
      renderGamesButtonsOnly();
      return;
    }
    var game = GAMES.filter(function (g) { return g.id === s.gameId; })[0] || { name: "a game" };
    panel.hidden = false;
    $("session-game-name").textContent = "Playing " + game.name;

    var pill = $("session-status");
    pill.textContent = s.status === "paused" ? "Paused" : "Playing";
    pill.className = "session-status-pill" + (s.status === "paused" ? " paused" : "");

    $("session-countdown").textContent = fmtTime(s.remainingSeconds);
    $("session-countdown-sr").textContent = fmtTime(s.remainingSeconds) + " remaining";
    $("session-fill").style.width = (s.remainingSeconds / s.totalSeconds) * 100 + "%";

    var pauseBtn = $("session-pause");
    pauseBtn.textContent = s.status === "paused" ? "Resume" : "Pause";

    var note = $("session-note");
    if (s.status === "paused") {
      note.textContent = "Paused — take a break. Your time is safe and waiting.";
    } else {
      note.textContent = "When the timer hits zero, play time is over. Stop early any time to keep the unplayed minutes.";
    }
    renderGamesButtonsOnly();
  }

  function renderGamesButtonsOnly() {
    var cards = document.querySelectorAll("#game-grid .game-card");
    var i = 0;
    cards.forEach(function (card) {
      var g = GAMES[i++];
      var btn = card.querySelector("button.button");
      if (!btn) return;
      btn.disabled = !!state.session;
      if (state.balance < g.minutes && !state.session) btn.textContent = "Not enough minutes yet";
      else btn.textContent = "Start " + g.minutes + " min session";
    });
  }

  /* ---------- Grown-ups: task form + admin list ---------- */
  var form = $("task-form");
  var editingId = null;

  function resetForm() {
    form.reset();
    $("f-id").value = "";
    editingId = null;
    $("task-form-title").textContent = "Add a task";
    $("task-form-submit").textContent = "Add task";
    $("task-form-cancel").hidden = true;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var label = $("f-label").value.trim();
    var minutes = parseInt($("f-minutes").value, 10);
    if (!label) { $("f-label").focus(); announce("Please give the task a name."); return; }
    if (isNaN(minutes) || minutes < 5 || minutes > 120) {
      $("f-minutes").focus();
      announce("Please enter a reward between 5 and 120 minutes.");
      return;
    }
    var moment = $("f-moment").value;
    var category = $("f-category").value;

    if (editingId) {
      var t = state.tasks.filter(function (x) { return x.id === editingId; })[0];
      if (t) {
        t.label = label; t.moment = moment; t.category = category; t.minutes = minutes;
        if (t.done) {
          // keep the balance consistent if a completed task's value changed
          state.balance = Math.max(0, state.balance - t.minutes);
        }
        announce("Task updated: " + label + ".");
      }
    } else {
      state.tasks.push({
        id: "t" + Date.now(),
        label: label, moment: moment, category: category,
        icon: "⭐", minutes: minutes, done: false
      });
      announce("Task added: " + label + " in " + momentName(moment) + ".");
    }
    save();
    resetForm();
    renderAll();
  });

  $("task-form-cancel").addEventListener("click", resetForm);

  function editTask(id) {
    var t = state.tasks.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    editingId = id;
    $("f-id").value = id;
    $("f-label").value = t.label;
    $("f-moment").value = t.moment;
    $("f-category").value = t.category;
    $("f-minutes").value = t.minutes;
    $("task-form-title").textContent = "Edit task";
    $("task-form-submit").textContent = "Save changes";
    $("task-form-cancel").hidden = false;
    $("f-label").focus();
    showView("grownups");
  }

  function deleteTask(id) {
    var t = state.tasks.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    if (t.done) state.balance = Math.max(0, state.balance - t.minutes);
    state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
    save();
    renderAll();
    announce("Task removed: " + t.label + ".");
  }

  function renderAdminList() {
    var list = $("admin-task-list");
    list.textContent = "";
    if (!state.tasks.length) {
      list.appendChild(el("li", "helper", "No tasks yet — add one with the form."));
      return;
    }
    MOMENTS.forEach(function (m) {
      var tasks = state.tasks.filter(function (t) { return t.moment === m.id; });
      if (!tasks.length) return;
      var heading = el("li", "admin-heading", m.name);
      list.appendChild(heading);
      tasks.forEach(function (t) {
        var li = el("li", "admin-task");
        li.appendChild(el("span", "task-cat cat-" + t.category, t.icon));
        var main = el("div");
        main.appendChild(el("p", "admin-name", t.label));
        main.appendChild(el("p", "admin-meta", "checked " + t.done + " today"));
        li.appendChild(main);
        li.appendChild(el("span", "task-reward", "⏱ " + t.minutes + " min"));
        var editBtn = el("button", "mini-button", "Edit");
        editBtn.type = "button";
        editBtn.addEventListener("click", function () { editTask(t.id); });
        var delBtn = el("button", "mini-button danger", "Remove");
        delBtn.type = "button";
        delBtn.addEventListener("click", function () { deleteTask(t.id); });
        li.appendChild(editBtn);
        li.appendChild(delBtn);
        list.appendChild(li);
      });
    });
  }

  $("reset-day").addEventListener("click", function () {
    state.tasks.forEach(function (t) { t.done = false; });
    state.balance = 0;
    state.session = null;
    stopTicker();
    save();
    renderAll();
    announce("Today's check-offs reset. Balance is back to zero.");
  });

  $("reset-all").addEventListener("click", function () {
    state = defaultState();
    stopTicker();
    save();
    resetForm();
    renderAll();
    announce("Everything reset to the demo defaults.");
  });

  /* ---------- Boot ---------- */
  function renderAll() {
    renderDashboard();
    renderGames();
    renderAdminList();
  }

  // Session controls
  $("session-pause").addEventListener("click", function () {
    if (state.session && state.session.status === "playing") pauseSession();
    else resumeSession();
  });
  $("session-stop").addEventListener("click", stopSessionEarly);

  // Resume a session that was "playing" when the page reloaded (e.g. kid closed
  // the tab mid-game). Paused sessions stay paused until the kid resumes them.
  if (state.session && state.session.status === "playing") startTicker();

  renderAll();
})();
