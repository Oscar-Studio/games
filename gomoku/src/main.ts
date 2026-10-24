import "./style.css";
import { Board, coordinate, undoForHuman } from "./engine";
const icon = (name: string) =>
  ({ undo: "↶", export: "↓", new: "＋" })[name] ?? "";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="room">
 <header class="masthead"><a class="brand" href="./" aria-label="弈室首页"><span class="seal">弈</span><span class="brand-name">弈室<small>YI SHI · GOMOKU</small></span></a><a class="back-link" href="/">返回游戏大厅 ↗</a></header>
 <section class="intro"><div><div class="eyebrow">方寸之间 · 与己之外</div><h1>落子无声，<span>方寸有境。</span></h1><p>一局五子棋，与自我博弈中成长的棋手相逢。</p></div><div class="rule-mark"><span>十五路</span><i></i><span>无禁手</span><i></i><span>五子成胜</span></div></section>
 <fieldset class="mode-switch" aria-label="对局模式"><legend class="sr-only">对局模式（切换后重新开局）</legend><span class="mode-slider" aria-hidden="true"></span><label><input type="radio" name="mode" value="pvp"><span>玩家对战</span></label><label><input type="radio" name="mode" value="ai" checked><span>对战 AI</span></label><label><input type="radio" name="mode" value="watch"><span>观战 AI</span></label></fieldset>
 <section class="game-layout" aria-label="五子棋对战">
  <div class="board-column"><div class="board-top"><div class="side-badge"><span id="human-stone" class="stone-dot black"></span><span id="human-label">你执黑棋</span></div><span id="turn-tag">黑棋先行</span></div>
   <div class="wood-frame"><div class="wood-inner"><canvas id="board" width="990" height="990" tabindex="0" role="img" aria-label="十五路五子棋棋盘。方向键选择落点，Enter 确认。"></canvas></div></div>
   <div class="board-bottom"><span id="board-note">静候第一手</span><label class="number-toggle"><input id="numbers" type="checkbox">显示手数</label></div>
   <div class="confirm-row" id="confirm-row" hidden><span id="selected-coordinate"></span><button id="confirm" class="primary">确认落子</button></div>
   <div class="board-caption"><span>黑先白后 · 任意方向连续五子及以上获胜</span><span class="keyboard-tip">方向键选点 · Enter 落子</span></div>
  </div>
  <aside class="side-panel"><div class="panel-top"><h2>棋局</h2><span class="chapter">一枰清欢</span></div>
   <section class="status-area"><div class="eyebrow" id="status-caption">棋室准备中</div><h3 id="status" role="status" aria-live="polite">正在迎候棋手…</h3><p id="status-detail">初次入室需要下载棋手模型，稍候即可开局。</p><button id="download" class="primary full" hidden>下载模型</button><div id="loading-track" class="progress-track"><div id="progress"></div></div><div id="loading-meta" class="progress-meta"><span id="progress-label">准备模型</span><span id="progress-number"></span></div></section>
   <div class="settings"><label for="color">下一局执子</label><div class="select-wrap"><select id="color"><option value="black">黑棋 · 我先手</option><option value="white">白棋 · 棋手先行</option></select></div><label for="strength">思考档位</label><div class="select-wrap"><select id="strength"><option value="64">快棋 · 64 次搜索</option><option value="128" selected>标准 · 128 次搜索</option><option value="512">深思 · 512 次搜索</option></select></div><p class="setting-note">同一位棋手，更从容的思考。手机上深思可能需要较长时间。</p></div>
   <button id="new" class="primary full">${icon("new")} <span>重新开局</span></button><div class="secondary-actions"><button id="undo">${icon("undo")} 悔棋</button><button id="export">${icon("export")} 导出棋谱</button></div><button id="cancel" class="text-action" hidden>暂停思考</button><button id="resume" class="text-action" hidden>继续思考</button><button id="retry" class="text-action" hidden>重新加载棋手</button>
   <div id="error" role="alert"></div>
   <section class="record-section"><div class="record-title"><span>落子记录</span><span id="move-count">零手</span></div><div id="history" class="move-list"><span class="record-empty">棋盘尚静，落子即成篇。</span></div></section>
   <div class="model-note"><span class="model-mark">弈</span><div><strong>自弈棋手 <span id="version">—</span></strong><small id="runtime">模型将在你的设备上思考</small></div></div>
  </aside>
 </section>
 <footer><span>弈室 <b>·</b> 不争朝夕，只问此手</span><span>棋谱仅保存在此设备 · 无需登录</span></footer>
</main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("board"),
  ctx = canvas.getContext("2d")!;
const storageKey = "yishi-game-v1",
  margin = 43,
  step = 41;
let board = new Board(),
  human = 1,
  simulations = 128,
  numbers = false,
  mode: "pvp" | "ai" | "watch" = "ai",
  loading = false,
  ready = false,
  busy = false,
  workerBusy = false,
  paused = false;
let gameId = 1,
  requestId = 0,
  selection: number | null = null,
  hover: number | null = null,
  lastMs = 0,
  completed = 0,
  loaded = 0,
  manifest: any = null,
  provider = "";
const isTouchLayout = () =>
  matchMedia("(pointer: coarse)").matches ||
  matchMedia("(max-width: 680px)").matches;
let keyboard = false,
  touchMode = isTouchLayout();
let worker: Worker | undefined;
const isAiTurn = () => mode !== "pvp" && !board.done && (mode === "watch" || board.player !== human);
const canPlay = () => !board.done && (mode === "pvp" || (mode === "ai" && ready && board.player === human));
try {
  const old = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  if (
    old?.version === 1 &&
    [1, -1].includes(old.human) &&
    [64, 128, 512].includes(old.simulations)
  ) {
    board = Board.fromMoves(old.moves);
    human = old.human;
    simulations = old.simulations;
    numbers = !!old.numbers;
    if (["pvp", "ai", "watch"].includes(old.mode)) mode = old.mode;
  }
} catch {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* Storage may be disabled. */
  }
}
$<HTMLSelectElement>("color").value = human === 1 ? "black" : "white";
$<HTMLSelectElement>("strength").value = String(simulations);
$<HTMLInputElement>("numbers").checked = numbers;
function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        mode,
        moves: board.history,
        human,
        simulations,
        numbers,
        model: manifest?.sha256,
      }),
    );
  } catch {
    /* Gameplay still works with storage disabled. */
  }
}
function draw() {
  const ratio = Math.min(devicePixelRatio || 1, 3);
  const width = Math.round(canvas.getBoundingClientRect().width * ratio);
  if (width && canvas.width !== width) {
    canvas.width = width;
    canvas.height = width;
  }
  ctx.setTransform(canvas.width / 660, 0, 0, canvas.height / 660, 0, 0);
  ctx.clearRect(0, 0, 660, 660);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "#70532b99";
  for (let i = 0; i < 15; i++) {
    const p = margin + i * step;
    ctx.beginPath();
    ctx.moveTo(margin, p);
    ctx.lineTo(margin + 14 * step, p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p, margin);
    ctx.lineTo(p, margin + 14 * step);
    ctx.stroke();
    ctx.fillStyle = "#765c38";
    ctx.font = "12px Georgia,serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String.fromCharCode(65 + i), p, 21);
    ctx.fillText(String(15 - i), 21, p);
    ctx.fillText(String.fromCharCode(65 + i), p, 641);
    ctx.fillText(String(15 - i), 641, p);
  }
  ctx.fillStyle = "#75552c";
  for (const [r, c] of [
    [3, 3],
    [3, 11],
    [7, 7],
    [11, 3],
    [11, 11],
  ]) {
    ctx.beginPath();
    ctx.arc(margin + c * step, margin + r * step, 3.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const moveNumbers = new Map(board.history.map((a, i) => [a, i + 1]));
  board.cells.forEach((v, a) => {
    if (!v) return;
    const x = margin + (a % 15) * step,
      y = margin + Math.floor(a / 15) * step;
    ctx.save();
    ctx.shadowColor = "#33220f65";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    const g = ctx.createRadialGradient(x - 6, y - 8, 1, x + 2, y + 3, 22);
    g.addColorStop(0, v === 1 ? "#555650" : "#ffffff");
    g.addColorStop(0.55, v === 1 ? "#242722" : "#f6f4ec");
    g.addColorStop(1, v === 1 ? "#10120f" : "#d7d1c3");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 17.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = v === 1 ? "#10120f" : "#b5ac9a";
    ctx.stroke();
    if (numbers) {
      ctx.fillStyle = v === 1 ? "#f6f1e7" : "#39372e";
      ctx.font = "13px system-ui";
      ctx.fillText(String(moveNumbers.get(a)), x, y + 0.5);
    } else if (board.history.at(-1) === a) {
      ctx.fillStyle = "#ab4939";
      ctx.beginPath();
      ctx.arc(x, y, 3.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const preview = selection ?? hover;
  if (
    preview !== null &&
    !board.cells[preview] &&
    canPlay()
  ) {
    const x = margin + (preview % 15) * step,
      y = margin + Math.floor(preview / 15) * step;
    ctx.fillStyle = board.player === 1 ? "#20251c55" : "#fffdf4a0";
    ctx.beginPath();
    ctx.arc(x, y, 17.6, 0, Math.PI * 2);
    ctx.fill();
    if (selection !== null || keyboard) {
      ctx.strokeStyle = "#a5402f";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 21, y - 21, 42, 42);
    }
  }
  if (board.winner) {
    const last = board.history.at(-1)!;
    for (const [dr, dc] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      let r = Math.floor(last / 15),
        c = last % 15,
        points = [[r, c]];
      for (const sign of [-1, 1]) {
        let y = r + sign * dr,
          x = c + sign * dc;
        while (
          y >= 0 &&
          y < 15 &&
          x >= 0 &&
          x < 15 &&
          board.cells[y * 15 + x] === board.winner
        ) {
          points.push([y, x]);
          y += sign * dr;
          x += sign * dc;
        }
      }
      if (points.length >= 5) {
        points.sort((a, b) => a[0] * 15 + a[1] - b[0] * 15 - b[1]);
        ctx.beginPath();
        ctx.moveTo(margin + points[0][1] * step, margin + points[0][0] * step);
        const end = points.at(-1)!;
        ctx.lineTo(margin + end[1] * step, margin + end[0] * step);
        ctx.strokeStyle = "#a64032";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }
    }
  }
}
function render() {
  const aiTurn = isAiTurn(),
    thinking = ready && aiTurn && !paused,
    playable = mode === "pvp" || ready;
  $("human-label").textContent = mode === "ai" ? `你执${human === 1 ? "黑" : "白"}棋` : mode === "watch" ? "AI 执黑 · AI 执白" : `${board.player === 1 ? "黑" : "白"}棋落子`;
  const modeIndex = ["pvp", "ai", "watch"].indexOf(mode);
  document.querySelector<HTMLElement>(".mode-switch")!.style.setProperty("--mode-index", String(modeIndex));
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(input => input.checked = input.value === mode);
  $("download").hidden = mode === "pvp" || ready || loading;
  $("loading-track").hidden = mode === "pvp" || (!ready && !loading);
  $("loading-meta").hidden = mode === "pvp" || (!ready && !loading);
  $("color").parentElement!.hidden = mode !== "ai";
  document.querySelector<HTMLLabelElement>('label[for="color"]')!.hidden = mode !== "ai";
  $("strength").parentElement!.hidden = mode === "pvp";
  document.querySelector<HTMLLabelElement>('label[for="strength"]')!.hidden = mode === "pvp";
  document.querySelector<HTMLElement>(".setting-note")!.hidden = mode === "pvp";
  document.querySelector<HTMLElement>(".model-note")!.hidden = mode === "pvp";
  $("retry").hidden = mode === "pvp" || !$("error").textContent || loading;
  $("error").hidden = mode === "pvp";
  $("human-stone").className = `stone-dot ${(mode === "ai" ? human : board.player) === 1 ? "black" : "white"}`;
  $("turn-tag").textContent = board.done
    ? "本局已终"
    : board.history.length
      ? `第 ${board.history.length + 1} 手`
      : "黑棋先行";
  $("board-note").textContent = board.history.length
    ? `上一手 ${coordinate(board.history.at(-1)!)}${lastMs ? ` · 思考 ${(lastMs / 1000).toFixed(1)} 秒` : ""}`
    : "静候第一手";
  $("move-count").textContent = `${board.history.length} 手`;
  if (playable) {
    $("status-caption").textContent = board.done
      ? "此局落定"
      : thinking
        ? "棋手思考中"
        : paused && aiTurn
          ? "暂歇片刻"
          : mode === "pvp" ? `轮到${board.player === 1 ? "黑" : "白"}棋` : "轮到你了";
    $("status").textContent = board.done
      ? board.winner
        ? mode !== "ai"
          ? `${board.winner === 1 ? "黑" : "白"}棋获胜。`
          : board.winner === human
          ? "好棋，你赢了。"
          : "棋逢对手，再来一局。"
        : "平分秋色。"
      : thinking
        ? "静观，落子之前。"
        : paused && aiTurn
          ? "思考已暂停"
          : board.history.length
            ? "这一手，请。"
            : "请落第一子。";
    $("status-detail").textContent = board.done
      ? "方寸之间各有所得，下一局再见。"
      : thinking
        ? "正在推演应手，你可以随时暂停或悔棋。"
        : paused && aiTurn
          ? "继续思考，或悔棋回到上一手。"
          : touchMode
            ? "轻点交叉点预览，再确认落子。"
            : mode === "pvp" ? "双方轮流点击交叉点落子。" : "点击交叉点落子，与棋手手谈一局。";
    $("progress-label").textContent = thinking
      ? "推演进度"
      : board.done
        ? "对局结束"
        : "棋手已就绪";
    $("progress-number").textContent = thinking
      ? `${completed} / ${simulations}`
      : "";
  } else {
    $("status-caption").textContent = loading ? "棋室准备中" : "棋手尚未就绪";
    $("status").textContent = loading ? "正在迎候棋手…" : "下载棋手，开启一局。";
    $("status-detail").textContent = loading
      ? "正在下载并初始化棋手，请稍候。"
      : `点击下载模型后${mode === "watch" ? "观看 AI 自我对弈" : "即可与 AI 对弈"}。模型与推理引擎合计约 28 MB，在你的设备上运行。`;
  }
  $("progress").style.width =
    `${!ready ? loaded : thinking ? (completed / simulations) * 100 : 100}%`;
  $<HTMLButtonElement>("new").disabled = false;
  $<HTMLSelectElement>("strength").disabled = busy;
  $<HTMLButtonElement>("undo").disabled =
    !board.history.length || (mode === "ai" && board.history.length <= (human === -1 ? 1 : 0));
  $<HTMLButtonElement>("export").disabled = !board.history.length;
  $("cancel").hidden = !thinking;
  $("resume").hidden = !(ready && aiTurn && paused);
  $("confirm-row").hidden =
    selection === null || !canPlay();
  $("selected-coordinate").textContent =
    selection !== null ? `落子 ${coordinate(selection)}` : "";
  $("history").innerHTML = board.history.length
    ? board.history
        .map(
          (a, i) =>
            `<span class="move-item ${i === board.history.length - 1 ? "latest" : ""}"><i class="tiny-stone ${i % 2 ? "white" : "black"}"></i><small>${i + 1}</small>${coordinate(a)}</span>`,
        )
        .join("")
    : '<span class="record-empty">棋盘尚静，落子即成篇。</span>';
  canvas.style.cursor = canPlay() ? "crosshair" : loading && mode !== "pvp" ? "wait" : "default";
  draw();
}
function invalidate() {
  gameId++;
  requestId++;
  worker?.postMessage({ type: "cancel" });
  busy = false;
  paused = false;
  completed = 0;
  selection = null;
  hover = null;
  lastMs = 0;
}
function maybeThink() {
  if (
    !ready ||
    workerBusy ||
    busy ||
    paused ||
    board.done ||
    !isAiTurn()
  )
    return;
  busy = true;
  workerBusy = true;
  completed = 0;
  requestId++;
  worker?.postMessage({
    type: "search",
    moves: board.history,
    simulations,
    gameId,
    requestId,
  });
  render();
}
function play(a: number) {
  if (!canPlay() || board.cells[a]) return;
  board.play(a);
  selection = null;
  hover = null;
  paused = false;
  completed = 0;
  lastMs = 0;
  persist();
  render();
  maybeThink();
}
function startWorker() {
  if (worker) worker.terminate();
  ready = false;
  loading = true;
  busy = false;
  workerBusy = false;
  loaded = 0;
  $("retry").hidden = true;
  $("error").textContent = "";
  worker = new Worker(new URL("./ai.worker.ts", import.meta.url), {
    type: "module",
  });
  const ownWorker = worker;
  worker.onmessage = (event) => {
    if (worker !== ownWorker) return;
    const d = event.data;
    if (d.type === "loading") {
      $("progress-label").textContent =
        d.stage === "runtime" ? "下载推演引擎" : "下载棋手模型";
      loaded = d.total ? (d.bytes / d.total) * 100 : 0;
      $("progress-number").textContent =
        `${(d.bytes / 1024 / 1024).toFixed(1)} MB`;
      render();
      return;
    }
    if (d.type === "ready") {
      ready = true;
      loading = false;
      provider = d.provider;
      manifest = d.manifest;
      $("version").textContent = manifest.label;
      $("runtime").textContent =
        provider === "webgpu" ? "GPU 加速 · 本地思考" : "CPU 模式 · 本地思考";
      persist();
      render();
      maybeThink();
      return;
    }
    if (d.type === "idle") {
      workerBusy = false;
      maybeThink();
      return;
    }
    if (
      d.gameId !== undefined &&
      (d.gameId !== gameId || d.requestId !== requestId)
    )
      return;
    if (d.type === "progress") {
      completed = d.completed;
      render();
      return;
    }
    if (d.type === "move") {
      busy = false;
      completed = simulations;
      lastMs = d.elapsed;
      if (isAiTurn()) board.play(d.action);
      persist();
      render();
      return;
    }
    if (d.type === "error") {
      loading = false;
      busy = false;
      paused = true;
      $("error").textContent = ready
        ? "棋手暂时无法完成思考。可继续重试或悔棋。"
        : `棋手加载失败：${d.message}`;
      $("retry").hidden = false;
      render();
    }
  };
  worker.onerror = () => {
    if (worker !== ownWorker) return;
    loading = false;
    ready = false;
    busy = false;
    paused = true;
    $("error").textContent = "棋手运行中断，请重新加载后继续。";
    $("retry").hidden = false;
    render();
  };
  $("status-caption").textContent = "棋室准备中";
  $("status").textContent = "正在迎候棋手…";
  $("status-detail").textContent = board.history.length
    ? "正在载入棋手，当前棋谱已保留。"
    : "初次入室需要下载棋手模型，稍候即可开局。";
  $("progress-label").textContent = "准备模型";
  $("progress-number").textContent = "";
  worker?.postMessage({
    type: "init",
    forceWasm: new URLSearchParams(location.search).get("backend") === "wasm",
  });
  render();
}
canvas.addEventListener("pointerdown", (event) => {
  touchMode = event.pointerType === "touch" || isTouchLayout();
  keyboard = false;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * 660) / rect.width,
    y = ((event.clientY - rect.top) * 660) / rect.height;
  const c = Math.round((x - margin) / step),
    r = Math.round((y - margin) / step);
  if (
    r < 0 ||
    r > 14 ||
    c < 0 ||
    c > 14 ||
    Math.abs(x - margin - c * step) > step * 0.46 ||
    Math.abs(y - margin - r * step) > step * 0.46
  )
    return;
  const a = r * 15 + c;
  if (!canPlay() || board.cells[a]) return;
  if (touchMode) {
    selection = a;
    render();
  } else play(a);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const rect = canvas.getBoundingClientRect(),
    c = Math.round(
      (((event.clientX - rect.left) * 660) / rect.width - margin) / step,
    ),
    r = Math.round(
      (((event.clientY - rect.top) * 660) / rect.height - margin) / step,
    );
  hover = r >= 0 && r < 15 && c >= 0 && c < 15 ? r * 15 + c : null;
  draw();
});
canvas.addEventListener("pointerleave", () => {
  hover = null;
  draw();
});
canvas.addEventListener("keydown", (event) => {
  if (!canPlay()) return;
  let a = selection ?? 112;
  const r = Math.floor(a / 15),
    c = a % 15;
  if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    keyboard = true;
    selection =
      event.key === "ArrowUp"
        ? Math.max(0, r - 1) * 15 + c
        : event.key === "ArrowDown"
          ? Math.min(14, r + 1) * 15 + c
          : event.key === "ArrowLeft"
            ? r * 15 + Math.max(0, c - 1)
            : r * 15 + Math.min(14, c + 1);
    render();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!board.cells[a]) play(a);
  }
});
$("confirm").onclick = () => {
  if (selection !== null) play(selection);
};
$("new").onclick = () => {
  invalidate();
  board = new Board();
  human = $<HTMLSelectElement>("color").value === "black" ? 1 : -1;
  $("error").textContent = "";
  persist();
  render();
  maybeThink();
};
$("undo").onclick = () => {
  if (!board.history.length) return;
  invalidate();
  board = mode === "ai" ? undoForHuman(board.history, human) : Board.fromMoves(board.history.slice(0, -1));
  if (mode === "watch") paused = true;
  $("error").textContent = "";
  persist();
  render();
  maybeThink();
};
$("cancel").onclick = () => {
  requestId++;
  worker?.postMessage({ type: "cancel" });
  busy = false;
  paused = true;
  render();
};
$("resume").onclick = () => {
  paused = false;
  $("error").textContent = "";
  render();
  maybeThink();
};
$("retry").onclick = () => {
  invalidate();
  startWorker();
};
$<HTMLSelectElement>("strength").onchange = () => {
  simulations = Number($<HTMLSelectElement>("strength").value);
  persist();
  render();
};
$<HTMLInputElement>("numbers").onchange = () => {
  numbers = $<HTMLInputElement>("numbers").checked;
  persist();
  draw();
};
$("export").onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          rules: "15x15-freestyle-five-or-more",
          moves: board.history,
          winner: board.winner,
          complete: board.done,
          humanColor: human === 1 ? "black" : "white",
          simulations,
          model: manifest?.label,
          modelSha256: manifest?.sha256,
          mode,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `弈室-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
new ResizeObserver(() => {
  touchMode = isTouchLayout();
  render();
}).observe(canvas);
$("download").onclick = () => {
  if (!ready && !loading) startWorker();
};
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(input => {
  input.onchange = () => {
    invalidate();
    mode = input.value as typeof mode;
    board = new Board();
    human = $<HTMLSelectElement>("color").value === "black" ? 1 : -1;
    $("error").textContent = "";
    persist();
    render();
    maybeThink();
  };
});
render();
