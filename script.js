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

/* ---------- State helpers ---------- */
function normalize() {
  const ids = Object.keys(GAMES);
  if (!GAMES[data.game]) data.game = ids[0];

  const knownActions = ACTIONS.map(a => a.id);
  data.maps.forEach(m => {
    if (!m.game) m.game = ids[0];
    m.steps.forEach(s => {
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

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById("mapList");
  list.innerHTML = "";
  mapsForGame().forEach(m => {
    list.append(el("button", {
      textContent: m.name || "(unnamed)",
      className: m.id === data.current ? "active" : "",
      onclick: () => { data.current = m.id; save(); renderSidebar(); renderMain(); }
    }));
  });
}

document.getElementById("addMap").onclick = () => {
  const name = prompt("Map name?");
  if (!name) return;
  const m = { id: uid(), name, game: data.game, notes: "", steps: [] };
  data.maps.push(m);
  data.current = m.id;
  save(); renderSidebar(); renderMain();
};

/* ---------- Searchable tower dropdown ---------- */
function towerPicker(s, towers) {
  const wrap = el("div", { className: "combo" });
  const input = el("input", { value: s.tower || "", placeholder: "Search tower..." });
  const list = el("div", { className: "combo-list" });
  list.hidden = true;

  function choose(value) {
    s.tower = value;
    input.value = value;
    save();
    list.hidden = true;
  }

  function item(label, value) {
    return el("div", {
      className: "combo-item",
      textContent: label,
      onmousedown: e => { e.preventDefault(); choose(value); }
    });
  }

  function matchesFor(query) {
    const q = query.trim().toLowerCase();
    return towers.filter(t => t.name.toLowerCase().includes(q));
  }

  function renderList(query) {
    list.innerHTML = "";
    const matches = matchesFor(query);
    if (!query.trim()) list.append(item("— none —", ""));
    matches.forEach(t => list.append(item(t.name, t.name)));
    if (!matches.length) {
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
      const first = matchesFor(input.value)[0];
      if (first) choose(first.name);
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

/* ---------- Action fields ---------- */
function choiceSelect(s, key, options) {
  // options: [ [value, label], ... ] and the first one is the "nil" choice
  const select = el("select", {
    onchange: e => { s[key] = e.target.value; save(); }
  }, ...options.map(([value, label]) => el("option", { value, textContent: label })));
  select.value = s[key] || "";
  return select;
}

function fieldFor(name, s, towers) {
  if (name === "tower") {
    return towerPicker(s, towers);
  }
  if (name === "path") {
    return choiceSelect(s, "path", [
      ["", "Path: nil"],
      ["top", "Top path"],
      ["bottom", "Bottom path"],
      ["single", "Single path"]
    ]);
  }
  if (name === "max") {
    return choiceSelect(s, "max", [
      ["", "Max: nil"],
      ["top", "Max top"],
      ["bottom", "Max bottom"],
      ["single", "Max single"]
    ]);
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

/* ---------- Main panel ---------- */
function renderMain() {
  const main = document.getElementById("main");
  main.innerHTML = "";
  const m = currentMap();
  if (!m) {
    main.append(el("p", { textContent: "Add or select a map to start." }));
    return;
  }

  main.append(el("input", {
    id: "mapName", value: m.name,
    oninput: e => { m.name = e.target.value; save(); renderSidebar(); }
  }));

  main.append(el("textarea", {
    id: "mapNotes", value: m.notes, placeholder: "General strategy notes for this map...",
    oninput: e => { m.notes = e.target.value; save(); }
  }));

  main.append(el("h3", { textContent: "Build order" }));

  const towers = (GAMES[m.game] && GAMES[m.game].towers) || [];

  const table = el("table");
  table.append(el("tr", {},
    el("th", { textContent: "Wave" }),
    el("th", { textContent: "Action" }),
    el("th", { textContent: "Details" }),
    el("th", { textContent: "Notes" }),
    el("th", { textContent: "" })
  ));

  m.steps.forEach((s, i) => {
    const row = el("tr");

    row.append(el("td", {}, el("input", {
      className: "wave", value: s.wave,
      oninput: e => { s.wave = e.target.value; save(); }
    })));

    row.append(el("td", {}, actionSelect(s)));

    // Details: only the fields the chosen action needs
    const def = ACTIONS.find(a => a.id === s.action);
    const details = el("div", { className: "details" });
    if (def) def.fields.forEach(f => details.append(fieldFor(f, s, towers)));
    row.append(el("td", {}, details));

    row.append(el("td", {}, el("input", {
      value: s.notes,
      oninput: e => { s.notes = e.target.value; save(); }
    })));

    row.append(el("td", {},
      el("button", { textContent: "↑", onclick: () => moveStep(m, i, -1) }),
      el("button", { textContent: "↓", onclick: () => moveStep(m, i, 1) }),
      el("button", { textContent: "✕", onclick: () => { m.steps.splice(i, 1); save(); renderMain(); } })
    ));

    table.append(row);
  });
  main.append(table);

  main.append(el("button", {
    textContent: "+ Add step",
    onclick: () => {
      m.steps.push({ wave: "", action: "", tower: "", time: "", text: "", notes: "" });
      save(); renderMain();
    }
  }));

  main.append(el("button", {
    textContent: "Delete this map",
    onclick: () => {
      if (!confirm("Delete this map?")) return;
      data.maps = data.maps.filter(x => x.id !== m.id);
      normalize();
      save(); renderAll();
    }
  }));
}

function moveStep(m, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= m.steps.length) return;
  [m.steps[i], m.steps[j]] = [m.steps[j], m.steps[i]];
  save(); renderMain();
}

/* ---------- Export / Import ---------- */
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "td-strategies.json" });
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();

document.getElementById("importFile").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.maps)) throw new Error("Bad format");
      if (!confirm("This replaces everything currently in the site. Continue?")) return;
      data = d;
      normalize();
      save(); renderAll();
    } catch (err) {
      alert("Couldn't import that file.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

renderAll();