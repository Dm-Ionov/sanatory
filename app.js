// ── Настройки ──
var FIREBASE_CONFIG = {apiKey:"AIzaSyAECVIeOOcbZun9Q6k-xnTub55jVpRrrgc",authDomain:"dvij-shagai.firebaseapp.com",projectId:"dvij-shagai",storageBucket:"dvij-shagai.firebasestorage.app",messagingSenderId:"875968644557",appId:"1:875968644557:web:7ba58c680c73eb0f70f084"};
// Служебный аккаунт куратора в Firebase Authentication. Пароль задаётся в консоли Firebase и в коде не хранится.
var CURATOR_EMAIL = "curator@dvij-shagai.app";
var STREAMS = {pro: "Продвинутый тренинг", "new": "Для начинающих"};
var DAYS = 7;
// Соль для отпечатка email: id документа = поток + SHA-256(соль + email)
var ID_SALT = "dvij-shagai/v1/";

firebase.initializeApp(FIREBASE_CONFIG);
var db = firebase.firestore();
var auth = firebase.auth();

var App = (function () {
  var params = new URLSearchParams(location.search);
  var form = params.get("f");
  var stream = params.get("s");

  // ── Утилиты ──
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c];
    });
  }
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; }
  async function docId(s, email) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ID_SALT + normEmail(email)));
    var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return s + "_" + hex;
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function showError(id, msg) { var el = $(id); el.textContent = msg; el.classList.toggle("show", !!msg); }
  function fbError(e) {
    console.error(e);
    if (e && e.code === "permission-denied") return "База не приняла данные. Проверь, что все поля заполнены корректно, и попробуй ещё раз.";
    if (e && e.code === "unavailable") return "Нет связи с сервером. Проверь интернет и попробуй ещё раз.";
    return "Не получилось сохранить. Попробуй ещё раз через минуту.";
  }
  function fmtDate(ts) { return ts && ts.toDate ? ts.toDate().toLocaleDateString("ru-RU") : "—"; }
  function fmtNum(n) { return n == null ? "—" : String(n).replace(".", ","); }

  // Проверка обязательных полей формы; возвращает значения или null
  function collect(fields) {
    var out = {}, ok = true;
    fields.forEach(function (f) {
      var el = $(f.id), v = el.value.trim(), bad = false;
      if (f.type === "email") { v = normEmail(v); bad = !validEmail(v); }
      else if (f.type === "text") { bad = !v; }
      else { v = num(v); bad = v == null || v < +el.min || v > +el.max; }
      el.classList.toggle("invalid", bad);
      if (bad) ok = false;
      out[f.key] = v;
    });
    return ok ? out : null;
  }

  // Статус дня: full — все 4 пункта, part — заполнены только обязательные
  function dayStatus(d) {
    if (!d || !d.tr || !(d.steps > 0)) return "none";
    return d.kbju && d.task ? "full" : "part";
  }
  var STATUS_COLOR = {full: "var(--full)", part: "var(--part)", none: "var(--cream2)"};
  var STATUS_TEXT = {full: "Полный отчёт", part: "Неполный отчёт", none: "Нет отчёта"};

  // ── Роутинг ──
  function route() {
    var page = "404";
    if (form === "admin") page = "admin";
    else if (["start", "final", "daily"].indexOf(form) >= 0 && STREAMS[stream]) page = form;
    document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active"); });
    $("page-" + page).classList.add("active");
    if (page !== "admin" && page !== "404") $("streamChip").textContent = STREAMS[stream];
    if (page === "start") initStart();
    if (page === "final") initFinal();
    if (page === "daily") initDaily();
    if (page === "admin") initAdmin();
  }

  // ── Анкета старта ──
  var START_FIELDS = [
    {id: "st_email", key: "email", type: "email"}, {id: "st_name", key: "name", type: "text"},
    {id: "st_age", key: "age"}, {id: "st_weight", key: "weight"}, {id: "st_height", key: "height"},
    {id: "st_waist", key: "waist"}, {id: "st_hips", key: "hips"}, {id: "st_chest", key: "chest"},
    {id: "st_steps", key: "stepsPlan"}
  ];
  function initStart() {
    var saved = lsGet("san_start_" + stream);
    if (saved) START_FIELDS.forEach(function (f) { if (saved[f.key] != null) $(f.id).value = saved[f.key]; });
    else { var me = lsGet("san_me"); if (me) { $("st_email").value = me.email || ""; $("st_name").value = me.name || ""; } }
    $("startForm").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var data = collect(START_FIELDS);
      if (!data) return showError("startError", "Заполни, пожалуйста, все поля — пустые или неверные подсвечены красным.");
      showError("startError", "");
      var btn = $("startBtn"); btn.disabled = true; btn.textContent = "Сохраняем…";
      try {
        data.stream = stream;
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("starts").doc(await docId(stream, data.email)).set(data);
        delete data.updatedAt;
        lsSet("san_start_" + stream, data);
        lsSet("san_me", {email: data.email, name: data.name});
        $("startForm").hidden = true; $("startSuccess").classList.add("show");
      } catch (e) { showError("startError", fbError(e)); }
      btn.disabled = false; btn.textContent = "Отправить анкету →";
    });
  }

  // ── Анкета финала ──
  var FINAL_FIELDS = [
    {id: "fn_email", key: "email", type: "email"}, {id: "fn_weight", key: "weight"},
    {id: "fn_waist", key: "waist"}, {id: "fn_hips", key: "hips"}, {id: "fn_chest", key: "chest"}
  ];
  function initFinal() {
    var saved = lsGet("san_final_" + stream), me = lsGet("san_me");
    if (saved) FINAL_FIELDS.forEach(function (f) { if (saved[f.key] != null) $(f.id).value = saved[f.key]; });
    else if (me) $("fn_email").value = me.email || "";
    $("finalForm").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var data = collect(FINAL_FIELDS);
      if (!data) return showError("finalError", "Заполни, пожалуйста, все поля — пустые или неверные подсвечены красным.");
      showError("finalError", "");
      var btn = $("finalBtn"); btn.disabled = true; btn.textContent = "Сохраняем…";
      try {
        data.stream = stream;
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("finals").doc(await docId(stream, data.email)).set(data);
        delete data.updatedAt;
        lsSet("san_final_" + stream, data);
        renderFinalDelta(data, lsGet("san_start_" + stream));
        $("finalForm").hidden = true; $("finalSuccess").classList.add("show");
      } catch (e) { showError("finalError", fbError(e)); }
      btn.disabled = false; btn.textContent = "Отправить итоги →";
    });
  }
  // Разница показывается, только если стартовая анкета заполнялась на этом же устройстве:
  // читать анкеты из базы может только куратор.
  function renderFinalDelta(fin, st) {
    var box = $("finalDelta"); box.innerHTML = "";
    if (!st || normEmail(st.email) !== fin.email) return;
    [["weight", "Вес", "кг"], ["waist", "Талия", "см"], ["hips", "Бёдра", "см"], ["chest", "Грудь", "см"]].forEach(function (m) {
      if (st[m[0]] == null) return;
      var d = Math.round((fin[m[0]] - st[m[0]]) * 10) / 10;
      box.insertAdjacentHTML("beforeend",
        '<div class="delta-item"><div class="lbl">' + m[1] + '</div><div class="val">' + (d > 0 ? "+" : "") + fmtNum(d) + " " + m[2] +
        '</div><div class="sub">' + fmtNum(st[m[0]]) + " → " + fmtNum(fin[m[0]]) + "</div></div>");
    });
  }

  function showForm(f) {
    $(f + "Form").hidden = false; $(f + "Success").classList.remove("show"); window.scrollTo(0, 0);
  }

  // ── Ежедневный отчёт ──
  var me = null; // {email, name, id, days}
  function initDaily() {
    var saved = lsGet("san_me");
    if (saved) { $("dl_email").value = saved.email || ""; $("dl_name").value = saved.name || ""; }
    $("dailyLogin").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var data = collect([{id: "dl_email", key: "email", type: "email"}, {id: "dl_name", key: "name", type: "text"}]);
      if (!data) return showError("dailyLoginError", "Укажи email и имя.");
      showError("dailyLoginError", "");
      var btn = $("dailyLoginBtn"); btn.disabled = true; btn.textContent = "Открываем…";
      try {
        var id = await docId(stream, data.email);
        var snap = await db.collection("daily").doc(id).get();
        me = {email: data.email, name: data.name, id: id, days: (snap.exists && snap.data().days) || {}};
        lsSet("san_me", {email: data.email, name: data.name});
        renderDays();
        $("dailyLogin").hidden = true; $("dailyDays").hidden = false;
        loadBoard();
      } catch (e) { showError("dailyLoginError", fbError(e)); }
      btn.disabled = false; btn.textContent = "Открыть мой дневник →";
    });
    loadBoard();
  }
  function dailyLogout() { me = null; $("dailyDays").hidden = true; $("dailyLogin").hidden = false; loadBoard(); }

  function renderDays() {
    $("dlAvatar").textContent = (me.name[0] || "★").toUpperCase();
    $("dlHi").textContent = "Привет, " + me.name + "!";
    var firstEmpty = 0;
    for (var i = 1; i <= DAYS; i++) if (dayStatus(me.days["d" + i]) === "none") { firstEmpty = i; break; }
    var html = "";
    for (var n = 1; n <= DAYS; n++) {
      var d = me.days["d" + n] || {}, st = dayStatus(d);
      html += '<div class="day ' + st + (n === firstEmpty ? " open" : "") + '" id="day' + n + '">' +
        '<div class="day-head" onclick="App.toggleDay(' + n + ')"><div class="day-num">День ' + n + '</div>' +
        '<div class="day-status">' + STATUS_TEXT[st] + '</div><div class="day-caret">▾</div></div>' +
        '<div class="day-body">' +
        check(n, "tr", "Я выполнила все тренировки", d.tr, true) +
        '<div class="steps-row"><span>Я прошла шагов<span class="req">обязательно</span></span>' +
        '<input type="number" id="d' + n + '_steps" min="1" max="100000" inputmode="numeric" placeholder="0" value="' + (d.steps || "") + '"></div>' +
        check(n, "kbju", "Я питалась по своей норме КБЖУ", d.kbju) +
        check(n, "task", "Я выполнила задание дня", d.task) +
        '<div class="form-error" id="d' + n + '_err"></div>' +
        '<button class="btn-submit" id="d' + n + '_btn" onclick="App.saveDay(' + n + ')">Сохранить день ' + n + '</button>' +
        '<div class="day-saved" id="d' + n + '_ok"></div></div></div>';
    }
    $("daysList").innerHTML = html;
  }
  function check(n, key, text, on, req) {
    return '<label class="check"><input type="checkbox" id="d' + n + "_" + key + '"' + (on ? " checked" : "") + '><span class="box"></span>' +
      '<span>' + text + (req ? '<span class="req">обязательно</span>' : "") + "</span></label>";
  }
  function toggleDay(n) { $("day" + n).classList.toggle("open"); }

  async function saveDay(n) {
    var d = {
      tr: $("d" + n + "_tr").checked,
      steps: Math.round(num($("d" + n + "_steps").value) || 0),
      kbju: $("d" + n + "_kbju").checked,
      task: $("d" + n + "_task").checked
    };
    var miss = [];
    if (!d.tr) miss.push("отметь тренировки");
    if (!(d.steps > 0) || d.steps > 100000) miss.push("укажи количество шагов");
    if (miss.length) return showError("d" + n + "_err", "Чтобы сохранить день, " + miss.join(" и ") + ".");
    showError("d" + n + "_err", "");
    var btn = $("d" + n + "_btn"); btn.disabled = true; btn.textContent = "Сохраняем…";
    try {
      var days = {}; days["d" + n] = d;
      await db.collection("daily").doc(me.id).set({
        stream: stream, name: me.name, days: days,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge: true});
      me.days["d" + n] = d;
      var st = dayStatus(d), el = $("day" + n);
      el.classList.remove("full", "part", "none"); el.classList.add(st);
      el.querySelector(".day-status").textContent = STATUS_TEXT[st];
      $("d" + n + "_ok").textContent = st === "full" ? "Сохранено — полный отчёт! ★" : "Сохранено";
      loadBoard();
    } catch (e) { showError("d" + n + "_err", fbError(e)); }
    btn.disabled = false; btn.textContent = "Сохранить день " + n;
  }

  var boardRows = [], boardReq = 0;
  async function loadBoard() {
    var req = ++boardReq;
    try {
      var snap = await db.collection("daily").where("stream", "==", stream).get();
      if (req !== boardReq) return; // пришёл ответ на устаревший запрос
      boardRows = snap.docs.map(function (x) { return Object.assign({id: x.id}, x.data()); });
      // Свою строку берём из локальных данных: пока запись не дошла до сервера,
      // кэш Firestore может вернуть неполную копию документа.
      if (me) {
        var mine = boardRows.filter(function (r) { return r.id === me.id; })[0];
        if (mine) { mine.days = me.days; mine.name = me.name; }
        else if (Object.keys(me.days).length) boardRows.push({id: me.id, name: me.name, days: me.days});
      }
      boardRows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "ru"); });
      renderBoard();
    } catch (e) {
      console.error(e);
      $("boardBody").innerHTML = '<tr><td colspan="8" class="empty-state">Не удалось загрузить отчёты</td></tr>';
    }
  }
  function renderBoard() {
    if (!boardRows.length) { $("boardBody").innerHTML = '<tr><td colspan="8" class="empty-state">Пока нет отчётов — будь первой!</td></tr>'; return; }
    $("boardBody").innerHTML = boardRows.map(function (r, i) {
      var cells = "";
      for (var n = 1; n <= DAYS; n++) {
        var st = dayStatus(r.days && r.days["d" + n]);
        cells += "<td>" + (st === "none" ? '<span class="bcell c-none"></span>'
          : '<button class="bcell c-' + st + '" title="' + STATUS_TEXT[st] + '" onclick="App.boardDetail(' + i + "," + n + ')"></button>') + "</td>";
      }
      return '<tr class="' + (me && me.id === r.id ? "me" : "") + '"><td>' + esc(r.name) + "</td>" + cells + "</tr>";
    }).join("");
  }
  function dayDetailHtml(d) {
    return '<dl class="dl"><dt>Тренировки</dt><dd>' + (d.tr ? "✅ выполнены" : "—") + "</dd>" +
      "<dt>Шаги</dt><dd>" + (d.steps ? d.steps.toLocaleString("ru-RU") : "—") + "</dd>" +
      "<dt>КБЖУ</dt><dd>" + (d.kbju ? "✅ по норме" : "—") + "</dd>" +
      "<dt>Задание дня</dt><dd>" + (d.task ? "✅ выполнено" : "—") + "</dd></dl>";
  }
  function boardDetail(i, n) {
    var r = boardRows[i];
    openModal(r.name + " · день " + n, dayDetailHtml(r.days["d" + n]));
  }

  // ── Модалка ──
  function openModal(title, html) { $("modalTitle").textContent = title; $("modalBody").innerHTML = html; $("modal").classList.add("open"); }
  function closeModal() { $("modal").classList.remove("open"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  // ── Панель куратора ──
  var adminStream = "pro", rows = [], sortField = "ts", sortDir = -1;
  function initAdmin() {
    $("adminLogin").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var btn = $("adminBtn"); btn.disabled = true; btn.textContent = "Входим…";
      try {
        await auth.signInWithEmailAndPassword(CURATOR_EMAIL, $("adm_pw").value);
        $("adm_pw").value = ""; showError("adminError", "");
      } catch (e) {
        console.error(e);
        showError("adminError", e.code === "auth/too-many-requests" ? "Слишком много попыток. Подожди несколько минут." : "Неверный пароль.");
      }
      btn.disabled = false; btn.textContent = "Войти";
    });
    auth.onAuthStateChanged(function (u) {
      var ok = u && u.email === CURATOR_EMAIL;
      $("adminLoginWrap").hidden = !!ok; $("adminPanel").hidden = !ok;
      if (ok) loadAdmin();
    });
    document.querySelectorAll("#streamSeg button").forEach(function (b) {
      b.addEventListener("click", function () { adminStream = b.dataset.s; loadAdmin(); });
    });
    document.querySelectorAll(".admin-table th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var f = th.dataset.sort;
        if (sortField === f) sortDir = -sortDir; else { sortField = f; sortDir = f === "name" || f === "email" ? 1 : -1; }
        renderAdmin();
      });
    });
    ["fName", "fEmail", "fStage"].forEach(function (id) { $(id).addEventListener("input", renderAdmin); });
  }
  function adminLogout() { auth.signOut(); }

  async function loadAdmin() {
    document.querySelectorAll("#streamSeg button").forEach(function (b) { b.classList.toggle("active", b.dataset.s === adminStream); });
    $("adminBody").innerHTML = '<tr><td colspan="7" class="loading">Загружаем…</td></tr>';
    try {
      var q = function (c) { return db.collection(c).where("stream", "==", adminStream).get(); };
      var res = await Promise.all([q("starts"), q("finals"), q("daily")]);
      var byId = {};
      var put = function (snap, key) {
        snap.docs.forEach(function (x) { (byId[x.id] = byId[x.id] || {id: x.id})[key] = x.data(); });
      };
      put(res[0], "start"); put(res[1], "final"); put(res[2], "daily");
      rows = Object.keys(byId).map(function (id) {
        var r = byId[id], s = r.start || {}, f = r.final || {}, days = (r.daily && r.daily.days) || {};
        var full = 0, any = 0, stats = [];
        for (var n = 1; n <= DAYS; n++) { var st = dayStatus(days["d" + n]); stats.push(st); if (st === "full") full++; if (st !== "none") any++; }
        var ts = [s.updatedAt, f.updatedAt, r.daily && r.daily.updatedAt].reduce(function (m, t) { var v = t && t.toMillis ? t.toMillis() : 0; return v > m ? v : m; }, 0);
        return {
          id: id, start: r.start, final: r.final, daily: r.daily, days: days, stats: stats, full: full, any: any, ts: ts,
          name: s.name || (r.daily && r.daily.name) || "—", email: s.email || f.email || "",
          age: s.age, w0: s.weight, w1: f.weight,
          delta: s.weight != null && f.weight != null ? Math.round((f.weight - s.weight) * 10) / 10 : null
        };
      });
      updateStats(); renderAdmin();
    } catch (e) {
      console.error(e);
      $("adminBody").innerHTML = '<tr><td colspan="7" class="empty-state">Ошибка загрузки. Проверь, что правила Firestore опубликованы.</td></tr>';
    }
  }
  function updateStats() {
    var withDelta = rows.filter(function (r) { return r.delta != null; });
    $("sTotal").textContent = rows.length;
    $("sStart").textContent = rows.filter(function (r) { return r.start; }).length;
    $("sFinal").textContent = rows.filter(function (r) { return r.final; }).length;
    $("sFull").textContent = rows.reduce(function (s, r) { return s + r.full; }, 0);
    $("sLoss").textContent = withDelta.length
      ? fmtNum(Math.round(-withDelta.reduce(function (s, r) { return s + r.delta; }, 0) / withDelta.length * 10) / 10) : "—";
  }
  function filtered() {
    var qn = $("fName").value.trim().toLowerCase(), qe = $("fEmail").value.trim().toLowerCase(), st = $("fStage").value;
    return rows.filter(function (r) {
      if (qn && String(r.name).toLowerCase().indexOf(qn) < 0) return false;
      if (qe && r.email.indexOf(qe) < 0) return false;
      if (st === "start" && !(r.start && !r.final)) return false;
      if (st === "final" && !r.final) return false;
      if (st === "nostart" && r.start) return false;
      if (st === "noreport" && r.any) return false;
      return true;
    }).sort(function (a, b) {
      var x = a[sortField], y = b[sortField];
      if (x == null) return 1; if (y == null) return -1;
      if (typeof x === "string") return x.localeCompare(y, "ru") * sortDir;
      return (x - y) * sortDir;
    });
  }
  function renderAdmin() {
    var list = filtered();
    if (!list.length) { $("adminBody").innerHTML = '<tr><td colspan="7" class="empty-state">Нет участниц</td></tr>'; return; }
    $("adminBody").innerHTML = list.map(function (r) {
      var dots = r.stats.map(function (st, i) { return '<span class="dot" style="background:' + STATUS_COLOR[st] + '" title="День ' + (i + 1) + ": " + STATUS_TEXT[st] + '"></span>'; }).join("");
      var weight = r.w0 == null && r.w1 == null ? "—" : fmtNum(r.w0) + " → " + fmtNum(r.w1) +
        (r.delta != null ? '<div class="' + (r.delta <= 0 ? "delta-down" : "delta-up") + '">' + (r.delta > 0 ? "+" : "") + fmtNum(r.delta) + " кг</div>" : "");
      return "<tr><td><strong>" + esc(r.name) + "</strong>" + (r.start ? "" : '<div class="muted">нет анкеты старта</div>') + "</td>" +
        '<td class="muted">' + esc(r.email || "—") + "</td><td>" + esc(r.age == null ? "—" : r.age) + "</td><td>" + weight + "</td>" +
        '<td><div class="dots">' + dots + "</div></td><td>" + (r.ts ? new Date(r.ts).toLocaleDateString("ru-RU") : "—") + "</td>" +
        '<td><button class="btn-view" onclick="App.openDetail(\'' + r.id + "')\">Открыть</button></td></tr>";
    }).join("");
  }
  function openDetail(id) {
    var r = rows.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var s = r.start || {}, f = r.final || {};
    var line = function (lbl, a, b, unit) {
      var d = a != null && b != null ? Math.round((b - a) * 10) / 10 : null;
      return "<dt>" + lbl + "</dt><dd>" + fmtNum(a) + " → " + fmtNum(b) + (unit ? " " + unit : "") + (d != null ? " <span class='" + (d <= 0 ? "delta-down" : "delta-up") + "'>(" + (d > 0 ? "+" : "") + fmtNum(d) + ")</span>" : "") + "</dd>";
    };
    var daysHtml = '<table class="mini-days"><tr><th></th>';
    for (var n = 1; n <= DAYS; n++) daysHtml += "<th>Д" + n + "</th>";
    daysHtml += "</tr>";
    [["tr", "Трен."], ["steps", "Шаги"], ["kbju", "КБЖУ"], ["task", "Задание"]].forEach(function (k) {
      daysHtml += '<tr><td class="muted">' + k[1] + "</td>";
      for (var n = 1; n <= DAYS; n++) {
        var d = r.days["d" + n];
        daysHtml += "<td>" + (!d ? "·" : k[0] === "steps" ? (d.steps || "—") : d[k[0]] ? "✅" : "—") + "</td>";
      }
      daysHtml += "</tr>";
    });
    daysHtml += "</table>";
    openModal(r.name,
      '<dl class="dl"><dt>Email</dt><dd>' + esc(r.email || "—") + "</dd><dt>Поток</dt><dd>" + STREAMS[adminStream] + "</dd>" +
      "<dt>Возраст</dt><dd>" + esc(s.age == null ? "—" : s.age) + "</dd><dt>Рост</dt><dd>" + fmtNum(s.height) + " см</dd>" +
      "<dt>План шагов</dt><dd>" + (s.stepsPlan ? s.stepsPlan.toLocaleString("ru-RU") : "—") + "</dd>" +
      "<dt>Старт</dt><dd>" + fmtDate(s.updatedAt) + "</dd><dt>Финал</dt><dd>" + fmtDate(f.updatedAt) + "</dd></dl>" +
      '<div class="section-lbl">Параметры: старт → финал</div><dl class="dl">' +
      line("Вес", s.weight, f.weight, "кг") + line("Талия", s.waist, f.waist, "см") + line("Бёдра", s.hips, f.hips, "см") + line("Грудь", s.chest, f.chest, "см") + "</dl>" +
      '<div class="section-lbl">Ежедневные отчёты</div>' + daysHtml);
  }
  function exportCSV() {
    var head = ["Поток", "Имя", "Email", "Возраст", "Рост", "План шагов", "Вес старт", "Талия старт", "Бёдра старт", "Грудь старт",
      "Вес финал", "Талия финал", "Бёдра финал", "Грудь финал", "Разница веса"];
    for (var n = 1; n <= DAYS; n++) head.push("Д" + n + " статус", "Д" + n + " шаги");
    var q = function (v) { v = v == null ? "" : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [head.join(";")].concat(filtered().map(function (r) {
      var s = r.start || {}, f = r.final || {};
      var row = [STREAMS[adminStream], r.name, r.email, s.age, s.height, s.stepsPlan, s.weight, s.waist, s.hips, s.chest,
        f.weight, f.waist, f.hips, f.chest, r.delta];
      for (var n = 1; n <= DAYS; n++) { var d = r.days["d" + n]; row.push(STATUS_TEXT[r.stats[n - 1]], d ? d.steps : ""); }
      return row.map(function (v) { return q(typeof v === "number" ? String(v).replace(".", ",") : v); }).join(";");
    }));
    var blob = new Blob(["﻿" + lines.join("\n")], {type: "text/csv;charset=utf-8"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sanatory_" + adminStream + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  }

  route();
  return {
    showForm: showForm, dailyLogout: dailyLogout, toggleDay: toggleDay, saveDay: saveDay, boardDetail: boardDetail,
    closeModal: closeModal, adminLogout: adminLogout, openDetail: openDetail, exportCSV: exportCSV
  };
})();
