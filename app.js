const AVAILABLE_YEARS = [2026, 2025, 2023];

const COLORS = [
  "#E8B4B8", "#F4A6A3", "#E57373", "#EF9A9A",
  "#A5D6A7", "#81C784", "#66BB6A", "#4CAF50",
  "#FFF59D", "#FFEE58", "#FFEB3B", "#FDD835",
  "#FFB74D", "#FFA726", "#FF9800", "#FB8C00",
  "#90CAF9", "#64B5F6", "#42A5F5", "#2196F3",
  "#CE93D8", "#BA68C8", "#AB47BC", "#9C27B0",
  "#80CBC4", "#4DB6AC", "#26A69A", "#009688",
];

const BOT_USERNAMES = new Set(["LosingHimWasBlue", "BenjiBot", "BiancaBot", "FearlessBot", "TaylorBot"]);

// State
let records = [];
let steps = [];
let stepEndIndices = [];
let colorMap = new Map();
let parentMap = new Map();
let adamChildrenOrder = [];
let root = "adam";
let currentStep = 0;
let playing = false;
let speed = 1;
let intervalId = null;
let autoFollow = true;

// DOM
const svg = d3.select("#canvas");
const headerHeight = 56;
const lbWidth = 280;
let width = window.innerWidth - lbWidth;
let height = window.innerHeight - headerHeight;
svg.attr("width", width).attr("height", height).style("margin-top", headerHeight + "px");

const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.02, 4]).on("zoom", e => g.attr("transform", e.transform));
svg.call(zoom);

const linksGroup = g.append("g").attr("class", "links");
const nodesGroup = g.append("g").attr("class", "nodes");
const tooltip = d3.select("#tooltip");

svg.on("mousedown.follow", () => { autoFollow = false; });
svg.on("wheel.follow", () => { autoFollow = false; });

// Year selector
const yearSelector = document.getElementById("year-selector");
const select = document.createElement("select");
AVAILABLE_YEARS.forEach(y => {
  const opt = document.createElement("option");
  opt.value = y;
  opt.textContent = y;
  select.appendChild(opt);
});
yearSelector.appendChild(select);

// Load year from URL or default
const urlParams = new URLSearchParams(window.location.search);
const initialYear = urlParams.get("year") || AVAILABLE_YEARS[0];
select.value = initialYear;

select.addEventListener("change", () => {
  const year = select.value;
  history.replaceState(null, "", `?year=${year}`);
  loadYear(year);
});

async function loadYear(year) {
  pause();
  document.getElementById("loading").classList.add("visible");

  const response = await fetch(`data/loverlounge${year}.csv`);
  const csvText = await response.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  records = parsed.data
    .map(r => ({
      username: r.username,
      acquired_from_username: r.acquired_from_username,
      acquired_at: new Date(r.acquired_at.replace(' ', 'T').replace(/\+00$/, 'Z')),
    }))
    .sort((a, b) => a.acquired_at - b.acquired_at);

  // Auto-detect root (first record where username === acquired_from_username)
  const rootRecord = records.find(r => r.username === r.acquired_from_username);
  root = rootRecord ? rootRecord.username : records[0].username;

  // Build full hierarchy for color assignment
  const fullChildren = new Map();
  records.forEach(r => {
    if (r.username === r.acquired_from_username) return;
    if (!fullChildren.has(r.acquired_from_username)) fullChildren.set(r.acquired_from_username, []);
    fullChildren.get(r.acquired_from_username).push(r.username);
  });
  if (fullChildren.has(root)) {
    fullChildren.get(root).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  adamChildrenOrder = fullChildren.get(root) || [];

  // Parent map
  parentMap = new Map();
  records.forEach(r => {
    if (r.username !== r.acquired_from_username) parentMap.set(r.username, r.acquired_from_username);
  });

  // Color map
  colorMap = new Map();
  colorMap.set(root, "#888888");
  records.forEach(r => {
    if (!colorMap.has(r.username)) colorMap.set(r.username, getChainColor(r.username));
  });

  // Build steps
  steps = [];
  const leaderBatch = [];
  let pastLeaders = false;
  records.forEach(r => {
    if (r.username === r.acquired_from_username) {
      steps.push([r]);
    } else if (r.acquired_from_username === root && !pastLeaders) {
      leaderBatch.push(r);
    } else {
      if (leaderBatch.length > 0) {
        steps.push(leaderBatch.slice());
        leaderBatch.length = 0;
        pastLeaders = true;
      }
      steps.push([r]);
    }
  });
  if (leaderBatch.length > 0) steps.push(leaderBatch.slice());

  stepEndIndices = [];
  let cumulative = 0;
  steps.forEach(batch => {
    cumulative += batch.length;
    stepEndIndices.push(cumulative - 1);
  });

  // Reset UI
  linksGroup.selectAll("*").remove();
  nodesGroup.selectAll("*").remove();
  currentStep = 0;
  autoFollow = true;

  document.getElementById("loading").classList.remove("visible");
  renderFrame(0);
  play();
}

function getChainColor(username) {
  let current = username;
  while (parentMap.has(current) && parentMap.get(current) !== root) current = parentMap.get(current);
  if (current === root) return "#888888";
  const idx = adamChildrenOrder.indexOf(current);
  return idx >= 0 ? COLORS[idx % COLORS.length] : "#888888";
}

function buildTree(recs) {
  const childrenMap = new Map();
  recs.forEach(r => {
    if (r.username === r.acquired_from_username) return;
    if (!childrenMap.has(r.acquired_from_username)) childrenMap.set(r.acquired_from_username, []);
    childrenMap.get(r.acquired_from_username).push(r.username);
  });
  if (childrenMap.has(root)) {
    childrenMap.get(root).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  function buildNode(name) {
    return { name, children: (childrenMap.get(name) || []).map(buildNode) };
  }
  return buildNode(root);
}

function renderFrame(stepIdx) {
  const recIndex = stepEndIndices[stepIdx];
  const visibleRecords = records.slice(0, recIndex + 1);
  const treeData = buildTree(visibleRecords);
  const hierarchy = d3.hierarchy(treeData);

  const treeLayout = d3.tree().nodeSize([140, 50]).separation(() => 1);
  treeLayout(hierarchy);

  const nodes = hierarchy.descendants();
  const links = hierarchy.links();

  const stepRecords = steps[stepIdx];
  const newestNames = new Set(stepRecords.map(r => r.username));
  const newestUsername = stepRecords[stepRecords.length - 1].username;

  // Links
  const linkSel = linksGroup.selectAll("path.link").data(links, d => d.source.data.name + "->" + d.target.data.name);
  linkSel.enter()
    .append("path")
    .attr("class", "link")
    .attr("stroke", d => colorMap.get(d.target.data.name) || "#666")
    .attr("opacity", 0)
    .attr("d", linkPath)
    .transition().duration(500)
    .attr("opacity", 0.6);
  linkSel.transition().duration(500).attr("d", linkPath);
  linkSel.exit().remove();

  // Nodes
  const nodeSel = nodesGroup.selectAll("g.node").data(nodes, d => d.data.name);
  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("opacity", 0);

  nodeEnter.append("rect")
    .attr("rx", 6).attr("ry", 6)
    .attr("x", -58).attr("y", -16)
    .attr("width", 116).attr("height", 32)
    .attr("fill", d => colorMap.get(d.data.name) || "#888")
    .attr("stroke", "none")
    .attr("stroke-width", 2);

  nodeEnter.append("text")
    .attr("class", "node-label")
    .attr("dy", 4)
    .attr("fill", "#1a1a1a")
    .text(d => d.data.name.length > 14 ? d.data.name.slice(0, 13) + "…" : d.data.name);

  nodeEnter.on("mouseover", (event, d) => {
    const rec = records.find(r => r.username === d.data.name);
    tooltip.style("display", "block")
      .html(`<strong>${d.data.name}</strong><br>From: ${rec?.acquired_from_username || '—'}<br>At: ${rec?.acquired_at.toLocaleString() || '—'}`);
  }).on("mousemove", event => {
    tooltip.style("left", (event.clientX + 12) + "px").style("top", (event.clientY - 10) + "px");
  }).on("mouseout", () => tooltip.style("display", "none"));

  nodeEnter.transition().duration(600).ease(d3.easeCubicOut).style("opacity", 1);

  nodeSel.style("opacity", 1);
  nodeSel.transition().duration(300).attr("transform", d => `translate(${d.x},${d.y})`);
  nodeSel.exit().remove();

  // Highlight newest
  nodesGroup.selectAll("g.node rect")
    .attr("stroke", d => newestNames.has(d.data.name) ? "#ffffff" : "none")
    .attr("stroke-width", d => newestNames.has(d.data.name) ? 3 : 0);

  // Auto-follow
  if (autoFollow) {
    const followName = stepRecords.length > 1 ? root : newestUsername;
    const target = nodes.find(n => n.data.name === followName);
    if (target) {
      const scale = 1.5;
      const tx = width / 2 - target.x * scale;
      const ty = height / 2 - target.y * scale;
      svg.transition().duration(700).ease(d3.easeCubicInOut)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    if (stepIdx === steps.length - 1) {
      setTimeout(() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        });
        const padding = 100;
        const treeW = (maxX - minX) + padding * 2;
        const treeH = (maxY - minY) + padding * 2;
        const s = Math.min(width / treeW, height / treeH);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        svg.transition().duration(2000).ease(d3.easeCubicInOut)
          .call(zoom.transform, d3.zoomIdentity.translate(width / 2 - cx * s, height / 2 - cy * s).scale(s));
      }, 1500);
    }
  }

  // UI
  const pct = ((recIndex + 1) / records.length * 100).toFixed(1);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("stats").textContent = `${recIndex + 1} / ${records.length}`;
  document.getElementById("timestamp").textContent = records[recIndex].acquired_at.toLocaleString();

  // Leaderboard
  const activeChainLeader = newestUsername === root ? null : (() => {
    let current = newestUsername;
    while (parentMap.has(current) && parentMap.get(current) !== root) current = parentMap.get(current);
    return current;
  })();
  updateLeaderboard(visibleRecords, activeChainLeader);
}

function updateLeaderboard(recs, activeLeader) {
  const childrenMap = new Map();
  recs.forEach(r => {
    if (r.username === r.acquired_from_username) return;
    if (!childrenMap.has(r.acquired_from_username)) childrenMap.set(r.acquired_from_username, []);
    childrenMap.get(r.acquired_from_username).push(r.username);
  });

  const chainLeaders = (childrenMap.get(root) || []).map(leader => {
    let count = 0;
    const stack = [leader];
    while (stack.length) {
      const node = stack.pop();
      count++;
      (childrenMap.get(node) || []).forEach(c => stack.push(c));
    }
    return { name: leader, count, color: colorMap.get(leader) || "#888" };
  });

  chainLeaders.sort((a, b) => b.count - a.count);

  document.getElementById("lb-entries").innerHTML = chainLeaders.map((entry, i) =>
    `<div class="lb-entry${entry.name === activeLeader ? ' active' : ''}" style="color:${entry.color}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-color" style="background:${entry.color}"></span>
      <span class="lb-name" title="${entry.name}">${entry.name}</span>
      <span class="lb-count">${entry.count}</span>
    </div>`
  ).join("");
}

function linkPath(d) {
  const my = (d.source.y + d.target.y) / 2;
  return `M${d.source.x},${d.source.y + 16} L${d.source.x},${my} L${d.target.x},${my} L${d.target.x},${d.target.y - 16}`;
}

function step() {
  if (currentStep < steps.length - 1) {
    currentStep++;
    renderFrame(currentStep);
  } else {
    pause();
  }
}

function play() {
  playing = true;
  document.getElementById("btn-play").textContent = "⏸ Pause";
  document.getElementById("btn-play").classList.add("active");
  autoFollow = true;
  clearInterval(intervalId);
  intervalId = setInterval(step, Math.max(80, 1600 / speed));
}

function pause() {
  playing = false;
  document.getElementById("btn-play").textContent = "▶ Play";
  document.getElementById("btn-play").classList.remove("active");
  clearInterval(intervalId);
}

// Controls
document.getElementById("btn-play").addEventListener("click", () => playing ? pause() : play());
document.getElementById("btn-reset").addEventListener("click", () => {
  pause();
  currentStep = 0;
  linksGroup.selectAll("*").remove();
  nodesGroup.selectAll("*").remove();
  autoFollow = true;
  renderFrame(0);
});

document.querySelectorAll("#speed-controls button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#speed-controls button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    speed = parseFloat(btn.dataset.speed);
    if (playing) { clearInterval(intervalId); intervalId = setInterval(step, Math.max(80, 1600 / speed)); }
  });
});

document.getElementById("progress-bar").addEventListener("click", e => {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  currentStep = Math.floor(pct * (steps.length - 1));
  linksGroup.selectAll("*").remove();
  nodesGroup.selectAll("*").remove();
  autoFollow = true;
  renderFrame(currentStep);
});

document.addEventListener("keydown", e => {
  if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
  if (e.code === "ArrowRight") { e.preventDefault(); pause(); if (currentStep < steps.length - 1) { currentStep++; renderFrame(currentStep); } }
  if (e.code === "ArrowLeft") { e.preventDefault(); pause(); if (currentStep > 0) { currentStep--; linksGroup.selectAll("*").remove(); nodesGroup.selectAll("*").remove(); renderFrame(currentStep); } }
  if (e.code === "KeyF") { autoFollow = true; renderFrame(currentStep); }
});

window.addEventListener("resize", () => {
  width = window.innerWidth - lbWidth;
  height = window.innerHeight - headerHeight;
  svg.attr("width", width).attr("height", height);
});

// Start
loadYear(initialYear);
