const SPECIAL_SLOTS = ["DPS", "Bait", "Empty"]; // extra choices in the loadout

const SUB_ROLES = [
  ["", "Sub-role: none"],
  ["optional", "Optional"],
  ["change", "Can change to..."],
  ["bait", "Bait"]
];

// Colors offered after the ones drawn on the map
const PALETTE = ["#ff4d4d", "#ffa94d", "#ffe14d", "#5ee26b", "#4dd2ff", "#4d7bff", "#b84dff", "#ff4da6", "#ffffff"];


const CREDIT = "TDesign by FiveDextor"; // always shown, please keep

function creditText(m) {
  return (m && m.author ? "Strategy by " + m.author + " · " : "") + CREDIT;
}

// Contributors line plus the game's credits, one string each
function extraCredits(m) {
  const list = [];
  const people = (m.contributors || [])
    .filter(c => (c.name || "").trim())
    .map(c => c.name.trim() + ((c.role || "").trim() ? " (" + c.role.trim() + ")" : ""));
  if (people.length) list.push("Contributors: " + people.join(", "));
  (gameOf(m).credits || []).forEach(c => list.push(c));
  return list;
}

// Remembered between redraws so your brush settings don't reset
let paintTool = { t: "brush", c: "#ff4d4d", s: 14 };

const KEY = "td-strategy-v1";
let data = load();
normalize();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.maps)) return d;
  } catch (e) {}
  return { maps: [], current: null, game: null };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach(k => e.append(k));
  return e;
}

/* ---------- Pop-ups and confirm buttons ---------- */
// Returns a Promise: the typed text (if input), true (OK), or null (cancelled)
function openModal({ title, text, input, value = "", ok = "OK", cancel = true, danger = false }) {
  return new Promise(resolve => {
    const overlay = el("div", { className: "modal-overlay" });
    const box = el("div", { className: "modal" });
    box.append(el("h3", { textContent: title }));
    if (text) box.append(el("p", { textContent: text }));

    let field = null;
    if (input) {
      field = el("input", { type: "text", placeholder: input, value: value, className: "modal-input" });
      box.append(field);
    }

    function close(value) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    }

    const okBtn = el("button", {
      textContent: ok,
      className: danger ? "danger" : "primary",
      onclick: () => {
        if (field) {
          const v = field.value.trim();
          if (!v) { field.focus(); return; }
          close(v);
        } else {
          close(true);
        }
      }
    });

    const buttons = el("div", { className: "modal-buttons" });
    if (cancel) buttons.append(el("button", { textContent: "Cancel", onclick: () => close(null) }));
    buttons.append(okBtn);
    box.append(buttons);

    function onKey(e) {
      if (e.key === "Escape" && cancel) close(null);
      if (e.key === "Enter" && e.target.tagName !== "BUTTON") okBtn.click();
    }
    document.addEventListener("keydown", onKey);
    overlay.onmousedown = e => { if (e.target === overlay && cancel) close(null); };

    overlay.append(box);
    document.body.append(overlay);
    if (field) field.focus(); else okBtn.focus();
  });
}

// Button that turns red and says "Confirm?" on the first click
function confirmButton(label, onConfirm) {
  let armed = false;
  let timer = null;
  const b = el("button", { textContent: label });

  function disarm() {
    armed = false;
    clearTimeout(timer);
    b.textContent = label;
    b.classList.remove("danger");
  }

  b.onclick = () => {
    if (!armed) {
      armed = true;
      b.textContent = "Confirm?";
      b.classList.add("danger");
      timer = setTimeout(disarm, 3000);
    } else {
      disarm();
      onConfirm();
    }
  };
  b.onblur = disarm;
  return b;
}

/* ---------- Game / tower helpers ---------- */
// Note: data.maps holds your STRATEGIES (the name is kept so saved data still works)
function gameOf(m) {
  return GAMES[m.game] || { towers: [] };
}

function isSpecial(name) {
  return SPECIAL_SLOTS.includes(name);
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Image path: the tower's own "img" if set, otherwise images/<game>/<slug>.png
function towerImg(m, name) {
  const t = (gameOf(m).towers || []).find(x => x.name === name);
  if (t && t.img) return t.img;
  return "images/" + m.game + "/" + slug(name) + ".png";
}

function pathCount(m, name) {
  const t = (gameOf(m).towers || []).find(x => x.name === name);
  return (t && t.paths) || 2;
}

function ensureLoadout(m) {
  const size = gameOf(m).loadoutSize || 5;
  if (!Array.isArray(m.loadout)) m.loadout = [];
  while (m.loadout.length < size) m.loadout.push({ tower: "" });
}

// Colors used in this strategy's painting, in the order they were first used
function drawnColors(m) {
  const seen = [];
  (m.paint || []).forEach(st => {
    if (st.t !== "erase" && st.c && !seen.includes(st.c)) seen.push(st.c);
  });
  return seen;
}

/* ---------- State helpers ---------- */
function normalize() {
  const ids = Object.keys(GAMES);
  if (!GAMES[data.game]) data.game = ids[0];

  if (!Array.isArray(data.folders)) data.folders = [];
  {
    const af = folderById(data.activeFolder);
    if (!af || af.game !== data.game) data.activeFolder = "";
  }

  const knownActions = ACTIONS.map(a => a.id);
  data.maps.forEach(m => {
    if (!m.game) m.game = ids[0];
    if (!m.folder || !folderById(m.folder)) m.folder = "";
    if (!Array.isArray(m.contributors)) {
      m.contributors = String(m.credits || "").split("\n")
        .map(x => x.trim()).filter(Boolean)
        .map(x => ({ name: x, role: "" }));
    }
    if (!Array.isArray(m.paint)) m.paint = [];
    if (m.map === undefined) m.map = "";
    ensureLoadout(m);
      eachStep(m.steps, s => {
      // old free-text actions become "Other" with the text kept
      if (s.action && !knownActions.includes(s.action)) {
        s.text = s.text || s.action;
        s.action = "other";
      }
    });
  });

  const cur = currentMap();
  if (!cur || cur.game !== data.game) {
    const first = mapsForGame()[0];
    data.current = first ? first.id : null;
  }
}

function currentMap() {
  return data.maps.find(m => m.id === data.current) || null;
}

function mapsForGame() {
  return data.maps.filter(m => m.game === data.game);
}

function renderAll() {
  renderGames();
  renderSidebar();
  renderMain();
}

/* ---------- Game picker ---------- */
function renderGames() {
  const sel = document.getElementById("gameSelect");
  sel.innerHTML = "";
  Object.keys(GAMES).forEach(id => {
    sel.append(el("option", { value: id, textContent: GAMES[id].name }));
  });
  sel.value = data.game;
  sel.onchange = () => {
    data.game = sel.value;
    normalize();
    save();
    renderAll();
  };
}

/* ---------- Sidebar (folders and strategies) ---------- */
function foldersForGame() {
  return (data.folders || []).filter(f => f.game === data.game);
}

function folderById(id) {
  return (data.folders || []).find(f => f.id === id) || null;
}

function strategiesIn(parent) {
  return mapsForGame().filter(m => (m.folder || "") === parent);
}

// [ [id, "A / B"], ... ] in tree order, for the Folder dropdown
function folderOptions() {
  const out = [];
  function walk(parent, prefix) {
    foldersForGame().filter(f => (f.parent || "") === parent).forEach(f => {
      const label = prefix ? prefix + " / " + f.name : f.name;
      out.push([f.id, label]);
      walk(f.id, label);
    });
  }
  walk("", "");
  return out;
}

function renderTree(container, parent, depth) {
  foldersForGame().filter(f => (f.parent || "") === parent).forEach(f => {
    const row = el("div", {
      className: "frow" + (data.activeFolder === f.id ? " active" : ""),
      style: "padding-left:" + depth * 14 + "px"
    });
    row.append(
      el("button", {
        className: "ftoggle", title: "Open or close",
        textContent: f.open === false ? "▸" : "▾",
        onclick: () => { f.open = (f.open === false); save(); renderSidebar(); }
      }),
      el("button", {
        className: "fname", textContent: f.name,
        onclick: () => { data.activeFolder = f.id; f.open = true; save(); renderSidebar(); }
      }),
      el("button", { textContent: "✎", title: "Rename folder", onclick: () => renameFolder(f) }),
      el("button", { textContent: "✕", title: "Delete folder", onclick: () => deleteFolder(f) })
    );
    container.append(row);
    if (f.open !== false) renderTree(container, f.id, depth + 1);
  });

  strategiesIn(parent).forEach(m => {
    container.append(el("button", {
      textContent: m.name || "(unnamed)",
      className: m.id === data.current ? "active" : "",
      style: "padding-left:" + (8 + depth * 14) + "px",
      onclick: () => { data.current = m.id; save(); renderSidebar(); renderMain(); }
    }));
  });
}

function renderSidebar() {
  const list = document.getElementById("mapList");
  list.innerHTML = "";

  const af = folderById(data.activeFolder);
  document.getElementById("where").textContent =
    "New items go in: " + (af ? af.name : "top level");

  list.append(el("button", {
    className: "treeroot" + (!af ? " active" : ""),
    textContent: "Top level",
    onclick: () => { data.activeFolder = ""; save(); renderSidebar(); }
  }));

  renderTree(list, "", 0);
}

async function renameFolder(f) {
  const name = await openModal({
    title: "Rename folder", input: "Folder name", value: f.name, ok: "Rename"
  });
  if (!name) return;
  f.name = name;
  save(); renderSidebar(); renderMain();
}

async function deleteFolder(f) {
  const yes = await openModal({
    title: "Delete folder",
    text: "Delete \"" + f.name + "\"? Everything inside it moves up one level. Nothing else is deleted.",
    ok: "Delete folder",
    danger: true
  });
  if (!yes) return;
  const up = f.parent || "";
  data.folders.forEach(x => { if (x.parent === f.id) x.parent = up; });
  data.maps.forEach(m => { if (m.folder === f.id) m.folder = up; });
  data.folders = data.folders.filter(x => x.id !== f.id);
  if (data.activeFolder === f.id) data.activeFolder = up;
  save(); renderSidebar(); renderMain();
}

document.getElementById("addFolder").onclick = async () => {
  const name = await openModal({
    title: "New folder",
    text: "Folders can hold strategies and other folders.",
    input: "Folder name",
    ok: "Create"
  });
  if (!name) return;
  const f = {
    id: uid(), name, game: data.game, parent: data.activeFolder || "", open: true
  };
  data.folders.push(f);
  const p = folderById(f.parent);
  if (p) p.open = true;
  save(); renderSidebar(); renderMain();
};

document.getElementById("addMap").onclick = async () => {
  const name = await openModal({
    title: "New strategy",
    text: "Give your strategy a name.",
    input: "Strategy name",
    ok: "Create"
  });
  if (!name) return;
  const af = folderById(data.activeFolder);
  const m = {
    id: uid(), name, game: data.game, map: "", author: data.lastAuthor || "",
    folder: af && af.game === data.game ? af.id : "",
    notes: "", steps: [], loadout: [], paint: []
  };
  ensureLoadout(m);
  data.maps.push(m);
  data.current = m.id;
  save(); renderSidebar(); renderMain();
};

/* ---------- Searchable tower dropdown (supports groups) ---------- */
// groups: [ { title: "Loadout" or null, items: [ { value, label } ] } ]
function towerPicker(s, groups, onChange, placeholder) {
  const wrap = el("div", { className: "combo" });
  const input = el("input", { value: s.tower || "", placeholder: placeholder || "Search tower..." });
  const list = el("div", { className: "combo-list" });
  list.hidden = true;

  function choose(value) {
    s.tower = value;
    input.value = value;
    save();
    list.hidden = true;
    if (onChange) onChange();
  }

  function item(label, value) {
    return el("div", {
      className: "combo-item",
      textContent: label,
      onmousedown: e => { e.preventDefault(); choose(value); }
    });
  }

  function filtered(query) {
    const q = query.trim().toLowerCase();
    return groups
      .map(g => ({
        title: g.title,
        items: g.items.filter(i =>
          i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q))
      }))
      .filter(g => g.items.length);
  }

  function renderList(query) {
    list.innerHTML = "";
    const gs = filtered(query);
    if (!query.trim()) list.append(item("— none —", ""));
    gs.forEach(g => {
      if (g.title) list.append(el("div", { className: "combo-title", textContent: g.title }));
      g.items.forEach(i => list.append(item(i.label, i.value)));
    });
    if (!gs.length) {
      list.append(el("div", { className: "combo-empty", textContent: "No match" }));
    }
  }

  input.onfocus = () => {
    input.select();
    renderList("");
    list.hidden = false;
  };
  input.oninput = () => {
    renderList(input.value);
    list.hidden = false;
  };
  input.onkeydown = e => {
    if (e.key === "Enter") {
      const gs = filtered(input.value);
      if (gs.length) choose(gs[0].items[0].value);
      input.blur();
    } else if (e.key === "Escape") {
      input.blur();
    }
  };
  input.onblur = () => {
    list.hidden = true;
    input.value = s.tower || "";
  };

  wrap.append(input, list);
  return wrap;
}

// Loadout slots: DPS / Bait / Empty first, then every tower
function loadoutGroups(towers) {
  return [
    { title: "Placeholders", items: SPECIAL_SLOTS.map(n => ({ value: n, label: n })) },
    { title: "Towers", items: towers.map(t => ({ value: t.name, label: t.name })) }
  ];
}

// Actions: DPS, loadout towers and swap towers first, then every other tower
function actionGroups(m, towers) {
  const inLoad = [];
  m.loadout.forEach(sl => {
    [sl.tower, sl.sub === "change" ? sl.swap : ""].forEach(n => {
      if (n && !isSpecial(n) && !inLoad.includes(n)) inLoad.push(n);
    });
  });
  const top = [{ value: "DPS", label: "DPS" }]
    .concat(inLoad.map(n => ({ value: n, label: n })));
  const rest = towers
    .filter(t => !inLoad.includes(t.name))
    .map(t => ({ value: t.name, label: t.name }));
  return [
    { title: "Loadout", items: top },
    { title: "All towers", items: rest }
  ];
}

/* ---------- Action fields ---------- */
function choiceSelect(s, key, options) {
  const select = el("select", {
    onchange: e => { s[key] = e.target.value; save(); }
  }, ...options.map(([value, label]) => el("option", { value, textContent: label })));
  select.value = s[key] || "";
  return select;
}

function levelInput(s, key, max, placeholder) {
  return el("input", {
    type: "number", min: 0, max: max, className: "lvl",
    placeholder: placeholder,
    value: s[key] === undefined ? "" : s[key],
    oninput: e => { s[key] = e.target.value; save(); },
    onchange: e => {
      let v = e.target.value;
      if (v !== "") {
        v = String(Math.max(0, Math.min(max, Math.floor(Number(v)))));
        e.target.value = v;
      }
      s[key] = v;
      save();
    }
  });
}

// Round color button; the popup lists colors drawn on the map first
function colorPicker(s, m) {
  const wrap = el("div", { className: "colorpick" });
  const btn = el("button", {
    className: "swatch-btn", title: "Color", textContent: s.color ? "" : "—"
  });
  if (s.color) btn.style.background = s.color;
  const pop = el("div", { className: "swatch-pop" });
  pop.hidden = true;

  function pick(c) { s.color = c; save(); renderMain(); }

  function swatch(c) {
    const b = el("button", {
      className: "swatch" + (s.color === c ? " sel" : ""), title: c
    });
    b.style.background = c;
    b.onclick = () => pick(c);
    return b;
  }

  function buildPop() {
    pop.innerHTML = "";
    const drawn = drawnColors(m);
    if (drawn.length) {
      pop.append(el("div", { className: "swatch-label", textContent: "From your map" }));
      const row = el("div", { className: "swatch-row" });
      drawn.forEach(c => row.append(swatch(c)));
      pop.append(row);
    }
    pop.append(el("div", {
      className: "swatch-label", textContent: drawn.length ? "Other colors" : "Colors"
    }));
    const row2 = el("div", { className: "swatch-row" });
    PALETTE.filter(c => !drawn.includes(c)).forEach(c => row2.append(swatch(c)));
    pop.append(row2);
    pop.append(el("button", {
      className: "swatch-none", textContent: "No color", onclick: () => pick("")
    }));
  }

  function outside(e) { if (!wrap.contains(e.target)) close(); }
  function close() {
    pop.hidden = true;
    document.removeEventListener("mousedown", outside);
  }

  btn.onclick = () => {
    if (!pop.hidden) { close(); return; }
    buildPop();
    pop.hidden = false;
    document.addEventListener("mousedown", outside);
  };

  wrap.append(btn, pop);
  return wrap;
}

function fieldFor(name, s, m, towers) {
  if (name === "tower") {
    return towerPicker(s, actionGroups(m, towers), () => renderMain());
  }
  if (name === "path") {
    const max = gameOf(m).maxLevel || 5;
    const box = el("div", { className: "xx" });
    if (pathCount(m, s.tower) === 1) {
      box.append(levelInput(s, "single", max, "Lv"));
    } else {
      box.append(
        levelInput(s, "top", max, "Top"),
        el("span", { textContent: "-" }),
        levelInput(s, "bottom", max, "Bot")
      );
    }
    return box;
  }
  if (name === "max") {
    const options = pathCount(m, s.tower) === 1
      ? [["", "Max: nil"], ["single", "Max"]]
      : [["", "Max: nil"], ["top", "Max top"], ["bottom", "Max bottom"]];
    return choiceSelect(s, "max", options);
  }
  if (name === "color") {
    return colorPicker(s, m);
  }
  if (name === "time") {
    return el("input", {
      className: "time", value: s.time || "", placeholder: "Time e.g. 0:30",
      oninput: e => { s.time = e.target.value; save(); }
    });
  }
  if (name === "text") {
    return el("input", {
      value: s.text || "", placeholder: "Describe the action...",
      oninput: e => { s.text = e.target.value; save(); }
    });
  }
  return el("span");
}

function actionSelect(s) {
  const select = el("select", {
    onchange: e => { s.action = e.target.value; save(); renderMain(); }
  },
    el("option", { value: "", textContent: "— action —" }),
    ...ACTIONS.map(a => el("option", { value: a.id, textContent: a.label }))
  );
  select.value = s.action || "";
  return select;
}

/* ---------- Map picture + painting ---------- */
function renderBoard(m) {
  const wrap = el("div", { className: "mapbox" });
  const maps = gameOf(m).maps || [];

  // Map picker
  const mapProxy = {
    get tower() { return m.map || ""; },
    set tower(v) { m.map = v; }
  };
  const picker = towerPicker(
    mapProxy,
    [{ title: null, items: maps.map(mp => ({ value: mp.name, label: mp.name })) }],
    () => renderMain(),
    "Search map..."
  );
  wrap.append(el("div", { className: "maprow" },
    el("span", { textContent: "Map:" }), picker
  ));

  // Toolbar
  const bar = el("div", { className: "paintbar" });
  const toolBtns = [["brush", "Brush"], ["lasso", "Lasso"], ["erase", "Eraser"]].map(([t, label]) => {
    const b = el("button", {
      textContent: label,
      className: paintTool.t === t ? "active" : "",
      onclick: () => {
        paintTool.t = t;
        toolBtns.forEach(x => x.classList.toggle("active", x === b));
      }
    });
    return b;
  });
  bar.append(...toolBtns);
  bar.append(
    el("input", {
      type: "color", value: paintTool.c, title: "Color",
      oninput: e => { paintTool.c = e.target.value; }
    }),
    el("span", { textContent: "Size" }),
    el("input", {
      type: "range", min: 4, max: 60, value: paintTool.s,
      oninput: e => { paintTool.s = Number(e.target.value); }
    }),
    el("button", {
      textContent: "Undo",
      onclick: () => { m.paint.pop(); save(); redraw(); }
    }),
    confirmButton("Clear", () => { m.paint = []; save(); redraw(); }),
    el("span", { className: "hint", textContent: "Hold Shift for straight lines" })
  );
  wrap.append(bar);

  // Board = picture + transparent canvas on top
  const board = el("div", { className: "board" });
  const canvas = el("canvas", { className: "paint" });
  const mp = maps.find(x => x.name === m.map);

  if (mp) {
    const tries = ["images/" + m.game + "/maps/" + slug(mp.name) + ".png"];
    if (mp.img) tries.push(mp.img);
    let n = 0;
    const img = el("img", { className: "board-img", alt: mp.name, draggable: false });
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      n++;
      if (n < tries.length) {
        img.src = tries[n];
      } else {
        img.remove();
        board.classList.add("blank");
      }
    };
    img.src = tries[0];
    board.append(img);
  } else {
    board.classList.add("blank");
  }
  board.append(canvas);
  wrap.append(board);

  // ----- drawing -----
  function drawStroke(ctx, st, preview) {
    const w = canvas.width, h = canvas.height;
    const scale = w / 1000;
    const pts = st.p.map(([x, y]) => [x * w, y * h]);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (st.t === "lasso") {
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = st.c;
        ctx.lineWidth = 2 * scale;
        if (preview) {
          ctx.setLineDash([6 * scale, 4 * scale]);
          ctx.stroke();
        } else {
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = st.c;
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        }
      }
    } else {
      ctx.globalCompositeOperation = st.t === "erase" ? "destination-out" : "source-over";
      ctx.globalAlpha = st.t === "erase" ? 1 : 0.6;
      ctx.strokeStyle = st.c;
      ctx.fillStyle = st.c;
      ctx.lineWidth = st.s * scale;
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0][0], pts[0][1], (st.s * scale) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function redraw(live) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    m.paint.forEach(st => drawStroke(ctx, st, false));
    if (live) drawStroke(ctx, live, true);
  }

  function resize() {
    const r = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  }
  new ResizeObserver(resize).observe(board);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [
      +((e.clientX - r.left) / r.width).toFixed(4),
      +((e.clientY - r.top) / r.height).toFixed(4)
    ];
  }

  let live = null;
  let straightFrom = -1; // where the current Shift (straight) segment starts

  canvas.onpointerdown = e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    live = { t: paintTool.t, c: paintTool.c, s: paintTool.s, p: [pos(e)] };
    straightFrom = -1;
    redraw(live);
  };

  canvas.onpointermove = e => {
    if (!live) return;
    const p = pos(e);

    if (e.shiftKey) {
      // straight line from where Shift was pressed to the pointer
      if (straightFrom === -1) straightFrom = live.p.length - 1;
      live.p = live.p.slice(0, straightFrom + 1);
      live.p.push(p);
    } else {
      straightFrom = -1;
      const last = live.p[live.p.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;
      live.p.push(p);
    }
    redraw(live);
  };

  function finish() {
    if (!live) return;
    const st = live;
    live = null;
    straightFrom = -1;
    if (st.t === "lasso" && st.p.length < 2) { redraw(); return; }
    m.paint.push(st);
    save();
    redraw();
  }
  canvas.onpointerup = finish;
  canvas.onpointercancel = finish;

  return wrap;
}

/* ---------- Loadout ---------- */
// Fallback when a tower has no image yet
function badge(m, name) {
  const words = name.split(/\s+/).filter(Boolean);
  const text = (words.length > 1
    ? words.map(w => w[0]).join("").slice(0, 3)
    : name.slice(0, 3)).toUpperCase();

  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;

  return el("div", {
    className: "badge",
    textContent: text,
    title: "Add image: " + towerImg(m, name),
    style: "background: hsl(" + hue + ", 45%, 32%)"
  });
}

// DPS / Bait / Empty get a plain labeled badge
function specialBadge(name) {
  return el("div", {
    className: "badge special badge-" + name.toLowerCase(),
    textContent: name.toUpperCase()
  });
}

function renderLoadout(m, towers) {
  const box = el("div", { className: "loadout" });
  box.append(el("h3", { textContent: "Loadout" }));

  const size = gameOf(m).loadoutSize || 5;
  const grid = el("div", { className: "loadout-grid" });

  m.loadout.slice(0, size).forEach(slot => {
    const card = el("div", { className: "slot" });

    const imgBox = el("div", { className: "slot-img" });
    if (slot.tower) {
      if (isSpecial(slot.tower)) {
        imgBox.append(specialBadge(slot.tower));
      } else {
        const t = towers.find(x => x.name === slot.tower);
        const tries = ["images/" + m.game + "/" + slug(slot.tower) + ".png"];
        if (t && t.img) tries.push(t.img);
        let n = 0;
        const img = el("img", { alt: slot.tower });
        img.referrerPolicy = "no-referrer";
        img.onerror = () => {
          n++;
          if (n < tries.length) {
            img.src = tries[n];
          } else {
            imgBox.innerHTML = "";
            imgBox.append(badge(m, slot.tower));
          }
        };
        img.src = tries[0];
        imgBox.append(img);
      }
    }

    // Sub-role dropdown
    const subSelect = el("select", {
      onchange: e => { slot.sub = e.target.value; save(); renderMain(); }
    }, ...SUB_ROLES.map(([value, label]) => el("option", { value, textContent: label })));
    subSelect.value = slot.sub || "";

    card.append(
      imgBox,
      towerPicker(slot, loadoutGroups(towers), () => renderMain()),
      subSelect
    );

    // "Can change to..." shows a second tower search
    if (slot.sub === "change") {
      const swap = {
        get tower() { return slot.swap || ""; },
        set tower(v) { slot.swap = v; }
      };
      card.append(towerPicker(
        swap,
        [{ title: null, items: towers.map(t => ({ value: t.name, label: t.name })) }],
        () => renderMain()
      ));
    }

    grid.append(card);
  });

  box.append(grid);
  return box;
}

function renderMain() {
  const main = document.getElementById("main");
  main.innerHTML = "";
  const m = currentMap();
  if (!m) {
    main.append(el("p", { textContent: "Add or select a strategy to start." }));
    return;
  }

  const towers = gameOf(m).towers || [];
  const useWave = m.useWave !== false;

  main.append(el("input", {
    id: "mapName", value: m.name, placeholder: "Strategy name",
    oninput: e => { m.name = e.target.value; save(); renderSidebar(); }
  }));

  // credit lines (update live as you type)
  const creditLine = el("div", { className: "credit", textContent: creditText(m) });
  const extraBox = el("div", {});
  function refreshCredits() {
    creditLine.textContent = creditText(m);
    extraBox.innerHTML = "";
    extraCredits(m).forEach(line => {
      extraBox.append(el("div", { className: "credit", textContent: line }));
    });
  }
  refreshCredits();

  // author + folder
  const folderSelect = el("select", {
    onchange: e => { m.folder = e.target.value; save(); renderSidebar(); }
  },
    el("option", { value: "", textContent: "Top level" }),
    ...folderOptions().map(([id, label]) => el("option", { value: id, textContent: label }))
  );
  folderSelect.value = m.folder || "";

  main.append(el("div", { className: "byline" },
    el("span", { textContent: "Author:" }),
    el("input", {
      className: "author", value: m.author || "", placeholder: "Main author",
      oninput: e => {
        m.author = e.target.value;
        data.lastAuthor = e.target.value;
        refreshCredits();
        save();
      }
    }),
    el("span", { textContent: "Folder:" }),
    folderSelect
  ));

  // contributor slots
  const contribBox = el("div", { className: "contribs" });
  function renderContribs() {
    contribBox.innerHTML = "";
    contribBox.append(el("div", { className: "hint", textContent: "Contributors (optional)" }));
    m.contributors.forEach((c, i) => {
      contribBox.append(el("div", { className: "contrib" },
        el("input", {
          value: c.name || "", placeholder: "Name",
          oninput: e => { c.name = e.target.value; save(); refreshCredits(); }
        }),
        el("input", {
          value: c.role || "", placeholder: "What they did (optional)",
          oninput: e => { c.role = e.target.value; save(); refreshCredits(); }
        }),
        el("button", {
          textContent: "✕", title: "Remove",
          onclick: () => { m.contributors.splice(i, 1); save(); renderContribs(); refreshCredits(); }
        })
      ));
    });
    contribBox.append(el("button", {
      textContent: "+ Add contributor",
      onclick: () => { m.contributors.push({ name: "", role: "" }); save(); renderContribs(); }
    }));
  }
  renderContribs();
  main.append(contribBox);

  main.append(creditLine);
  main.append(extraBox);
  main.append(exportBar(m));

  main.append(renderBoard(m));

  main.append(el("textarea", {
    id: "mapNotes", value: m.notes, placeholder: "Notes for this strategy...",
    oninput: e => { m.notes = e.target.value; save(); }
  }));

  main.append(renderLoadout(m, towers));

  main.append(el("div", { className: "buildhead" },
    el("h3", { textContent: "Build order" }),
    el("label", { className: "wavetoggle" },
      el("input", {
        type: "checkbox", checked: useWave,
        onchange: e => { m.useWave = e.target.checked; save(); renderMain(); }
      }),
      " Use wave numbers (optional)"
    )
  ));

  const table = el("table");
  const headers = useWave ? ["Wave"] : [];
  headers.push("Action", "Details", "Notes", "");
  table.append(el("tr", {}, ...headers.map(h => el("th", { textContent: h }))));
  renderSteps(table, m.steps, 0, null, m, towers, useWave);
  main.append(table);

  main.append(el("button", {
    textContent: "+ Add step",
    onclick: () => { m.steps.push(newStep()); save(); renderMain(); }
  }));
  main.append(el("button", {
    textContent: "+ Add branch",
    onclick: () => { m.steps.push(newBranch()); save(); renderMain(); }
  }));

  main.append(confirmButton("Delete this strategy", () => {
    data.maps = data.maps.filter(x => x.id !== m.id);
    normalize();
    save(); renderAll();
  }));
}

/* ---------- Build order tree (steps and branches) ---------- */
function isBranch(n) {
  return n && n.type === "branch";
}

// Calls fn(step) for every step, including steps inside branches
function eachStep(list, fn) {
  list.forEach(n => {
    if (isBranch(n)) eachStep(n.children || [], fn);
    else fn(n);
  });
}

// Flat list [{ node, depth }] in order, used by the image and Google Docs copy
function flattenSteps(list, depth = 0, out = []) {
  list.forEach(n => {
    out.push({ node: n, depth });
    if (isBranch(n)) flattenSteps(n.children || [], depth + 1, out);
  });
  return out;
}

function newStep() {
  return { wave: "", action: "", tower: "", time: "", text: "", color: "", notes: "" };
}

function newBranch() {
  return { type: "branch", id: uid(), title: "", wave: "", open: true, children: [] };
}

function cleanWave(v) {
  return String(v || "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function waveInput(n) {
  return el("input", {
    className: "wave", value: n.wave || "", placeholder: "1 or 1-15",
    title: "One wave (7) or a range (1-15)",
    oninput: e => { n.wave = e.target.value; save(); },
    onchange: e => {
      const v = cleanWave(e.target.value);
      e.target.value = v;
      n.wave = v;
      save();
    }
  });
}

function moveNode(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save(); renderMain();
}

// Move out of the branch it's in, to just after that branch
function outdentNode(list, i, parent) {
  if (!parent) return;
  const [n] = list.splice(i, 1);
  parent.list.splice(parent.index + 1, 0, n);
  save(); renderMain();
}

// Move into the branch just above it
function indentNode(list, i) {
  const prev = list[i - 1];
  if (!prev || !isBranch(prev)) return;
  const [n] = list.splice(i, 1);
  prev.children = prev.children || [];
  prev.children.push(n);
  prev.open = true;
  save(); renderMain();
}

// parent = null at the top level, or { list, index } of the branch's place in its list
function renderSteps(table, list, depth, parent, m, towers, useWave) {
  const colCount = useWave ? 5 : 4;

  list.forEach((n, i) => {
    const row = el("tr", { className: isBranch(n) ? "branchrow" : "" });
    const indent = depth * 18;

    const controls = el("div", { className: "ctrls" },
      el("button", { textContent: "↑", title: "Move up", onclick: () => moveNode(list, i, -1) }),
      el("button", { textContent: "↓", title: "Move down", onclick: () => moveNode(list, i, 1) }),
      el("button", {
        textContent: "←", title: "Move out of this branch",
        onclick: () => outdentNode(list, i, parent)
      }),
      el("button", {
        textContent: "→", title: "Move into the branch above",
        onclick: () => indentNode(list, i)
      }),
      isBranch(n)
        ? confirmButton("✕", () => { list.splice(i, 1); save(); renderMain(); })
        : el("button", {
            textContent: "✕", title: "Delete",
            onclick: () => { list.splice(i, 1); save(); renderMain(); }
          })
    );

    // a branch (folder of steps)
    if (isBranch(n)) {
      n.children = n.children || [];
      const head = el("div", {
        className: "branchhead", style: "padding-left:" + indent + "px"
      },
        el("button", {
          className: "btoggle", title: "Open or close",
          textContent: n.open === false ? "▸" : "▾",
          onclick: () => { n.open = (n.open === false); save(); renderMain(); }
        }),
        el("input", {
          className: "btitle", value: n.title || "",
          placeholder: "Branch name (e.g. Early game)",
          oninput: e => { n.title = e.target.value; save(); }
        }),
        ...(useWave ? [waveInput(n)] : []),
        el("button", {
          textContent: "+ step",
          onclick: () => { n.children.push(newStep()); n.open = true; save(); renderMain(); }
        }),
        el("button", {
          textContent: "+ branch",
          onclick: () => { n.children.push(newBranch()); n.open = true; save(); renderMain(); }
        }),
        controls
      );
      row.append(el("td", { colSpan: colCount }, head));
      table.append(row);
      if (n.open !== false) {
        renderSteps(table, n.children, depth + 1, { list, index: i }, m, towers, useWave);
      }
      return;
    }

    // a normal step
    const def = ACTIONS.find(a => a.id === n.action);
    const cells = [];

    if (useWave) cells.push(el("td", {}, waveInput(n)));
    cells.push(el("td", {}, actionSelect(n)));

    const details = el("div", { className: "details" });
    if (def) def.fields.forEach(f => details.append(fieldFor(f, n, m, towers)));
    cells.push(el("td", {}, details));

    cells.push(el("td", {}, el("input", {
      value: n.notes || "",
      oninput: e => { n.notes = e.target.value; save(); }
    })));
    cells.push(el("td", {}, controls));

    cells[0].style.paddingLeft = (4 + indent) + "px";
    if (def && def.fields.includes("color") && n.color) {
      cells[0].style.boxShadow = "inset 5px 0 0 " + n.color;
    }

    row.append(...cells);
    table.append(row);
  });
}

/* ---------- Export as image ---------- */
// Draws one stroke onto a canvas of size w x h (same look as the page)
function drawPaintStroke(ctx, st, w, h) {
  const scale = w / 1000;
  const pts = st.p.map(([x, y]) => [x * w, y * h]);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (st.t === "lasso") {
    if (pts.length >= 2) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.strokeStyle = st.c;
      ctx.lineWidth = 2 * scale;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = st.c;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
    }
  } else {
    ctx.globalCompositeOperation = st.t === "erase" ? "destination-out" : "source-over";
    ctx.globalAlpha = st.t === "erase" ? 1 : 0.6;
    ctx.strokeStyle = st.c;
    ctx.fillStyle = st.c;
    ctx.lineWidth = st.s * scale;
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.arc(pts[0][0], pts[0][1], (st.s * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Loads a picture so it can be drawn into the export (null if it can't be)
function loadImg(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    // web pictures get a unique address so the browser doesn't reuse a copy that blocks drawing
    img.src = /^https?:/.test(url)
      ? url + (url.includes("?") ? "&" : "?") + "export=" + Date.now()
      : url;
  });
}

async function loadFirst(urls) {
  for (const u of urls) {
    const img = await loadImg(u);
    if (img) return img;
  }
  return null;
}

// Text for one build-order row
function stepSummary(s, m) {
  const def = ACTIONS.find(a => a.id === s.action);
  if (!def) return { label: "", details: "" };
  const parts = [];
  def.fields.forEach(f => {
    if (f === "tower" && s.tower) parts.push(s.tower);
    if (f === "path") {
      if (pathCount(m, s.tower) === 1) {
        if (s.single !== undefined && s.single !== "") parts.push("Lv " + s.single);
      } else if ((s.top || "") !== "" || (s.bottom || "") !== "") {
        parts.push((s.top || 0) + "-" + (s.bottom || 0));
      }
    }
    if (f === "max" && s.max) parts.push(s.max === "single" ? "Max" : "Max " + s.max);
    if (f === "time" && s.time) parts.push("@ " + s.time);
    if (f === "text" && s.text) parts.push(s.text);
  });
  return { label: def.label, details: parts.join("  ·  ") };
}

async function exportImage(m, type) {
  const towers = gameOf(m).towers || [];
  const W = 1200, PAD = 40, SCALE = 2;
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const C = {
    bg: "#121212", panel: "#1b1b1f", field: "#24242a", border: "#35353d",
    text: "#e6e6e6", muted: "#9a9aa5"
  };
  const size = gameOf(m).loadoutSize || 5;
  const slots = m.loadout.slice(0, size);

  // 1. load the pictures
  const slotImgs = await Promise.all(slots.map(sl => {
    if (!sl.tower || isSpecial(sl.tower)) return null;
    const t = towers.find(x => x.name === sl.tower);
    const urls = ["images/" + m.game + "/" + slug(sl.tower) + ".png"];
    if (t && t.img) urls.push(t.img);
    return loadFirst(urls);
  }));

  const mp = (gameOf(m).maps || []).find(x => x.name === m.map);
  let mapImg = null;
  if (mp) {
    const urls = ["images/" + m.game + "/maps/" + slug(mp.name) + ".png"];
    if (mp.img) urls.push(mp.img);
    mapImg = await loadFirst(urls);
  }

  // 2. helpers
  function wrap(ctx, text, maxW) {
    const out = [];
    String(text || "").split("\n").forEach(par => {
      const words = par.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); return; }
      let line = "";
      words.forEach(w => {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSlot(ctx, sl, img, x, y, w, h) {
    ctx.fillStyle = C.panel;
    rr(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
    ctx.stroke();

    const bx = x + (w - 100) / 2, by = y + 12;
    ctx.save();
    ctx.textAlign = "center";

    if (!sl.tower) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = C.border;
      rr(ctx, bx, by, 100, 100, 8);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isSpecial(sl.tower)) {
      const colors = { DPS: "#1f4f8f", Bait: "#8f5a1f" };
      if (colors[sl.tower]) {
        ctx.fillStyle = colors[sl.tower];
        rr(ctx, bx, by, 100, 100, 8);
        ctx.fill();
        ctx.fillStyle = C.text;
      } else {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = C.border;
        rr(ctx, bx, by, 100, 100, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.muted;
      }
      ctx.font = "bold 20px " + FONT;
      ctx.fillText(sl.tower.toUpperCase(), bx + 50, by + 40);
    } else if (img) {
      const k = Math.min(100 / img.width, 100 / img.height);
      const iw = img.width * k, ih = img.height * k;
      ctx.drawImage(img, bx + (100 - iw) / 2, by + (100 - ih) / 2, iw, ih);
    } else {
      // no picture: colored badge with initials
      let hue = 0;
      for (const c of sl.tower) hue = (hue * 31 + c.charCodeAt(0)) % 360;
      const words = sl.tower.split(/\s+/).filter(Boolean);
      const text = (words.length > 1
        ? words.map(wd => wd[0]).join("").slice(0, 3)
        : sl.tower.slice(0, 3)).toUpperCase();
      ctx.fillStyle = "hsl(" + hue + ", 45%, 32%)";
      rr(ctx, bx, by, 100, 100, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px " + FONT;
      ctx.fillText(text, bx + 50, by + 34);
    }

    // name and sub-role
    ctx.fillStyle = C.text;
    ctx.font = "bold 14px " + FONT;
    wrap(ctx, sl.tower || "(empty slot)", w - 16).slice(0, 2)
      .forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + 122 + i * 18));

    let sub = "";
    if (sl.sub === "optional") sub = "Optional";
    else if (sl.sub === "bait") sub = "Bait";
    else if (sl.sub === "change") sub = "Can change to " + (sl.swap || "?");
    if (sub) {
      ctx.fillStyle = C.muted;
      ctx.font = "13px " + FONT;
      wrap(ctx, sub, w - 16).slice(0, 2)
        .forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + 160 + i * 16));
    }
    ctx.restore();
  }

  // 3. one layout function, used to measure first and then to draw
  function layout(ctx, draw) {
    let y = PAD;
    const inner = W - PAD * 2;
    ctx.textBaseline = "top";

    function head(text) {
      ctx.font = "bold 22px " + FONT;
      if (draw) {
        ctx.fillStyle = C.text;
        ctx.fillText(text, PAD, y);
        ctx.fillStyle = C.border;
        ctx.fillRect(PAD, y + 32, inner, 1);
      }
      y += 44;
    }

    // title
    ctx.font = "bold 38px " + FONT;
    wrap(ctx, m.name || "Untitled strategy", inner).forEach(line => {
      if (draw) { ctx.fillStyle = C.text; ctx.fillText(line, PAD, y); }
      y += 46;
    });

    // author
    if (m.author) {
      ctx.font = "20px " + FONT;
      if (draw) { ctx.fillStyle = C.muted; ctx.fillText("by " + m.author, PAD, y); }
      y += 30;
    }
    y += 6;

    // description
    if (m.notes && m.notes.trim()) {
      ctx.font = "18px " + FONT;
      wrap(ctx, m.notes, inner).forEach(line => {
        if (draw) { ctx.fillStyle = C.text; ctx.fillText(line, PAD, y); }
        y += 26;
      });
      y += 10;
    }
    y += 14;

    // loadout
    head("Loadout");
    const n = Math.max(slots.length, 1);
    const gap = 12;
    const cw = (inner - gap * (n - 1)) / n;
    const ch = 200;
    slots.forEach((sl, i) => {
      if (draw) drawSlot(ctx, sl, slotImgs[i], PAD + i * (cw + gap), y, cw, ch);
    });
    y += ch + 24;

    // map
    if (mp || m.paint.length) {
      head(mp ? "Map: " + mp.name : "Map");
      const mw = inner;
      const mh = mapImg ? mw * mapImg.height / mapImg.width : mw * 9 / 16;
      if (draw) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(PAD, y, mw, mh);
        if (mapImg) {
          ctx.drawImage(mapImg, PAD, y, mw, mh);
        } else if (mp) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.fillStyle = C.muted;
          ctx.font = "16px " + FONT;
          ctx.fillText("Map picture not available", PAD + mw / 2, y + mh / 2 - 8);
          ctx.restore();
        }
        if (m.paint.length) {
          const off = document.createElement("canvas");
          off.width = Math.round(mw * SCALE);
          off.height = Math.round(mh * SCALE);
          const octx = off.getContext("2d");
          m.paint.forEach(st => drawPaintStroke(octx, st, off.width, off.height));
          ctx.drawImage(off, PAD, y, mw, mh);
        }
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(PAD + 0.5, y + 0.5, mw - 1, mh - 1);
      }
      y += mh + 24;
    }

        // strategy (build order, with branches)
    const useWave = m.useWave !== false;
    const flat = flattenSteps(m.steps);
    if (flat.length) {
      head("Strategy");
      const cols = useWave
        ? { wave: [14, 60], action: [84, 150], details: [244, 468], notes: [724, 386] }
        : { action: [14, 150], details: [174, 520], notes: [704, 406] };
      const labels = useWave
        ? [["Wave", 14], ["Action", 84], ["Details", 244], ["Notes", 724]]
        : [["Action", 14], ["Details", 174], ["Notes", 704]];

      if (draw) {
        ctx.fillStyle = C.field;
        ctx.fillRect(PAD, y, inner, 30);
        ctx.fillStyle = C.muted;
      }
      ctx.font = "bold 14px " + FONT;
      if (draw) labels.forEach(([t, cx]) => ctx.fillText(t, PAD + cx, y + 8));
      y += 30;

      flat.forEach(({ node: s, depth }) => {
        const ind = depth * 16;

        if (isBranch(s)) {
          const title = (s.title || "Branch") + (useWave && s.wave ? "   (wave " + s.wave + ")" : "");
          ctx.font = "bold 17px " + FONT;
          const tl = wrap(ctx, title, inner - ind - 30);
          const rh = tl.length * 24 + 14;
          if (draw) {
            ctx.fillStyle = C.field;
            ctx.fillRect(PAD + ind, y, inner - ind, rh);
            ctx.fillStyle = "#4f9cff";
            ctx.fillRect(PAD + ind, y, 4, rh);
            ctx.fillStyle = C.text;
            tl.forEach((ln, i) => ctx.fillText(ln, PAD + ind + 16, y + 8 + i * 24));
          }
          y += rh;
          return;
        }

        const sum = stepSummary(s, m);
        ctx.font = "16px " + FONT;
        const wl = useWave ? wrap(ctx, s.wave || "", cols.wave[1]) : [];
        const al = wrap(ctx, sum.label, cols.action[1]);
        const dl = wrap(ctx, sum.details, cols.details[1]);
        const nl = wrap(ctx, s.notes || "", cols.notes[1]);
        const lines = Math.max(wl.length, al.length, dl.length, nl.length, 1);
        const rh = lines * 22 + 16;
        if (draw) {
          ctx.fillStyle = C.panel;
          ctx.fillRect(PAD + ind, y, inner - ind, rh);
          ctx.fillStyle = C.border;
          ctx.fillRect(PAD + ind, y + rh - 1, inner - ind, 1);
          const def = ACTIONS.find(a => a.id === s.action);
          if (def && def.fields.includes("color") && s.color) {
            ctx.fillStyle = s.color;
            ctx.fillRect(PAD + ind, y, 6, rh);
          }
          ctx.fillStyle = C.text;
          const groups = [[al, cols.action[0]], [dl, cols.details[0]], [nl, cols.notes[0]]];
          if (useWave) groups.unshift([wl, cols.wave[0]]);
          groups.forEach(([ls, cx]) => {
            ls.forEach((ln, i) => ctx.fillText(ln, PAD + cx, y + 8 + i * 22));
          });
        }
        y += rh;
      });
      y += 10;
    }

    // credits
    y += 16;
    if (draw) { ctx.fillStyle = C.border; ctx.fillRect(PAD, y, inner, 1); }
    y += 14;
    ctx.font = "16px " + FONT;
    if (draw) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = C.muted;
      ctx.fillText(creditText(m), W / 2, y);
      ctx.restore();
    }
    y += 24;
    ctx.font = "14px " + FONT;
    extraCredits(m).forEach(line => {
      wrap(ctx, line, inner).forEach(ln => {
        if (draw) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.fillStyle = C.muted;
          ctx.fillText(ln, W / 2, y);
          ctx.restore();
        }
        y += 20;
      });
    });
    return y + PAD;
  }

  // 4. measure, then draw for real
  const H = layout(document.createElement("canvas").getContext("2d"), false);
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  layout(ctx, true);

  // 5. download
  await new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("The browser couldn't make the file.")); return; }
        const a = el("a", {
          href: URL.createObjectURL(blob),
          download: (slug(m.name || "") || "strategy") + (type === "jpeg" ? ".jpg" : ".png")
        });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        resolve();
      }, type === "jpeg" ? "image/jpeg" : "image/png", 0.92);
    } catch (e) {
      reject(e);
    }
  });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildDocHtml(m) {
  const useWave = m.useWave !== false;
  const size = gameOf(m).loadoutSize || 5;
  const mp = (gameOf(m).maps || []).find(x => x.name === m.map);
  const cell = "border:1px solid #999;padding:4px 8px;";
  const colCount = (useWave ? 1 : 0) + 4;
  let h = "";

  h += "<h1>" + esc(m.name || "Untitled strategy") + "</h1>";
  if (m.author) h += "<p>by " + esc(m.author) + "</p>";
  if (m.notes && m.notes.trim()) h += "<p>" + esc(m.notes).replace(/\n/g, "<br>") + "</p>";

  h += "<h2>Loadout</h2><ul>";
  m.loadout.slice(0, size).forEach(sl => {
    let line = sl.tower || "(empty slot)";
    if (sl.sub === "optional") line += " - optional";
    else if (sl.sub === "bait") line += " - bait";
    else if (sl.sub === "change") line += " - can change to " + (sl.swap || "?");
    h += "<li>" + esc(line) + "</li>";
  });
  h += "</ul>";

  if (mp) h += "<h2>Map</h2><p>" + esc(mp.name) + "</p>";

  const flat = flattenSteps(m.steps);
  if (flat.length) {
    h += "<h2>Strategy</h2>";
    h += '<table style="border-collapse:collapse">';
    h += '<tr><th style="' + cell + 'background-color:#eeeeee"></th>';
    if (useWave) h += '<th style="' + cell + 'background-color:#eeeeee">Wave</th>';
    ["Action", "Details", "Notes"].forEach(t => {
      h += '<th style="' + cell + 'background-color:#eeeeee">' + t + "</th>";
    });
    h += "</tr>";

    flat.forEach(({ node: s, depth }) => {
      if (isBranch(s)) {
        const title = (s.title || "Branch") + (useWave && s.wave ? " (wave " + s.wave + ")" : "");
        h += '<tr><td colspan="' + colCount + '" style="' + cell +
          "background-color:#dde6f5;font-weight:bold;padding-left:" + (8 + depth * 16) + 'px">' +
          esc(title) + "</td></tr>";
        return;
      }
      const sum = stepSummary(s, m);
      const def = ACTIONS.find(a => a.id === s.action);
      const color = def && def.fields.includes("color") && s.color ? s.color : "";
      const pad = "&nbsp;".repeat(depth * 4);
      h += "<tr>";
      h += '<td style="' + cell + (color ? "background-color:" + color + ";" : "") + 'width:14px">&nbsp;</td>';
      if (useWave) h += '<td style="' + cell + '">' + esc(s.wave) + "</td>";
      h += '<td style="' + cell + '">' + pad + esc(sum.label) + "</td>";
      h += '<td style="' + cell + '">' + esc(sum.details) + "</td>";
      h += '<td style="' + cell + '">' + esc(s.notes) + "</td>";
      h += "</tr>";
    });
    h += "</table>";
  }

  h += "<hr><p>" + esc(creditText(m)) + "</p>";
  extraCredits(m).forEach(c => { h += "<p>" + esc(c) + "</p>"; });
  return h;
}

async function copyForDocs(m) {
  const html = buildDocHtml(m);

  // plain-text version for places that don't take formatting
  const tmp = document.createElement("div");
  tmp.style.cssText = "position:fixed;left:-9999px;top:0;";
  tmp.innerHTML = html;
  document.body.append(tmp);
  const plain = tmp.innerText;
  tmp.remove();

  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" })
    })]);
    return;
  } catch (e) {}

  // fallback: select a hidden copy and use the older copy command
  const box = document.createElement("div");
  box.contentEditable = "true";
  box.style.cssText = "position:fixed;left:-9999px;top:0;";
  box.innerHTML = html;
  document.body.append(box);
  const range = document.createRange();
  range.selectNodeContents(box);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand("copy");
  sel.removeAllRanges();
  box.remove();
  if (!ok) throw new Error("The browser blocked copying.");
}

function exportBar(m) {
  const bar = el("div", { className: "exportbar" });
  const status = el("span", { className: "hint" });
  bar.append(el("span", { textContent: "Export:" }));

  function run(label, work, doneText) {
    return el("button", {
      textContent: label,
      onclick: async () => {
        status.textContent = "Working...";
        try {
          await work();
          status.textContent = doneText;
          setTimeout(() => { status.textContent = ""; }, 5000);
        } catch (e) {
          status.textContent = "";
          openModal({
            title: "That didn't work",
            text: String((e && e.message) || e),
            cancel: false
          });
        }
      }
    });
  }

  bar.append(
    run("Save PNG", () => exportImage(m, "png"), "Done."),
    run("Save JPEG", () => exportImage(m, "jpeg"), "Done."),
    run("Copy for Google Docs", () => copyForDocs(m),
      "Copied! Open a Google Doc and press Ctrl+V."),
    status
  );
  return bar;
}

/* ---------- Export / Import ---------- */
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(Object.assign({}, data, { credit: CREDIT }), null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "td-strategies.json" });
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();

document.getElementById("importFile").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let d;
    try {
      d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.maps)) throw new Error("Bad format");
    } catch (err) {
      await openModal({ title: "Import failed", text: "Couldn't import that file.", cancel: false });
      return;
    }
    const yes = await openModal({
      title: "Import strategies",
      text: "This replaces everything currently in the site. Continue?",
      ok: "Replace everything",
      danger: true
    });
    if (!yes) return;
    data = d;
    normalize();
    save(); renderAll();
  };
  reader.readAsText(file);
  e.target.value = "";
};

renderAll();