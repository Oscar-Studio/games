import {
  create,
  apply,
  view,
  replay,
  choose,
  options,
  reason,
  edges,
  cells,
  camps,
  bases,
  ranks,
  coord,
} from "./engine.js";
const $ = (id) => document.getElementById(id);
const modeName = { dark: "布阵暗棋", flip: "翻棋" };
const colors = ["红方", "蓝方"];
const phrases = ["你好，请多指教", "好棋！", "稍等一下", "谢谢，承让了"];
const api =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/api/junqi"
    : "https://api.oscarstudio.cn/api/junqi";
let mode = "dark",
  kind = "lobby",
  game = create(),
  v = view(game, 0),
  room = null,
  key = "",
  connection = 0,
  selected = null,
  route = [],
  hint = "",
  muted = false;
let busy = false,
  thinking = false,
  review = null,
  reveal = false,
  reviewBoard = null,
  reviewRequest = 0,
  unreachable = false,
  lastBoard = "",
  tutorial = true;
const btn = (action, label, cls = "", disabled = false) =>
  '<button data-do="' +
  action +
  '" class="' +
  cls +
  '" ' +
  (disabled ? "disabled" : "") +
  ">" +
  label +
  "</button>";
const read = (k) => {
  try {
    return localStorage.getItem("junqi:" + k);
  } catch {
    return null;
  }
};
function save(k, x) {
  try {
    localStorage.setItem("junqi:" + k, x);
  } catch {}
}
const labelSeat = (n) =>
  room?.players[n]?.name ||
  (n === v.seat ? "你" : kind === "room" ? "等待入座" : "电脑");
const pause = () =>
  kind === "room" && (unreachable || room.players.some((p) => p?.offline));
const xy = (i, rotate) => {
  const n = rotate ? 59 - i : i;
  return [
    10 + (n % 5) * 20,
    4 + Math.floor(n / 5) * 8.1 + (n >= 30 ? 1.5 : 0),
  ];
};
const svgLine = (x, y, u, w, attrs) =>
  '<line x1="' +
  x +
  '" y1="' +
  y +
  '" x2="' +
  u +
  '" y2="' +
  w +
  '" ' +
  attrs +
  "/>";
function paintBoard() {
  const board = reviewBoard || v.board,
    rotate = v.colors[v.seat] === 1;
  const moves =
    selected !== null && v.phase === "play" ? options(v, selected) : new Map();
  const last = v.logs[(review ?? v.logs.length) - 1];
  const signature = JSON.stringify([
    board,
    rotate,
    selected,
    route,
    last,
    v.phase,
  ]);
  if (signature === lastBoard) return;
  lastBoard = signature;
  const focus = document.activeElement?.dataset.cell;
  let lines = "";
  for (const { a, b, rail } of edges) {
    const [x, y] = xy(a, rotate),
      [u, w] = xy(b, rotate);
    lines += svgLine(
      x,
      y,
      u,
      w,
      'stroke="' +
        (rail ? "#76694d" : "#ac9b77") +
        '" stroke-width="' +
        (rail ? 0.87 : 0.28) +
        '"',
    );
    if (rail)
      lines += svgLine(
        x,
        y,
        u,
        w,
        'stroke="#eadabd" stroke-width=".38" stroke-dasharray="1.3 .48"',
      );
  }
  if (route.length)
    lines +=
      '<polyline points="' +
      route.map((i) => xy(i, rotate).join(",")).join(" ") +
      '" fill="none" stroke="#438579" stroke-width="1.1"/>';
  // Keep the edge labels visible beside pieces, matching the move list.
  for (let n = 0; n < 12; n++) {
    const i = n * 5,
      [, y] = xy(i, rotate);
    lines +=
      '<text x="1.4" y="' +
      (y + 0.5) +
      '" font-size="1.75" fill="#7c694c">' +
      (12 - n) +
      "</text>";
  }
  for (let n = 0; n < 5; n++) {
    const [x] = xy(n, rotate);
    lines +=
      '<text x="' +
      x +
      '" y="99.1" text-anchor="middle" font-size="1.65" fill="#7c694c">' +
      "ABCDE"[n] +
      "</text>";
  }
  let html =
    '<svg aria-hidden="true" class="tracks" viewBox="0 0 100 100" preserveAspectRatio="none">' +
    lines +
    "</svg>";
  for (const i of cells) {
    const [x, y] = xy(i, rotate),
      p = board[i],
      name = p
        ? p.k === null
          ? "暗子"
          : ranks[p.k]
        : camps.has(i)
          ? "行营"
          : bases.has(i)
            ? "大本营"
            : "兵站";
    const content = p
      ? '<span class="piece ' +
        (p.s === 1 ? "blue" : p.s === null ? "neutral" : "red") +
        (p.k === null ? " back" : "") +
        '">' +
        (p.k === null ? "✥" : name) +
        "</span>"
      : '<span class="site ' +
        (camps.has(i) ? "camp" : bases.has(i) ? "base" : "") +
        '">' +
        (name === "兵站" ? "·" : name) +
        "</span>";
    const style = "left:" + x + "%;top:" + y + "%";
    html +=
      '<button class="cell ' +
      (i === selected ? "selected " : "") +
      (moves.has(i) ? (p ? "legal attack " : "legal ") : "") +
      (last && (i === last.from || i === last.to) ? "last " : "") +
      (i === last?.to ? "recent" : "") +
      '" style="' +
      style +
      '" data-cell="' +
      i +
      '" tabindex="' +
      (i === Number(focus ?? (rotate ? 0 : 55)) ? 0 : -1) +
      '" aria-label="' +
      coord(i) +
      " " +
      (colors[p?.s] || "") +
      name +
      '">' +
      content +
      "</button>";
  }
  $("board").innerHTML = html;
  if (focus !== undefined)
    $("board")
      .querySelector('[data-cell="' + focus + '"]')
      ?.focus({ preventScroll: true });
}
function status(seat) {
  if (kind === "lobby") return seat === 0 ? "己方视角" : "对方视角";
  if (kind === "room" && !room.players[seat]) return "等待好友";
  if (room?.players[seat]?.offline) return "已离线";
  if (v.phase === "end") return "已结算";
  if (v.phase === "setup") return v.ready[seat] ? "已准备" : "准备中";
  return seat === v.turn ? "● 行棋中" : "等待回合";
}
function instruction() {
  if (hint) return hint;
  if (kind === "lobby") return "选择玩法后挑战电脑，或开一张棋桌邀请好友。";
  if (pause())
    return unreachable
      ? "连接中断，正在恢复棋桌。"
      : "对手暂时离线，棋局已暂停。";
  if (v.phase === "end") return "可以逐步回看棋谱，或交换先手再来一局。";
  if (v.phase === "setup")
    return v.ready[v.seat]
      ? "已准备，等待对手。"
      : v.mode === "dark"
        ? "点选两枚己子交换位置，或直接使用当前阵型。"
        : "双方准备后，由先手翻第一枚棋子确定阵营。";
  if (v.turn !== v.seat)
    return kind === "cpu" ? "电脑正在思考…" : "等待对方行动。";
  return v.colors[v.seat] === null
    ? "点一枚暗子翻开。它的颜色就是你的阵营。"
    : selected !== null
      ? "点标记的位置落子，点当前棋子可取消。"
      : v.mode === "flip"
        ? "翻一枚暗子，或选择己方明子行棋。"
        : "轮到你了，点选己方棋子查看路线。";
}
function logText(l) {
  return (
    (l.from === undefined ? coord(l.to) : coord(l.from) + " → " + coord(l.to)) +
    "　" +
    l.note
  );
}
function controls() {
  if (kind === "lobby")
    return (
      '<h2>开始对局</h2><div class="modes">' +
      Object.entries(modeName)
        .map(([k, n]) =>
          btn(
            k,
            n +
              "<small>" +
              (k === "dark" ? "秘密布阵，试探敌旗" : "逐枚揭晓，清雷夺旗") +
              "</small>",
            k === mode ? "active" : "",
          ),
        )
        .join("") +
      '</div><div class="launch">' +
      btn("cpu", "挑战电脑", "major") +
      btn("new", "创建好友房") +
      "</div>" +
      btn("join", "输入房间码加入 →", "link")
    );
  let h =
    "<h2>" +
    modeName[v.mode] +
    ' <span class="muted">／ ' +
    (kind === "cpu" ? "人机对弈" : "好友对弈") +
    "</span></h2>";
  if (room)
    h +=
      '<div class="row"><span class="roomcode">' +
      room.code +
      "</span>" +
      btn("copy", "复制邀请链接") +
      "</div>";
  if (tutorial && v.phase !== "end")
    h +=
      '<div class="row"><small>' +
      (mode === "dark"
        ? "暗棋中，你只能看清己方身份。"
        : "翻出的棋子双方可见，清雷后才能夺旗。") +
      "</small>" +
      btn("skip", "知道了", "link") +
      "</div>";
  if (v.phase === "setup") {
    h +=
      '<div class="row">' +
      (v.mode === "dark"
        ? btn("shuffle", "重新排阵", "", v.ready[v.seat])
        : "") +
      btn(
        "ready",
        v.ready[v.seat] ? "已准备" : "准备就绪",
        "major",
        v.ready[v.seat] || (room && !room.players[1]) || pause(),
      ) +
      "</div>";
  } else if (v.phase === "play") {
    if (v.mode === "flip")
      h +=
        '<p class="flagline">剩余地雷　红方 ' +
        v.mines[0] +
        "　／　蓝方 " +
        v.mines[1] +
        "</p>";
    if (v.offer !== null)
      h +=
        '<div class="request">' +
        (v.offer === v.seat
          ? "已向对方求和"
          : '对方请求和棋 <div class="row">' +
            btn("accept", "同意和棋") +
            btn("decline", "继续下棋") +
            "</div>") +
        "</div>";
    h +=
      '<div class="row">' +
      btn("offer", "求和", "", v.offer !== null || pause()) +
      btn("resign", "认输") +
      "</div>";
  } else {
    h +=
      "<h2>" +
      (v.result.winner === null
        ? "和棋"
        : v.result.winner === v.seat
          ? "你赢了"
          : "对手获胜") +
      "</h2><p>" +
      v.result.why +
      "</p>";
    if (v.logs.length || (v.phase === "end" && v.ready.every(Boolean))) {
      h +=
        '<div class="row">' +
        btn("prev", "上一步", "", (review ?? v.logs.length) === 0) +
        "<span>" +
        (review ?? v.logs.length) +
        " / " +
        v.logs.length +
        "</span>" +
        btn("next", "下一步", "", (review ?? v.logs.length) >= v.logs.length) +
        btn("reveal", reveal ? "返回席位视角" : "揭示全盘") +
        "</div>";
    }
    h +=
      '<div class="row">' +
      btn(
        "again",
        room?.again[v.seat] ? "等待对方再战" : "再来一局",
        "major",
        room?.again[v.seat],
      ) +
      (room?.again[1 - v.seat] ? "对方已邀你再战" : "") +
      "</div>";
  }
  if (room) {
    const opponent = room.players[1 - v.seat];
    if (opponent?.offline && v.phase !== "end")
      h +=
        '<div class="row">' +
        btn(
          "claim",
          Date.now() >= opponent.claimAt ? "领取胜局" : "等待对方重连",
          "",
          Date.now() < opponent.claimAt,
        ) +
        "</div>";
    h +=
      '<div class="row">' +
      btn("phrases", "快捷交流") +
      btn("mute", muted ? "取消静音" : "静音") +
      "</div>";
    if (!muted && room.chat && Date.now() - room.chat.time < 5000)
      h +=
        '<p class="bubble">' +
        (room.chat.seat === v.seat ? "你" : "对方") +
        " · " +
        room.chat.text +
        "</p>";
  }
  return h + btn("leave", "返回选局", "link");
}
function render() {
  paintBoard();
  for (const [prefix, n] of [
    ["lower", v.seat],
    ["upper", 1 - v.seat],
  ]) {
    const color = v.colors[n];
    $(prefix).textContent =
      (kind === "lobby" ? (n === 0 ? "己方" : "对方") : labelSeat(n)) +
      (color !== null ? " · " + colors[color] : "");
    $(prefix + "State").textContent = status(n);
    $(prefix + "Seal").className = "seal " + (color === 0 ? "red" : "");
  }
  $("controls").innerHTML = controls();
  $("notice").textContent = instruction();
  $("count").textContent = v.logs.length + " 手";
  $("logs").innerHTML = v.logs
    .map((l) => "<li>" + logText(l) + "</li>")
    .join("");
  if (v.logs.length && !hint && v.phase === "play")
    $("notice").textContent = logText(v.logs.at(-1)) + "。" + instruction();
}
function modal(title, body) {
  $("dialogContent").innerHTML = "<h2>" + title + "</h2>" + body;
  if (!$("modal").open) $("modal").showModal();
}
$("close").onclick = () => $("modal").close();
$("rules").onclick = () =>
  modal(
    modeName[mode] + " · 玩法说明",
    "<p>" +
      (mode === "dark"
        ? "每方 25 枚棋。军旗放大本营，地雷在后两排，炸弹避开首排。进入大本营后不能移动。敌子身份保密，司令阵亡后亮旗。攻下敌旗获胜。"
        : "首翻定阵营。每手翻一子或走明子；暗子占位，大本营可通行。清除对方三枚雷后，任一可动己子都可夺取已亮的敌旗。") +
      "</p><p>公路走一段，铁路畅通可直行，工兵可转弯。行营内免攻。军衔从高到低为司令、军长、师长、旅长、团长、营长、连长、排长、工兵。</p><p>同级同归于尽，炸弹交战双方移除。工兵排雷存活，其余普通棋子碰雷阵亡。无路可走判负，满 600 手和棋。</p>",
  );
function clearSelection() {
  selected = null;
  route = [];
}
function setRoom(data) {
  if (room && room.code === data.code && room.version > data.version) return;
  if (!room || room.round !== data.round) {
    reviewRequest++;
    review = null;
    reviewBoard = null;
    reveal = false;
    clearSelection();
  }
  if (room && room.game.revision !== data.game.revision) {
    clearSelection();
    hint = "";
  }
  room = data;
  v = data.game;
  mode = v.mode;
  kind = "room";
  unreachable = false;
  render();
}
async function request(path, body, token = key, signal) {
  const r = await fetch(api + path, {
    method: body ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    signal,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(Error(data.error || "连接失败，请重试"), {
      status: r.status,
    });
  return data;
}
async function poll(id) {
  while (id === connection && room) {
    try {
      const data = await request(
        "/rooms/" + room.code + "?after=" + room.version,
        null,
        key,
        AbortSignal.timeout(24000),
      );
      if (id === connection) setRoom(data);
    } catch (e) {
      if (id !== connection) return;
      if ([403, 404].includes(e.status)) {
        lobby();
        hint = e.message;
        render();
        return;
      }
      unreachable = true;
      render();
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
  }
}
function makeKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
async function enter(code) {
  if (busy) return;
  busy = true;
  try {
    const pending = "pending:" + mode;
    key =
      (code ? read("seat:" + code) : sessionStorage.getItem(pending)) ||
      makeKey();
    if (code) save("seat:" + code, key);
    else sessionStorage.setItem(pending, key);
    const data = await request(
      code ? "/rooms/" + code + "/join" : "/rooms",
      code ? {} : { mode },
    );
    if (!code) sessionStorage.removeItem(pending);
    save("seat:" + data.code, key);
    history.replaceState(null, "", "?room=" + data.code);
    hint = "";
    tutorial = !read("guide:" + data.game.mode);
    setRoom(data);
    poll(++connection);
  } catch (e) {
    hint = e.message;
    render();
  } finally {
    busy = false;
  }
}
function lobby() {
  connection++;
  kind = "lobby";
  room = null;
  thinking = false;
  reviewRequest++;
  review = null;
  reviewBoard = null;
  reveal = false;
  game = create(mode);
  v = view(game, 0);
  clearSelection();
  hint = "";
  history.replaceState(null, "", location.pathname);
  render();
}
function startCpu(first = 0) {
  kind = "cpu";
  mode = v.mode;
  game = create(mode, first);
  apply(game, 1, { type: "ready" });
  v = view(game, 0);
  clearSelection();
  hint = "";
  reviewBoard = null;
  review = null;
  reveal = false;
  tutorial = !read("guide:" + mode);
  render();
}
function computer() {
  if (thinking || kind !== "cpu" || game.turn !== 1 || game.phase !== "play")
    return;
  const current = game;
  thinking = true;
  setTimeout(() => {
    if (kind !== "cpu" || current !== game) return;
    thinking = false;
    if (game.phase === "play" && game.turn === 1) {
      apply(game, 1, choose(view(game, 1)));
      v = view(game, 0);
      hint = "";
      render();
    }
  }, 440);
}
async function act(action) {
  if (busy) return;
  busy = true;
  const id = connection;
  try {
    if (kind === "room") {
      const path = "/rooms/" + room.code + "/actions",
        body = {
          ...action,
          round: room.round,
          revision: v.revision,
          id: crypto.randomUUID(),
        };
      let data;
      try {
        data = await request(path, body);
      } catch (e) {
        if (e.status) throw e;
        data = await request(path, body);
      }
      if (id !== connection) return;
      setRoom(data);
    } else {
      apply(game, 0, action);
      if (action.type === "offer") apply(game, 1, { type: "accept" });
      v = view(game, 0);
      computer();
    }
    hint = "";
    clearSelection();
  } catch (e) {
    hint = e.message;
  } finally {
    busy = false;
    render();
  }
}
function tap(i) {
  if (kind === "lobby") {
    hint = "先选择「挑战电脑」或「创建好友房」开始。";
    render();
    return;
  }
  if (busy || pause() || v.phase === "end") return;
  if (v.phase === "setup") {
    if (v.ready[v.seat] || mode === "flip") return;
    if (v.board[i]?.s !== v.colors[v.seat]) {
      hint = "布阵时只能交换两枚己子。";
      render();
      return;
    }
    if (selected === null) {
      selected = i;
      hint = "再点另一枚己子交换位置。";
    } else if (selected === i) {
      clearSelection();
      hint = "";
    } else return act({ type: "swap", from: selected, to: i });
  } else {
    if (v.turn !== v.seat) {
      hint = "请等待对手行动。";
      render();
      return;
    }
    const p = v.board[i];
    if (selected === i) {
      clearSelection();
      hint = "";
    } else if (selected !== null && options(v, selected).has(i)) {
      const path = options(v, selected).get(i);
      if (v.board[selected].k === 3 && path.length > 2 && route.at(-1) !== i) {
        route = path;
        hint = "已标出工兵铁路路线，再点终点确认行棋。";
      } else return act({ type: "move", from: selected, to: i });
    } else if (selected !== null && p?.s !== v.colors[v.seat])
      hint = reason(v, selected, i);
    else if (mode === "flip" && p?.s === null)
      return act({ type: "flip", to: i });
    else if (p && p.s === v.colors[v.seat] && p.k !== null) {
      selected = i;
      route = [];
      hint = options(v, i).size
        ? ""
        : p.k < 2
          ? ranks[p.k] + "不能移动。"
          : "这枚棋子当前没有可走位置。";
    } else hint = "请先选一枚己方棋子。";
  }
  render();
}
$("board").onclick = (e) => {
  const b = e.target.closest("[data-cell]");
  if (b) tap(Number(b.dataset.cell));
};
$("board").onfocusin = (e) => {
  const cell = e.target.closest("[data-cell]");
  if (!cell) return;
  const previous = $("board").querySelector('[tabindex="0"]');
  if (previous) previous.tabIndex = -1;
  cell.tabIndex = 0;
};
$("board").onkeydown = (e) => {
  const direction = { ArrowUp: -5, ArrowDown: 5, ArrowLeft: -1, ArrowRight: 1 }[
    e.key
  ];
  if (!direction) return;
  e.preventDefault();
  const from = Number(e.target.closest("[data-cell]")?.dataset.cell),
    i = from + direction * (v.colors[v.seat] === 1 ? -1 : 1);
  if (
    i >= 0 &&
    i < 60 &&
    (Math.abs(direction) === 5 || Math.floor(i / 5) === Math.floor(from / 5))
  )
    $("board")
      .querySelector('[data-cell="' + i + '"]')
      .focus();
};
async function reviewAt(step, show) {
  const req = ++reviewRequest;
  try {
    const board = room
      ? (
          await request(
            "/rooms/" +
              room.code +
              "/replay?step=" +
              step +
              "&reveal=" +
              Number(show),
          )
        ).board
      : replay(game, 0, step, show);
    if (req === reviewRequest && v.phase === "end") {
      reviewBoard = board;
      review = step;
      reveal = show;
      hint = step ? logText(v.logs[step - 1]) : "开局阵型";
      render();
    }
  } catch (e) {
    hint = e.message;
    render();
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-do]");
  if (!b || b.disabled) return;
  const a = b.dataset.do;
  if (["dark", "flip"].includes(a)) {
    mode = a;
    lobby();
    return;
  }
  if (a === "cpu") {
    startCpu();
    return;
  }
  if (a === "new") {
    await enter();
    return;
  }
  if (a === "join") {
    modal(
      "加入好友房",
      '<label>六位房间码<input id="code" inputmode="numeric" maxlength="6" autocomplete="off"></label>' +
        btn("joinNow", "入座", "major"),
    );
    $("code").focus();
    return;
  }
  if (a === "joinNow") {
    const code = $("code").value.trim();
    if (!/^\d{6}$/.test(code)) {
      $("code").setCustomValidity("请输入六位数字");
      $("code").reportValidity();
      $("code").setCustomValidity("");
      return;
    }
    $("modal").close();
    await enter(code);
    return;
  }
  if (a === "skip") {
    tutorial = false;
    save("guide:" + mode, "1");
    render();
    return;
  }
  if (a === "leave") {
    if (v.phase === "end") {
      lobby();
      return;
    }
    modal(
      "离开棋桌？",
      "<p>" +
        (room
          ? "保留邀请链接，在本浏览器打开即可重连。"
          : "当前人机对局会结束。") +
        "</p>" +
        btn("leaveNow", "离开棋桌"),
    );
    return;
  }
  if (a === "leaveNow") {
    $("modal").close();
    lobby();
    return;
  }
  if (a === "copy") {
    try {
      await navigator.clipboard.writeText(location.href);
      hint = "邀请链接已复制。";
    } catch {
      hint = "请复制地址栏链接，或分享房间码 " + room.code;
    }
    render();
    return;
  }
  if (a === "mute") {
    muted = !muted;
    save("mute", muted ? "1" : "0");
    render();
    return;
  }
  if (a === "phrases") {
    modal(
      "快捷交流",
      '<div class="row">' +
        phrases.map((s, i) => btn("say" + i, s)).join("") +
        "</div>",
    );
    return;
  }
  if (a.startsWith("say")) {
    $("modal").close();
    await act({ type: "chat", text: phrases[Number(a.slice(3))] });
    return;
  }
  if (a === "resign") {
    modal(
      "确认认输？",
      "<p>本局将立即结算，对手获胜。</p>" + btn("confirmResign", "确认认输"),
    );
    return;
  }
  if (a === "confirmResign") {
    $("modal").close();
    await act({ type: "resign" });
    return;
  }
  if (a === "again" && kind === "cpu") {
    startCpu(1 - game.first);
    return;
  }
  if (["prev", "next", "reveal"].includes(a)) {
    await reviewAt(
      (review ?? v.logs.length) + (a === "prev" ? -1 : a === "next" ? 1 : 0),
      a === "reveal" ? !reveal : reveal,
    );
    return;
  }
  await act({ type: a });
});
setInterval(() => {
  if (room && (room.chat || room.players.some((p) => p?.offline))) {
    const bubble = $("controls").querySelector(".bubble");
    if (bubble && Date.now() - room.chat.time >= 5000) bubble.remove();
    const claim = $("controls").querySelector('[data-do="claim"]');
    if (claim?.disabled && Date.now() >= room.players[1 - v.seat]?.claimAt)
      render();
  }
}, 1000);
muted = read("mute") === "1";
render();
const invite = new URLSearchParams(location.search).get("room");
if (invite && /^\d{6}$/.test(invite)) enter(invite);
