"use strict";
const $ = (id) => document.getElementById(id);
const C = window.CFG;
const pool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: C.userPoolId, ClientId: C.clientId });
const TABS = ["home", "schedule", "stay", "tasks"];
const NEXT = { todo: "doing", doing: "done", done: "todo" };
let pendingUser = null, plan = null, tasks = [], editing = false, showDone = false;
let tab = "home", who = "All", fn = "All", me = "";
const today = new Date(new Date().toDateString());

const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
me = store.get("me");

/* ---------- language ---------- */
const UI = {
  en: { home: "Home", schedule: "Schedule", stay: "Stay", tasks: "Tasks", edit: "Edit", doneEditing: "Done editing", signOut: "Sign out", lang: "हिन्दी",
    status_todo: "To do", status_doing: "In progress", status_done: "Done",
    daysToGo: "days to go", functionsStart: "Functions start", tasksDone: "{n} of {m} tasks done", whoLooking: "Who is looking?",
    nextTasks: "{p}'s next tasks", plannedNote: "Not confirmed yet. These are planned for {p}.", nothingFor: "Nothing for {p} yet.",
    seeAllOf: "See all {n} of {p}'s tasks", openTasks: "Open tasks", pickName: "Pick your name to see your own tasks first.",
    comingUp: "Coming up for everyone", allDone: "All tasks are done.", seeAll: "See all tasks",
    overdueWas: "Overdue, was", due: "Due", plannedFor: "Planned for {p}", owner: "Owner", overdue: "Overdue",
    fn: "Function", allFns: "All functions", all: "All", nToDo: "{n} to do", nDone: "{n} done", tapStatus: "tap a status to change it",
    noOpen: "No open tasks here.", showDone: "Show {n} done", hideDone: "Hide {n} done", nTodoArrow: "{n} to do ›",
    roomsNeed: "Rooms we need", gettingAround: "Getting around (14 & 15 Feb)", alsoSort: "Also to sort",
    loadFail: "Could not load the plan: ", saveFail: "Could not save that change: ", updated: "{n} tasks · updated {t}",
    pinPrompt: "Enter the PIN to edit tasks", pinBad: "That PIN is not right.", unlock: "Unlock editing", cancel: "Cancel",
    signInTitle: "Family sign-in", email: "Email", password: "Password", signIn: "Sign in", newPw: "Choose a new password (8+ characters)", firstSignIn: "First sign-in: choose your own password.", signInFail: "Sign-in failed." },
  hi: { home: "होम", schedule: "कार्यक्रम", stay: "ठहरना", tasks: "काम", edit: "बदलें", doneEditing: "बदलना पूरा", signOut: "साइन आउट", lang: "English",
    status_todo: "करना है", status_doing: "चल रहा है", status_done: "पूरा हुआ",
    daysToGo: "दिन बाकी", functionsStart: "कार्यक्रम शुरू", tasksDone: "{m} में से {n} काम पूरे", whoLooking: "कौन देख रहा है?",
    nextTasks: "{p} के अगले काम", plannedNote: "अभी पक्का नहीं। ये {p} के लिए सोचे गए हैं।", nothingFor: "{p} के लिए अभी कुछ नहीं।",
    seeAllOf: "{p} के सभी {n} काम देखें", openTasks: "काम खोलें", pickName: "अपने काम पहले देखने के लिए अपना नाम चुनें।",
    comingUp: "सबके लिए आगे के काम", allDone: "सभी काम पूरे हो गए।", seeAll: "सभी काम देखें",
    overdueWas: "देर हो चुकी, तारीख़", due: "तारीख़", plannedFor: "{p} के लिए सोचा गया", owner: "ज़िम्मेदार", overdue: "देर हो चुकी",
    fn: "कार्यक्रम", allFns: "सभी कार्यक्रम", all: "सभी", nToDo: "{n} करने हैं", nDone: "{n} पूरे", tapStatus: "बदलने के लिए स्थिति पर टैप करें",
    noOpen: "यहाँ कोई बाकी काम नहीं।", showDone: "{n} पूरे काम दिखाएँ", hideDone: "{n} पूरे काम छिपाएँ", nTodoArrow: "{n} काम ›",
    roomsNeed: "हमें कितने कमरे चाहिए", gettingAround: "आना-जाना (14 और 15 फ़रवरी)", alsoSort: "और भी तय करना है",
    loadFail: "योजना लोड नहीं हो सकी: ", saveFail: "बदलाव सेव नहीं हो सका: ", updated: "{n} काम · अपडेट {t}",
    pinPrompt: "काम बदलने के लिए पिन डालें", pinBad: "पिन सही नहीं है।", unlock: "बदलना शुरू करें", cancel: "रद्द करें",
    signInTitle: "परिवार साइन-इन", email: "ईमेल", password: "पासवर्ड", signIn: "साइन इन करें", newPw: "नया पासवर्ड चुनें (कम से कम 8 अक्षर)", firstSignIn: "पहली बार साइन-इन: अपना पासवर्ड चुनें।", signInFail: "साइन-इन नहीं हो सका।" },
};
let lang = store.get("lang") === "hi" ? "hi" : "en";
const T = (k, v = {}) => (UI[lang][k] ?? UI.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "");
/* Plan text (titles, notes, names) is translated from plan.hi, which lives in the database. Missing entries stay English. */
const L = (s) => (lang === "hi" && plan && plan.hi && plan.hi[s]) || s;
const loc = () => (lang === "hi" ? "hi-IN" : "en-IN");
function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = T(el.dataset.i18n); });
  $("lang").textContent = T("lang");
  $("lang").setAttribute("aria-label", lang === "hi" ? "Switch to English" : "हिन्दी में देखें");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day = (d) => new Date(d + "T00:00");
const fmt = (d) => day(d).toLocaleDateString(loc(), { day: "numeric", month: "short" });
const fmtLong = (d) => day(d).toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short" });
const show = (el, on) => { el.hidden = !on; };
const isLate = (t) => t.status !== "done" && day(t.due) < today;
const daysTo = (d) => Math.ceil((day(d) - today) / 864e5);

/* ---------- auth ---------- */
function idToken() {
  return new Promise((resolve, reject) => {
    const u = pool.getCurrentUser();
    if (!u) return reject(new Error("Not signed in"));
    u.getSession((err, s) => (err || !s || !s.isValid() ? reject(err || new Error("Session expired")) : resolve(s.getIdToken().getJwtToken())));
  });
}
function signIn(email, password) {
  const user = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool });
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve("ok"),
      onFailure: reject,
      newPasswordRequired: () => { pendingUser = user; resolve("new_password"); },
    });
  });
}
const newPassword = (pw) => new Promise((resolve, reject) => pendingUser.completeNewPasswordChallenge(pw, {}, { onSuccess: () => resolve(), onFailure: reject }));

/* ---------- db ---------- */
async function api(method, path, body) {
  const r = await fetch(C.dbBase + path, {
    method,
    headers: { Authorization: "Bearer " + (await idToken()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || "Request failed (" + r.status + ")");
  return j;
}
async function listAll(collection) {
  const out = []; let cursor = "";
  do {
    const j = await api("GET", `/collections/${collection}/items?limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    out.push(...j.items); cursor = j.nextCursor || "";
  } while (cursor);
  return out;
}
async function load() {
  show($("derr"), false);
  try {
    const [p, t] = await Promise.all([api("GET", "/collections/shaadi_plan/items/main"), listAll("shaadi_tasks")]);
    plan = p.data;
    if (!plan || !Array.isArray(plan.days) || !plan.stay) throw new Error("the plan is incomplete (it has: " + Object.keys(plan || {}).join(", ") + ")");
    tasks = t.map((x) => ({ owner: "Unassigned", due: "2027-02-13", status: "todo", event: "General", ...x.data }));
    $("status").textContent = T("updated", { n: tasks.length, t: new Date().toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit" }) });
    render();
  } catch (e) {
    $("derr").textContent = T("loadFail") + e.message; show($("derr"), true);
  }
}
async function saveTask(t) {
  try { await api("PUT", `/collections/shaadi_tasks/items/${encodeURIComponent(t.id)}`, t); }
  catch (e) { $("derr").textContent = T("saveFail") + e.message; show($("derr"), true); await load(); }
}

/* ---------- views ---------- */
const people = () => plan.family;
const openTasks = (list = tasks) => list.filter((t) => t.status !== "done");
const byDue = (a, b) => a.due.localeCompare(b.due);

function taskRow(t, withOwner = true) {
  const state = editing
    ? `<button class="state ${t.status}" data-cycle="${esc(t.id)}" aria-label="${T("status_" + t.status)}">${T("status_" + t.status)}</button>`
    : `<span class="state ${t.status}">${T("status_" + t.status)}</span>`;
  const planned = t.suggested && t.suggested !== t.owner ? `<div><span class="tag">${esc(T("plannedFor", { p: L(t.suggested) }))}</span></div>` : "";
  const owner = editing
    ? `<div class="owner"><label class="small" style="margin:0 0 2px" for="o${esc(t.id)}">${T("owner")}</label><select id="o${esc(t.id)}" data-owner="${esc(t.id)}">${people().concat(people().includes(t.owner) ? [] : [t.owner]).map((o) => `<option value="${esc(o)}" ${o === t.owner ? "selected" : ""}>${esc(L(o))}</option>`).join("")}</select></div>`
    : "";
  return `<div class="task">${state}<div class="body"><div class="title">${esc(L(t.title))}</div>
    <div class="meta">${esc(L(t.event))}${withOwner ? " · " + esc(L(t.owner)) : ""} · <span class="due ${isLate(t) ? "late" : ""}">${isLate(t) ? T("overdueWas") : T("due")} ${fmt(t.due)}</span></div>${planned}${owner}</div></div>`;
}
const list = (rows, empty) => (rows.length ? `<div class="card flat">${rows.join("")}</div>` : `<div class="card empty">${empty}</div>`);

function home() {
  const total = tasks.length, done = tasks.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const d = daysTo(plan.wedding);
  let mine = me ? openTasks(tasks.filter((t) => t.owner === me)).sort(byDue) : [];
  const planned = me && !mine.length;
  if (planned) mine = openTasks(tasks.filter((t) => t.suggested === me)).sort(byDue);
  const soon = openTasks().sort(byDue).slice(0, 5);
  return `<div class="card"><div class="hero"><span class="big">${Math.max(0, d)}</span><span><b>${T("daysToGo")}</b><br><span class="mut">${T("functionsStart")} ${fmtLong(plan.days[0].date)}</span></span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="small mut" style="margin-top:6px">${T("tasksDone", { n: done, m: total })}</div></div>
    <h2>${T("whoLooking")}</h2>
    <div class="who">${people().map((p) => `<button class="pill ${p === me ? "on" : ""}" data-me="${esc(p)}">${esc(L(p))}</button>`).join("")}</div>
    ${me ? `<h2 style="margin-top:22px">${esc(T("nextTasks", { p: L(me) }))}</h2>${planned && mine.length ? `<p class="mut small" style="margin:-6px 0 10px">${esc(T("plannedNote", { p: L(me) }))}</p>` : ""}${list(mine.slice(0, 6).map((t) => taskRow(t, false)), esc(T("nothingFor", { p: L(me) })))}
      ${mine.length > 6 ? `<button class="btn" data-go="tasks" data-who="${esc(me)}">${esc(T("seeAllOf", { n: mine.length, p: L(me) }))}</button>` : mine.length ? `<button class="btn" data-go="tasks" data-who="${esc(me)}">${T("openTasks")}</button>` : ""}` : `<p class="mut">${T("pickName")}</p>`}
    <h2 style="margin-top:26px">${T("comingUp")}</h2>${list(soon.map((t) => taskRow(t)), T("allDone"))}
    <button class="btn" data-go="tasks" data-who="All">${T("seeAll")}</button>`;
}

function fnKey(date, name) {
  if (date === "2027-02-13") return "Mayna (13 Feb)";
  const w = name.toLowerCase().split(/[ (]/)[0];
  return w === "varmala" ? "mandap" : w;
}
const matches = (t, key) => (key === "Mayna (13 Feb)" ? t.event === key : t.event.toLowerCase().split(/[ (]/)[0] === key);
function schedule() {
  return plan.days.map((dy) => { const seen = new Set(); return `<div class="card day"><h3>${fmtLong(dy.date)}</h3><div class="mut small">${esc(L(dy.title))}</div>` +
    dy.slots.map((s) => `<div class="part">${esc(L(s.part))}</div>` + s.events.map((e) => {
      const key = fnKey(dy.date, e), first = !seen.has(key); seen.add(key);
      const n = first ? openTasks(tasks.filter((t) => matches(t, key))).length : 0;
      return `<button class="fn" data-go="tasks" data-fn="${esc(tasks.find((t) => matches(t, key))?.event || "All")}"><span>${esc(L(e))}</span>${n ? `<span class="n">${T("nTodoArrow", { n })}</span>` : ""}</button>`;
    }).join("")).join("") + `</div>`; }).join("");
}

function stay() {
  const S = plan.stay, dates = Object.keys(S.totals);
  const nights = (r) => `<div class="nights">${dates.map((x) => `<div><b>${r[x] || "–"}</b><span>${esc(L(x))}</span></div>`).join("")}</div>`;
  return `<div class="card"><h3>${T("roomsNeed")}</h3>${`<div class="nights">${dates.map((x) => `<div class="total"><b>${S.totals[x]}</b><span>${esc(L(x))}</span></div>`).join("")}</div>`}</div>` +
    S.hotels.map((h) => `<div class="card"><h3>${esc(L(h.name))}</h3><div class="mut small" style="margin-top:4px">${esc(L(h.note))}</div>${nights(h.rooms)}</div>`).join("") +
    `<div class="card"><h3>${T("gettingAround")}</h3><ul class="clean">${S.commute.map((c) => `<li>${esc(L(c))}</li>`).join("")}</ul></div>` +
    `<div class="card"><h3>${T("alsoSort")}</h3><ul class="clean">${S.notes.map((c) => `<li>${esc(L(c))}</li>`).join("")}</ul></div>`;
}

function tasksView() {
  const fns = ["All", ...new Set([...(plan.events || []), ...tasks.map((t) => t.event)])];
  const names = ["All", ...people(), ...(tasks.some((t) => t.owner === "Unassigned") ? ["Unassigned"] : [])];
  const pick = tasks.filter((t) => (who === "All" || t.owner === who) && (fn === "All" || t.event === fn)).sort(byDue);
  const open = pick.filter((t) => t.status !== "done"), done = pick.filter((t) => t.status === "done");
  const groups = new Map();
  for (const t of open) {
    const g = isLate(t) ? T("overdue") : day(t.due).toLocaleDateString(loc(), { month: "long", year: "numeric" });
    (groups.get(g) || groups.set(g, []).get(g)).push(t);
  }
  const html = [...groups].map(([g, ts]) => `<div class="group ${isLate(ts[0]) ? "late" : ""}">${esc(g)} · ${ts.length}</div><div class="card flat">${ts.map((t) => taskRow(t)).join("")}</div>`).join("");
  return `<div class="filters"><div class="seg" role="group" aria-label="Whose tasks">${names.map((n) => `<button class="pill ${n === who ? "on" : ""}" data-who="${esc(n)}">${esc(n === "All" ? T("all") : L(n))}</button>`).join("")}</div>
      <label class="small" style="margin:0" for="fnsel">${T("fn")}</label><select id="fnsel">${fns.map((f) => `<option ${f === fn ? "selected" : ""} value="${esc(f)}">${f === "All" ? T("allFns") : esc(L(f))}</option>`).join("")}</select></div>
    <p class="mut small" style="margin:12px 0 0">${T("nToDo", { n: open.length })}${done.length ? " · " + T("nDone", { n: done.length }) : ""}${editing ? " · " + T("tapStatus") : ""}</p>
    ${html || `<div class="card empty">${T("noOpen")}</div>`}
    ${done.length ? `<button class="btn" data-done="1">${T(showDone ? "hideDone" : "showDone", { n: done.length })}</button>${showDone ? `<div class="card flat" style="margin-top:12px">${done.map((t) => taskRow(t)).join("")}</div>` : ""}` : ""}`;
}

function render() {
  if (!plan) return;
  $("view").innerHTML = { home, schedule, stay, tasks: tasksView }[tab]();
  document.querySelectorAll("nav button").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  $("edit").textContent = editing ? T("doneEditing") : T("edit");
  applyStatic();
  $("edit").classList.toggle("on", editing);
}
function go(t) { tab = TABS.includes(t) ? t : "home"; if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab); render(); window.scrollTo(0, 0); }

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !plan) return;
  const d = b.dataset;
  if (d.tab) return go(d.tab);
  if (d.me !== undefined) { me = d.me; store.set("me", me); return render(); }
  if (d.cycle) { const t = tasks.find((x) => String(x.id) === d.cycle); if (t) { t.status = NEXT[t.status]; saveTask(t); render(); } return; }
  if (d.done) { showDone = !showDone; return render(); }
  if (d.go) { if (d.who !== undefined) who = d.who; if (d.fn !== undefined) { fn = d.fn; if (d.who === undefined) who = "All"; } return go(d.go); }
  if (d.who !== undefined) { who = d.who; return render(); }
});
document.addEventListener("change", (e) => {
  const s = e.target;
  if (s.id === "fnsel") { fn = s.value; return render(); }
  if (s.dataset.owner) { const t = tasks.find((x) => String(x.id) === s.dataset.owner); if (t) { t.owner = s.value; saveTask(t); render(); } }
});
async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
$("lang").onclick = () => { lang = lang === "hi" ? "en" : "hi"; store.set("lang", lang); render(); };
$("edit").onclick = () => {
  if (editing) { editing = false; return render(); }
  show($("pinf"), true); $("pin").focus();
};
$("pinx").onclick = () => { show($("pinf"), false); show($("perr"), false); $("pin").value = ""; };
$("pinf").onsubmit = async (e) => {
  e.preventDefault();
  if (C.pinHash && (await sha(`${C.pinSalt}:${$("pin").value}`)) === C.pinHash) {
    editing = true; $("pin").value = ""; show($("perr"), false); show($("pinf"), false); go("tasks");
  } else show($("perr"), true);
};
$("out").onclick = () => { const u = pool.getCurrentUser(); if (u) u.signOut(); plan = null; editing = false; start(); };
$("lf").onsubmit = async (e) => {
  e.preventDefault(); show($("lerr"), false); $("lb").disabled = true;
  try {
    const r = !pendingUser || $("np").hidden ? await signIn($("em").value.trim(), $("pw").value) : (await newPassword($("pw2").value), "ok");
    if (r === "new_password") { show($("np"), true); $("pw2").focus(); $("lerr").textContent = T("firstSignIn"); show($("lerr"), true); }
    else { $("pw").value = ""; $("pw2").value = ""; pendingUser = null; show($("np"), false); start(); }
  } catch (err) { $("lerr").textContent = err.message || T("signInFail"); show($("lerr"), true); }
  $("lb").disabled = false;
};
window.addEventListener("hashchange", () => plan && go(location.hash.slice(1)));

applyStatic();
async function start() {
  let ok = false;
  try { await idToken(); ok = true; } catch { /* not signed in */ }
  show($("login"), !ok); show($("app"), ok); show($("nav"), ok);
  if (ok) { tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home"; load(); }
}
start();
