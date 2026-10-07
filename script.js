const KEY = "td-strategy-v1";
let data = load();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.maps)) return d;
  } catch (e) {}
  return { maps: [], current: null };
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

function currentMap() {
  return data.maps.find(m => m.id === data.current) || null;
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById("mapList");
  list.innerHTML = "";
  data.maps.forEach(m => {
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
  const m = { id: uid(), name, notes: "", steps: [] };
  data.maps.push(m);
  data.current = m.id;
  save(); renderSidebar(); renderMain();
};

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

  const table = el("table");
  table.append(el("tr", {},
    el("th", { textContent: "Wave" }),
    el("th", { textContent: "Action" }),
    el("th", { textContent: "Notes" }),
    el("th", { textContent: "" })
  ));

  m.steps.forEach((s, i) => {
    const row = el("tr");
    row.append(el("td", {}, el("input", {
      className: "wave", value: s.wave,
      oninput: e => { s.wave = e.target.value; save(); }
    })));
    row.append(el("td", {}, el("input", {
      value: s.action, placeholder: "e.g. Build sniper at chokepoint",
      oninput: e => { s.action = e.target.value; save(); }
    })));
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
    onclick: () => { m.steps.push({ wave: "", action: "", notes: "" }); save(); renderMain(); }
  }));
  main.append(el("button", {
    textContent: "Delete this map",
    onclick: () => {
      if (!confirm("Delete this map?")) return;
      data.maps = data.maps.filter(x => x.id !== m.id);
      data.current = data.maps.length ? data.maps[0].id : null;
      save(); renderSidebar(); renderMain();
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
      if (!currentMap()) data.current = data.maps.length ? data.maps[0].id : null;
      save(); renderSidebar(); renderMain();
    } catch (err) {
      alert("Couldn't import that file.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

renderSidebar();
renderMain();