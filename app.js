"use strict";
const $ = (id) => document.getElementById(id);
const C = window.CFG;
const pool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: C.userPoolId, ClientId: C.clientId });
const TABS = ["home", "schedule", "stay", "tasks"];
const NEXT = { todo: "doing", doing: "done", done: "todo" };
const LABEL = { todo: "To do", doing: "In progress", done: "Done" };
let pendingUser = null, plan = null, tasks = [], editing = false, showDone = false;
let tab = "home", who = "All", fn = "All", me = "";
const today = new Date(new Date().toDateString());

const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
me = store.get("me");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day = (d) => new Date(d + "T00:00");
const fmt = (d) => day(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtLong = (d) => day(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
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
    $("status").textContent = `${tasks.length} tasks · updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    render();
  } catch (e) {
    $("derr").textContent = "Could not load the plan: " + e.message; show($("derr"), true);
  }
}
async function saveTask(t) {
  try { await api("PUT", `/collections/shaadi_tasks/items/${encodeURIComponent(t.id)}`, t); }
  catch (e) { $("derr").textContent = "Could not save that change: " + e.message; show($("derr"), true); await load(); }
}

/* ---------- views ---------- */
const people = () => plan.family;
const openTasks = (list = tasks) => list.filter((t) => t.status !== "done");
const byDue = (a, b) => a.due.localeCompare(b.due);

function taskRow(t, withOwner = true) {
  const state = editing
    ? `<button class="state ${t.status}" data-cycle="${esc(t.id)}" aria-label="Status: ${LABEL[t.status]}. Tap to change.">${LABEL[t.status]}</button>`
    : `<span class="state ${t.status}">${LABEL[t.status]}</span>`;
  const planned = t.suggested && t.suggested !== t.owner ? `<div><span class="tag">Planned for ${esc(t.suggested)}</span></div>` : "";
  const owner = editing
    ? `<div class="owner"><label class="small" style="margin:0 0 2px" for="o${esc(t.id)}">Owner</label><select id="o${esc(t.id)}" data-owner="${esc(t.id)}">${people().concat(people().includes(t.owner) ? [] : [t.owner]).map((o) => `<option ${o === t.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`
    : "";
  return `<div class="task">${state}<div class="body"><div class="title">${esc(t.title)}</div>
    <div class="meta">${esc(t.event)}${withOwner ? " · " + esc(t.owner) : ""} · <span class="due ${isLate(t) ? "late" : ""}">${isLate(t) ? "Overdue, was " : "Due "}${fmt(t.due)}</span></div>${planned}${owner}</div></div>`;
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
  return `<div class="card"><div class="hero"><span class="big">${Math.max(0, d)}</span><span><b>days to go</b><br><span class="mut">Functions start ${fmtLong(plan.days[0].date)}</span></span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="small mut" style="margin-top:6px">${done} of ${total} tasks done</div></div>
    <h2>Who is looking?</h2>
    <div class="who">${people().map((p) => `<button class="pill ${p === me ? "on" : ""}" data-me="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    ${me ? `<h2 style="margin-top:22px">${esc(me)}'s next tasks</h2>${planned && mine.length ? `<p class="mut small" style="margin:-6px 0 10px">Not confirmed yet. These are planned for ${esc(me)}.</p>` : ""}${list(mine.slice(0, 6).map((t) => taskRow(t, false)), "Nothing for " + esc(me) + " yet.")}
      ${mine.length > 6 ? `<button class="btn" data-go="tasks" data-who="${esc(me)}">See all ${mine.length} of ${esc(me)}'s tasks</button>` : mine.length ? `<button class="btn" data-go="tasks" data-who="${esc(me)}">Open tasks</button>` : ""}` : `<p class="mut">Pick your name to see your own tasks first.</p>`}
    <h2 style="margin-top:26px">Coming up for everyone</h2>${list(soon.map((t) => taskRow(t)), "All tasks are done.")}
    <button class="btn" data-go="tasks" data-who="All">See all tasks</button>`;
}

function fnKey(date, name) {
  if (date === "2027-02-13") return "Mayna (13 Feb)";
  const w = name.toLowerCase().split(/[ (]/)[0];
  return w === "varmala" ? "mandap" : w;
}
const matches = (t, key) => (key === "Mayna (13 Feb)" ? t.event === key : t.event.toLowerCase().split(/[ (]/)[0] === key);
function schedule() {
  return plan.days.map((dy) => { const seen = new Set(); return `<div class="card day"><h3>${fmtLong(dy.date)}</h3><div class="mut small">${esc(dy.title)}</div>` +
    dy.slots.map((s) => `<div class="part">${esc(s.part)}</div>` + s.events.map((e) => {
      const key = fnKey(dy.date, e), first = !seen.has(key); seen.add(key);
      const n = first ? openTasks(tasks.filter((t) => matches(t, key))).length : 0;
      return `<button class="fn" data-go="tasks" data-fn="${esc(tasks.find((t) => matches(t, key))?.event || "All")}"><span>${esc(e)}</span>${n ? `<span class="n">${n} to do ›</span>` : ""}</button>`;
    }).join("")).join("") + `</div>`; }).join("");
}

function stay() {
  const S = plan.stay, dates = Object.keys(S.totals);
  const nights = (r) => `<div class="nights">${dates.map((x) => `<div><b>${r[x] || "–"}</b><span>${esc(x)}</span></div>`).join("")}</div>`;
  return `<div class="card"><h3>Rooms we need</h3>${`<div class="nights">${dates.map((x) => `<div class="total"><b>${S.totals[x]}</b><span>${esc(x)}</span></div>`).join("")}</div>`}</div>` +
    S.hotels.map((h) => `<div class="card"><h3>${esc(h.name)}</h3><div class="mut small" style="margin-top:4px">${esc(h.note)}</div>${nights(h.rooms)}</div>`).join("") +
    `<div class="card"><h3>Getting around (14 &amp; 15 Feb)</h3><ul class="clean">${S.commute.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` +
    `<div class="card"><h3>Also to sort</h3><ul class="clean">${S.notes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
}

function tasksView() {
  const fns = ["All", ...new Set([...(plan.events || []), ...tasks.map((t) => t.event)])];
  const names = ["All", ...people(), ...(tasks.some((t) => t.owner === "Unassigned") ? ["Unassigned"] : [])];
  const pick = tasks.filter((t) => (who === "All" || t.owner === who) && (fn === "All" || t.event === fn)).sort(byDue);
  const open = pick.filter((t) => t.status !== "done"), done = pick.filter((t) => t.status === "done");
  const groups = new Map();
  for (const t of open) {
    const g = isLate(t) ? "Overdue" : day(t.due).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    (groups.get(g) || groups.set(g, []).get(g)).push(t);
  }
  const html = [...groups].map(([g, ts]) => `<div class="group ${g === "Overdue" ? "late" : ""}">${esc(g)} · ${ts.length}</div><div class="card flat">${ts.map((t) => taskRow(t)).join("")}</div>`).join("");
  return `<div class="filters"><div class="seg" role="group" aria-label="Whose tasks">${names.map((n) => `<button class="pill ${n === who ? "on" : ""}" data-who="${esc(n)}">${esc(n)}</button>`).join("")}</div>
      <label class="small" style="margin:0" for="fnsel">Function</label><select id="fnsel">${fns.map((f) => `<option ${f === fn ? "selected" : ""} value="${esc(f)}">${f === "All" ? "All functions" : esc(f)}</option>`).join("")}</select></div>
    <p class="mut small" style="margin:12px 0 0">${open.length} to do${done.length ? ` · ${done.length} done` : ""}${editing ? " · tap a status to change it" : ""}</p>
    ${html || `<div class="card empty">No open tasks here.</div>`}
    ${done.length ? `<button class="btn" data-done="1">${showDone ? "Hide" : "Show"} ${done.length} done</button>${showDone ? `<div class="card flat" style="margin-top:12px">${done.map((t) => taskRow(t)).join("")}</div>` : ""}` : ""}`;
}

function render() {
  if (!plan) return;
  $("view").innerHTML = { home, schedule, stay, tasks: tasksView }[tab]();
  document.querySelectorAll("nav button").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  $("edit").textContent = editing ? "Done editing" : "Edit";
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
    if (r === "new_password") { show($("np"), true); $("pw2").focus(); $("lerr").textContent = "First sign-in: choose your own password."; show($("lerr"), true); }
    else { $("pw").value = ""; $("pw2").value = ""; pendingUser = null; show($("np"), false); start(); }
  } catch (err) { $("lerr").textContent = err.message || "Sign-in failed."; show($("lerr"), true); }
  $("lb").disabled = false;
};
window.addEventListener("hashchange", () => plan && go(location.hash.slice(1)));

async function start() {
  let ok = false;
  try { await idToken(); ok = true; } catch { /* not signed in */ }
  show($("login"), !ok); show($("app"), ok); show($("nav"), ok);
  if (ok) { tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home"; load(); }
}
start();
