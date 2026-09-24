import { GameEngine, Status, getCard, playerName, theaterName } from "./game.js?v=3";
import { cleanRoom, randomRoomCode } from "./room-code.js";

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let mode = "menu";
let engine = null;
let viewer = 0;
let selectedCard = "";
let roomCode = "";
let connectionText = "";
let peer = null;
let connection = null;
let toastTimer = 0;
let hostAttempts = 0;
let rulesOpen = false;
let rulesHtml = "";
let rulesLoading = false;
let pendingPlacement = null;
let desktopDragCardId = "";
let touchDrag = null;
let suppressClickUntil = 0;

const roomFromUrl = new URLSearchParams(location.search).get("room") || "";

app.addEventListener("click", event => {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault();
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "host") startHost();
  else if (action === "join") joinRoom(document.querySelector("#room-input")?.value || "");
  else if (action === "rules") openRules();
  else if (action === "close-rules") { rulesOpen = false; render(); }
  else if (action === "menu") leaveGame();
  else if (action === "select") { selectedCard = button.dataset.card; render(); }
  else if (action === "play") sendAction({ type: "play", cardId: selectedCard, theater: button.dataset.theater, faceUp: button.dataset.face === "up" });
  else if (action === "place-dropped") finishPlacement(button.dataset.face === "up");
  else if (action === "cancel-drop") { pendingPlacement = null; render(); }
  else if (action === "withdraw") sendAction({ type: "withdraw" });
  else if (action === "choose") sendAction({ type: "choose", key: button.dataset.key });
  else if (action === "next") sendAction({ type: "next" });
  else if (action === "new") sendAction({ type: "new" });
  else if (action === "copy") copyInvite();
});

app.addEventListener("keydown", event => {
  if (event.key === "Escape" && pendingPlacement) {
    pendingPlacement = null;
    render();
    return;
  }
  if (event.key === "Escape" && rulesOpen) {
    rulesOpen = false;
    render();
    return;
  }
  if (event.key === "Enter" && event.target.id === "room-input") {
    joinRoom(event.target.value);
  }
});

app.addEventListener("dragstart", event => {
  const card = event.target.closest?.(".hand-card");
  if (!card || !canStartPlacement(card.dataset.card)) {
    event.preventDefault();
    return;
  }
  desktopDragCardId = card.dataset.card;
  card.classList.add("dragging");
  document.body.classList.add("drag-active");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", desktopDragCardId);
});

app.addEventListener("dragover", event => {
  const theater = event.target.closest?.(".theater[data-theater]");
  if (!desktopDragCardId || !theater) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setDropTarget(theater);
});

app.addEventListener("drop", event => {
  const theater = event.target.closest?.(".theater[data-theater]");
  if (!desktopDragCardId || !theater) return;
  event.preventDefault();
  const cardId = desktopDragCardId;
  const targetTheater = theater.dataset.theater;
  cleanupDesktopDrag();
  requestPlacement(cardId, targetTheater);
});

app.addEventListener("dragend", cleanupDesktopDrag);

app.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" || event.button !== 0) return;
  const card = event.target.closest?.(".hand-card");
  if (!card || !canStartPlacement(card.dataset.card)) return;
  touchDrag = {
    pointerId: event.pointerId,
    cardId: card.dataset.card,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    source: card,
    ghost: null,
    target: null
  };
  card.setPointerCapture?.(event.pointerId);
});

app.addEventListener("pointermove", event => {
  if (!touchDrag || touchDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - touchDrag.startX;
  const dy = event.clientY - touchDrag.startY;
  if (!touchDrag.dragging) {
    if (dy >= -12 || Math.abs(dy) < Math.abs(dx) * .7) return;
    startTouchDrag();
  }
  event.preventDefault();
  moveTouchGhost(event.clientX, event.clientY);
  const theater = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".theater[data-theater]") || null;
  touchDrag.target = theater;
  setDropTarget(theater);
});

app.addEventListener("pointerup", event => endTouchDrag(event, true));
app.addEventListener("pointercancel", event => endTouchDrag(event, false));

function renderMenu() {
  mode = "menu";
  app.innerHTML = `
    <main class="shell">
      <section class="menu">
        <h1>ALS online</h1>
        <p class="subtitle">空・陸・海を制する、2人用カードゲーム</p>
        <div class="menu-actions">
          <button class="primary" data-action="host">オンライン部屋を作る</button>
        </div>
        <div class="join-row">
          <input id="room-input" maxlength="2" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(cleanRoom(roomFromUrl))}" placeholder="2桁" aria-label="招待コード">
          <button data-action="join">参加</button>
        </div>
        <button class="ghost" data-action="rules" style="width:100%;margin-top:10px">ルール</button>
        <p class="notice">インストール不要です。オンライン対戦は、部屋を作った人が画面を開いたまま招待コードを共有してください。</p>
      </section>
    </main>${rulesLayer()}`;
}

async function openRules() {
  rulesOpen = true;
  render();
  if (rulesHtml || rulesLoading) return;
  rulesLoading = true;
  try {
    const response = await fetch("./rule.md", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rulesHtml = renderMarkdown(await response.text());
  } catch {
    rulesHtml = "<p>ルールを読み込めませんでした。通信環境を確認してください。</p>";
  } finally {
    rulesLoading = false;
    render();
  }
}

function startHost() {
  if (!window.Peer) return showToast("オンライン機能を読み込めませんでした。通信環境を確認してください。");
  cleanupNetwork();
  mode = "host";
  viewer = 0;
  engine = GameEngine.create();
  hostAttempts = 0;
  createHostPeer();
}

function createHostPeer() {
  roomCode = randomRoomCode();
  connectionText = "部屋を準備中…";
  render();
  const pendingPeer = new window.Peer(`three-fronts-${roomCode}`);
  peer = pendingPeer;
  pendingPeer.on("open", () => {
    if (peer !== pendingPeer) return;
    connectionText = "ゲストの参加を待っています";
    render();
  });
  pendingPeer.on("connection", incoming => {
    if (peer !== pendingPeer) { incoming.close(); return; }
    if (connection?.open) { incoming.close(); return; }
    connection = incoming;
    wireConnection(connection, true);
  });
  pendingPeer.on("error", error => {
    if (peer !== pendingPeer) return;
    if (error?.type === "unavailable-id" && hostAttempts < 12) {
      hostAttempts += 1;
      pendingPeer.destroy();
      createHostPeer();
      return;
    }
    handlePeerError(error);
  });
}

function joinRoom(rawCode) {
  const code = cleanRoom(rawCode);
  if (code.length !== 2) return showToast("2桁の招待コードを入力してください。");
  if (!window.Peer) return showToast("オンライン機能を読み込めませんでした。通信環境を確認してください。");
  cleanupNetwork();
  mode = "guest";
  viewer = 1;
  roomCode = code;
  connectionText = "接続中…";
  engine = null;
  render();

  peer = new window.Peer();
  peer.on("open", () => {
    connection = peer.connect(`three-fronts-${roomCode}`, { reliable: true });
    wireConnection(connection, false);
  });
  peer.on("error", handlePeerError);
}

function wireConnection(conn, isHost) {
  conn.on("open", () => {
    connectionText = "接続済み";
    if (isHost) sendSnapshot();
    render();
  });
  conn.on("data", data => {
    if (!data || typeof data !== "object") return;
    if (isHost && data.kind === "action") {
      applyAction(1, data.action);
    } else if (!isHost && data.kind === "state" && data.state) {
      engine = new GameEngine(data.state);
      selectedCard = "";
      pendingPlacement = null;
      connectionText = "接続済み";
      render();
    } else if (!isHost && data.kind === "error") {
      showToast(data.message || "その操作はできません。");
    }
  });
  conn.on("close", () => { connectionText = "接続が切れました"; render(); });
  conn.on("error", () => { connectionText = "接続エラー"; render(); });
}

function handlePeerError(error) {
  const messages = {
    "unavailable-id": "同じ招待コードの部屋があります。もう一度作成してください。",
    "peer-unavailable": "部屋が見つかりません。コードとホストの接続状態を確認してください。",
    network: "通信に失敗しました。ネットワークを確認してください。"
  };
  connectionText = "接続できませんでした";
  showToast(messages[error?.type] || "オンライン接続に失敗しました。");
  render();
}

function leaveGame() {
  cleanupDesktopDrag();
  cleanupTouchDrag();
  cleanupNetwork();
  engine = null;
  selectedCard = "";
  pendingPlacement = null;
  rulesOpen = false;
  history.replaceState(null, "", location.pathname);
  renderMenu();
}

function cleanupNetwork() {
  if (connection) connection.close();
  if (peer) peer.destroy();
  connection = null;
  peer = null;
  roomCode = "";
  connectionText = "";
}

function sendAction(action) {
  if (mode === "guest") {
    if (!connection?.open) return showToast("まだホストと接続していません。");
    connection.send({ kind: "action", action });
    return;
  }
  applyAction(0, action);
}

function applyAction(player, action) {
  if (!engine || !action || typeof action !== "object") return;
  let result = { ok: false, message: "操作が正しくありません。" };
  try {
    if (action.type === "play") result = engine.playCard(player, action.cardId, action.theater, Boolean(action.faceUp));
    else if (action.type === "withdraw") result = engine.withdraw(player);
    else if (action.type === "choose") result = engine.choose(player, action.key);
    else if (action.type === "next") result = engine.startNextBattle();
    else if (action.type === "new" && (mode !== "host" || player === 0)) {
      engine = GameEngine.create();
      result = { ok: true };
    }
  } catch (error) {
    result = { ok: false, message: error.message || "操作に失敗しました。" };
  }
  if (!result.ok) {
    if (mode === "host" && player === 1 && connection?.open) connection.send({ kind: "error", message: result.message });
    else showToast(result.message);
    return;
  }
  selectedCard = "";
  pendingPlacement = null;
  if (mode === "host") sendSnapshot();
  render();
}

function sendSnapshot() {
  if (connection?.open && engine) connection.send({ kind: "state", state: engine.state });
}

function currentActor() {
  return engine?.state.prompt?.actor ?? engine?.state.activePlayer ?? 0;
}

function render() {
  if (mode === "menu") return renderMenu();
  if (!engine) {
    app.innerHTML = `<main class="shell"><section class="menu"><h2>オンライン対戦</h2><p>${esc(connectionText)}</p><p>招待コード <strong class="room-code">${esc(roomCode)}</strong></p><button data-action="rules">ルール</button> <button data-action="menu">戻る</button></section></main>${rulesLayer()}`;
    return;
  }

  const s = engine.state;
  const actor = currentActor();
  const canAct = s.status === Status.Playing && actor === viewer;
  const onlineInfo = mode === "host" || mode === "guest"
    ? `<small>招待コード <span class="room-code">${esc(roomCode)}</span>・${esc(connectionText)}</small>`
    : `<small>端末を交代しながら遊びます</small>`;

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="ghost" data-action="menu">終了</button>
        <div class="titleline"><strong>ALS online</strong>${onlineInfo}</div>
        <div class="top-actions"><button class="ghost" data-action="rules">ルール</button><button class="ghost" data-action="copy">招待</button></div>
      </header>
      <div class="score">
        ${scoreBox(0, actor)}
        ${scoreBox(1, actor)}
      </div>
      <div class="status">${statusText()}</div>
      <section class="battlefield">
        ${s.theaterOrder.map(t => theaterColumn(t)).join("")}
      </section>
      ${actionPanel(canAct)}
      <details class="log">
        <summary>対戦ログ</summary>
        <ol>${s.log.slice().reverse().map(line => `<li>${esc(line)}</li>`).join("")}</ol>
      </details>
    </main>${placementLayer()}${rulesLayer()}`;
}

function scoreBox(player, actor) {
  const label = playerName(player);
  const first = engine.state.firstPlayer === player ? "・先攻" : "";
  return `<div class="score-box ${actor === player && engine.state.status === Status.Playing ? "active" : ""}"><span>${label}${first}</span><b>${engine.state.scores[player]}点</b></div>`;
}

function statusText() {
  const s = engine.state;
  if (s.status === Status.GameEnded) return `${playerName(s.battleWinner)}の勝利！`;
  if (s.status === Status.BattleEnded) return `${playerName(s.battleWinner)}が第${s.battleNumber}戦に勝利し、${s.battlePoints}点獲得`;
  const actor = currentActor();
  const who = playerName(actor);
  return `第${s.battleNumber}戦・${who}の${s.prompt ? "能力選択" : "手番"}`;
}

function theaterColumn(theater) {
  const a = engine.theaterStrength(0, theater);
  const b = engine.theaterStrength(1, theater);
  const controller = engine.theaterController(theater);
  const opponent = 1 - viewer;
  return `<article class="theater ${theater}" data-theater="${theater}">
    <div class="theater-head">
      <b>${theaterName(theater)}</b>
      <div class="strengths">
        <span class="${controller === opponent ? "controlled" : ""}">${playerName(opponent)} ${opponent === 0 ? a : b}</span>
        <span class="${controller === viewer ? "controlled" : ""}">${playerName(viewer)} ${viewer === 0 ? a : b}</span>
      </div>
    </div>
    <div class="lane opponent">${laneCards(opponent, theater)}</div>
    <div class="lane self">${laneCards(viewer, theater)}</div>
  </article>`;
}

function laneCards(owner, theater) {
  const cards = engine.cardsAt(owner, theater);
  if (!cards.length) return `<span class="empty">カードなし</span>`;
  return cards.slice().reverse().map(c => {
    const visible = c.faceUp || c.owner === viewer;
    const definition = visible ? getCard(c.cardId) : null;
    const title = definition ? definition.name : "裏向きカード";
    const detail = c.faceUp && definition ? definition.text : c.faceUp ? "" : "戦力2（能力なし）";
    return `<div class="unit ${c.faceUp ? "face-up" : "face-down"}">
      <span class="power">${engine.effectiveStrength(c)}</span>
      <b>${esc(title)}</b><small>${esc(detail)}</small>
    </div>`;
  }).join("");
}

function actionPanel(canAct) {
  const s = engine.state;
  if (s.status === Status.BattleEnded) {
    return `<section class="action-panel"><button class="primary" data-action="next" style="width:100%">次の戦闘へ</button></section>`;
  }
  if (s.status === Status.GameEnded) {
    const canRestart = mode !== "guest";
    return `<section class="action-panel"><h3>ゲーム終了</h3>${canRestart ? `<button class="primary" data-action="new" style="width:100%">新しいゲーム</button>` : `<p class="waiting">部屋を作った人が次のゲームを開始できます。</p>`}</section>`;
  }
  if (s.prompt) {
    if (!canAct) return `<section class="action-panel"><p class="waiting">${playerName(s.prompt.actor)}が「${esc(s.prompt.title)}」を選択中です。</p></section>`;
    return `<section class="action-panel prompt">
      <div class="panel-title"><h3>${esc(s.prompt.title)}</h3></div>
      <p>${esc(s.prompt.detail)}</p>
      <div class="choices">${s.prompt.options.map(o => `<button data-action="choose" data-key="${esc(o.key)}">${esc(o.label)}</button>`).join("")}</div>
    </section>`;
  }
  if (!canAct) return `<section class="action-panel"><p class="waiting">${playerName(s.activePlayer)}の手番です。</p></section>`;

  const hand = s.players[viewer].hand;
  if (!hand.includes(selectedCard)) selectedCard = "";
  const selected = selectedCard ? getCard(selectedCard) : null;
  return `<section class="action-panel">
    <div class="panel-title"><h3>手札 ${hand.length}枚</h3><button class="danger" data-action="withdraw" ${s.forcedPlayOnly[viewer] ? "disabled" : ""}>撤退</button></div>
    <div class="hand">${hand.map(id => handCard(id)).join("")}</div>
    ${selected ? placementControls(selected) : `<p class="waiting gesture-hint"><span class="desktop-hint">カードを戦域へドラッグ、またはクリックして選択</span><span class="touch-hint">カードを戦域へ上にスワイプ、またはタップして選択</span></p>`}
  </section>`;
}

function handCard(id) {
  const card = getCard(id);
  return `<button class="hand-card ${card.type} ${selectedCard === id ? "selected" : ""}" data-action="select" data-card="${id}" draggable="true">
    <span class="base">${card.strength}</span><span class="card-type">${theaterName(card.type)}</span><b>${esc(card.name)}</b><small>${esc(card.text)}</small>
  </button>`;
}

function placementControls(card) {
  return `<div class="placement">${engine.state.theaterOrder.map(theater => {
    const upAllowed = engine.canPlayFaceUp(viewer, card.id, theater);
    return `<button data-action="play" data-theater="${theater}" data-face="up" ${upAllowed ? "" : "disabled"}>${theaterName(theater)}へ表向き</button>
      <button data-action="play" data-theater="${theater}" data-face="down">${theaterName(theater)}へ裏向き</button>`;
  }).join("")}</div>`;
}

function canStartPlacement(cardId) {
  return Boolean(
    engine &&
    engine.state.status === Status.Playing &&
    !engine.state.prompt &&
    engine.state.activePlayer === viewer &&
    engine.state.players[viewer].hand.includes(cardId)
  );
}

function requestPlacement(cardId, theater) {
  if (!canStartPlacement(cardId) || !engine.state.theaterOrder.includes(theater)) return;
  selectedCard = cardId;
  pendingPlacement = { cardId, theater };
  render();
}

function finishPlacement(faceUp) {
  if (!pendingPlacement) return;
  const placement = pendingPlacement;
  pendingPlacement = null;
  sendAction({ type: "play", cardId: placement.cardId, theater: placement.theater, faceUp });
}

function placementLayer() {
  if (!pendingPlacement || !engine) return "";
  const card = getCard(pendingPlacement.cardId);
  const upAllowed = engine.canPlayFaceUp(viewer, card.id, pendingPlacement.theater);
  return `<div class="placement-backdrop" role="presentation">
    <section class="placement-dialog" role="dialog" aria-modal="true" aria-label="カードの向きを選択">
      <h2>${esc(card.name)}</h2>
      <p><strong>${theaterName(pendingPlacement.theater)}</strong>へ配置します。向きを選んでください。</p>
      <div class="orientation-actions">
        <button class="primary" data-action="place-dropped" data-face="up" ${upAllowed ? "" : "disabled"}>表向きで出す</button>
        <button data-action="place-dropped" data-face="down">裏向きで出す（戦力2）</button>
      </div>
      ${upAllowed ? "" : `<p class="placement-note">この戦域には表向きで出せません。</p>`}
      <button class="ghost" data-action="cancel-drop">キャンセル</button>
    </section>
  </div>`;
}

function setDropTarget(theater) {
  document.querySelectorAll(".theater.drop-target").forEach(item => item.classList.remove("drop-target"));
  theater?.classList.add("drop-target");
}

function cleanupDesktopDrag() {
  desktopDragCardId = "";
  document.querySelectorAll(".hand-card.dragging").forEach(card => card.classList.remove("dragging"));
  document.body.classList.remove("drag-active");
  setDropTarget(null);
}

function startTouchDrag() {
  if (!touchDrag || touchDrag.dragging) return;
  touchDrag.dragging = true;
  touchDrag.source.classList.add("dragging");
  const ghost = touchDrag.source.cloneNode(true);
  ghost.classList.remove("dragging", "selected");
  ghost.classList.add("drag-ghost");
  ghost.removeAttribute("draggable");
  ghost.removeAttribute("data-action");
  document.body.appendChild(ghost);
  touchDrag.ghost = ghost;
  document.body.classList.add("drag-active");
}

function moveTouchGhost(x, y) {
  if (!touchDrag?.ghost) return;
  touchDrag.ghost.style.left = `${x}px`;
  touchDrag.ghost.style.top = `${y}px`;
}

function endTouchDrag(event, shouldPlace) {
  if (!touchDrag || touchDrag.pointerId !== event.pointerId) return;
  const wasDragging = touchDrag.dragging;
  const cardId = touchDrag.cardId;
  const theater = touchDrag.target?.dataset.theater || "";
  cleanupTouchDrag();
  if (!wasDragging) return;
  suppressClickUntil = Date.now() + 500;
  if (shouldPlace && theater) requestPlacement(cardId, theater);
}

function cleanupTouchDrag() {
  if (!touchDrag) return;
  touchDrag.source?.classList.remove("dragging");
  touchDrag.ghost?.remove();
  touchDrag = null;
  document.body.classList.remove("drag-active");
  setDropTarget(null);
}

async function copyInvite() {
  const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(`ALS onlineの招待コード: ${roomCode}\n${url}`);
    showToast("招待コードとURLをコピーしました。", false);
  } catch {
    showToast(`招待コードは ${roomCode} です。`, false);
  }
}

function rulesLayer() {
  if (!rulesOpen) return "";
  const content = rulesHtml || `<p class="waiting">${rulesLoading ? "読み込み中…" : "ルールを読み込んでいます…"}</p>`;
  return `<div class="rule-backdrop" role="presentation">
    <section class="rule-dialog" role="dialog" aria-modal="true" aria-label="ルール">
      <div class="rule-dialog-head"><h2>ルール</h2><button data-action="close-rules" aria-label="ルールを閉じる">閉じる</button></div>
      <div class="rule-content">${content}</div>
    </section>
  </div>`;
}

function renderMarkdown(source) {
  const lines = esc(source).replace(/\r/g, "").split("\n");
  const html = [];
  let inList = false;
  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };
  const inline = text => text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const item = line.match(/^\s*-\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (item) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inline(item[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join("");
}
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function showToast(message, danger = true) {
  toast.textContent = message;
  toast.style.background = danger ? "#7b332f" : "#295d49";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

renderMenu();
