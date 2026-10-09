"use strict";
const $ = (id) => document.getElementById(id);
const C = window.CFG;
const pool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: C.userPoolId, ClientId: C.clientId });
let pendingUser = null, plan = null, tasks = [], editing = false, who = "All", ev = "All";
const today = new Date(new Date().toDateString());

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (d) => new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const show = (el, on) => { el.hidden = !on; };

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
function newPassword(pw) {
  return new Promise((resolve, reject) => pendingUser.completeNewPasswordChallenge(pw, {}, { onSuccess: () => resolve(), onFailure: reject }));
}

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
    plan = p.data; tasks = t.map((x) => x.data);
    renderAll();
  } catch (e) {
    $("derr").textContent = "Could not load the plan: " + e.message; show($("derr"), true);
  }
}
async function saveTask(t) {
  try { await api("PUT", `/collections/shaadi_tasks/items/${encodeURIComponent(t.id)}`, t); }
  catch (e) { $("derr").textContent = "Could not save: " + e.message; show($("derr"), true); await load(); }
}

/* ---------- render ---------- */
function renderAll() {
  $("d").textContent = Math.max(0, Math.ceil((new Date(plan.wedding + "T00:00") - today) / 864e5));
  $("sched").innerHTML = plan.days.map((d) => `<div class="card"><h3>${fmt(d.date)} · ${esc(d.title)}</h3>` +
    d.slots.map((s) => `<div class="slot"><span class="p">${esc(s.part)}</span>${s.events.map((e) => `<span class="chip">${esc(e)}</span>`).join("")}</div>`).join("") + `</div>`).join("");
  const S = plan.stay, dates = Object.keys(S.totals);
  $("stay").innerHTML = `<div class="card"><table><thead><tr><th>Rooms</th>${dates.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>` +
    S.hotels.map((h) => `<tr><td>${esc(h.name)}</td>${dates.map((x) => `<td>${h.rooms[x] || "–"}</td>`).join("")}</tr>`).join("") +
    `</tbody><tfoot><tr><td>Total</td>${dates.map((x) => `<td>${S.totals[x]}</td>`).join("")}</tr></tfoot></table></div>` +
    S.hotels.map((h) => `<div class="card"><h3>${esc(h.name)}</h3><span class="sub">${esc(h.note)}</span></div>`).join("") +
    `<div class="card"><h3>Commute (14 &amp; 15 Feb)</h3><ul>${S.commute.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` +
    `<div class="card"><h3>Also to sort</h3><ul>${S.notes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`;
  renderTasks();
}
function chips(list, cur, k) { return list.map((n) => `<button class="${n === cur ? "on" : ""}" data-${k}="${esc(n)}">${esc(n)}</button>`).join(""); }
function renderTasks() {
  const evs = ["All", ...new Set([...(plan.events || []), ...tasks.map((t) => t.event)])];
  const names = ["All", ...plan.family, ...(tasks.some((t) => t.owner === "Unassigned") ? ["Unassigned"] : [])];
  $("ev").innerHTML = chips(evs, ev, "ev"); $("who").innerHTML = chips(names, who, "who");
  const owners = plan.family;
  const list = tasks.filter((t) => (who === "All" || t.owner === who) && (ev === "All" || t.event === ev)).sort((a, b) => a.due.localeCompare(b.due));
  $("tasks").innerHTML = list.map((t) => {
    const late = t.status !== "done" && new Date(t.due + "T00:00") < today;
    const ctl = editing
      ? `<select data-st="${esc(t.id)}" aria-label="Status">${["todo", "doing", "done"].map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>
         <select data-ow="${esc(t.id)}" aria-label="Owner">${owners.map((o) => `<option ${o === t.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : `<span class="st ${esc(t.status)}">${esc(t.status)}</span>`;
    return `<div class="task"><div class="t">${esc(t.title)}<br><small>${esc(t.event)} · ${esc(t.owner)}${t.suggested && t.suggested !== t.owner ? " → " + esc(t.suggested) : ""} · <span class="${late ? "late" : ""}">due ${fmt(t.due)}</span></small></div><div class="row">${ctl}</div></div>`;
  }).join("") || '<p class="sub">No tasks.</p>';
  const open = tasks.filter((t) => t.status !== "done");
  $("open").textContent = open.length;
  $("late").textContent = open.filter((t) => new Date(t.due + "T00:00") < today).length;
}

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !plan) return;
  if (b.dataset.ev !== undefined) ev = b.dataset.ev;
  if (b.dataset.who !== undefined) who = b.dataset.who;
  if (b.dataset.ev !== undefined || b.dataset.who !== undefined) renderTasks();
});
document.addEventListener("change", (e) => {
  const s = e.target; const id = s.dataset.st || s.dataset.ow; if (!id) return;
  const t = tasks.find((x) => String(x.id) === id); if (!t) return;
  if (s.dataset.st) t.status = s.value; else t.owner = s.value;
  saveTask(t); renderTasks();
});
async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
$("edit").onclick = () => {
  if (editing) { editing = false; $("edit").textContent = "Edit mode"; $("edit").classList.remove("on"); renderTasks(); return; }
  show($("pinf"), true); $("pin").focus();
};
$("pinf").onsubmit = async (e) => {
  e.preventDefault();
  if (C.pinHash && (await sha(`${C.pinSalt}:${$("pin").value}`)) === C.pinHash) {
    editing = true; $("pin").value = ""; show($("perr"), false); show($("pinf"), false);
    $("edit").textContent = "Edit mode on"; $("edit").classList.add("on"); renderTasks();
  } else show($("perr"), true);
};
$("out").onclick = () => { const u = pool.getCurrentUser(); if (u) u.signOut(); plan = null; start(); };
$("lf").onsubmit = async (e) => {
  e.preventDefault(); show($("lerr"), false); $("lb").disabled = true;
  try {
    const r = !pendingUser || $("np").hidden ? await signIn($("em").value.trim(), $("pw").value) : (await newPassword($("pw2").value), "ok");
    if (r === "new_password") { show($("np"), true); $("pw2").focus(); $("lerr").textContent = "First sign-in: choose your own password."; show($("lerr"), true); }
    else { $("pw").value = ""; $("pw2").value = ""; pendingUser = null; show($("np"), false); start(); }
  } catch (err) { $("lerr").textContent = err.message || "Sign-in failed."; show($("lerr"), true); }
  $("lb").disabled = false;
};

async function start() {
  let ok = false;
  try { await idToken(); ok = true; } catch { /* not signed in */ }
  show($("login"), !ok); show($("app"), ok);
  if (ok) load();
}
start();
