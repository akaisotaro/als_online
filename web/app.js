import { CARDS, GameEngine, Status, getCard, theaterName } from "./game.js";

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

const roomFromUrl = new URLSearchParams(location.search).get("room") || "";

app.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "host") startHost();
  else if (action === "join") joinRoom(document.querySelector("#room-input")?.value || "");
  else if (action === "rules") renderRules();
  else if (action === "menu") leaveGame();
  else if (action === "back") renderMenu();
  else if (action === "select") { selectedCard = button.dataset.card; render(); }
  else if (action === "play") sendAction({ type: "play", cardId: selectedCard, theater: button.dataset.theater, faceUp: button.dataset.face === "up" });
  else if (action === "withdraw") sendAction({ type: "withdraw" });
  else if (action === "choose") sendAction({ type: "choose", key: button.dataset.key });
  else if (action === "next") sendAction({ type: "next" });
  else if (action === "new") sendAction({ type: "new" });
  else if (action === "copy") copyInvite();
});

app.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.id === "room-input") {
    joinRoom(event.target.value);
  }
});

function renderMenu() {
  mode = "menu";
  app.innerHTML = `
    <main class="shell">
      <section class="menu">
        <h1>三戦域戦線</h1>
        <p class="subtitle">空・陸・海を制する、2人用カードゲーム</p>
        <div class="menu-actions">
          <button class="primary" data-action="host">オンライン部屋を作る</button>
        </div>
        <div class="join-row">
          <input id="room-input" maxlength="6" inputmode="text" autocomplete="off" value="${esc(cleanRoom(roomFromUrl))}" placeholder="招待コード6桁" aria-label="招待コード">
          <button data-action="join">参加</button>
        </div>
        <button class="ghost" data-action="rules" style="width:100%;margin-top:10px">遊び方・カード一覧</button>
        <p class="notice">インストール不要です。オンライン対戦は、部屋を作った人が画面を開いたまま招待コードを共有してください。</p>
      </section>
    </main>`;
}

function renderRules() {
  app.innerHTML = `
    <main class="shell">
      <section class="menu" style="width:min(760px,100%);margin-top:2vh">
        <h2>遊び方</h2>
        <div class="rules">
          <p>各プレイヤーは6枚の手札を持ち、交互に1枚ずつ場へ出します。表向きならカード本来の戦域で能力が働き、裏向きなら好きな戦域へ戦力2として出せます。</p>
          <p>各戦域の戦力合計を比べ、3戦域のうち2つ以上を支配すると戦闘に勝利します。同点の戦域は、その戦闘の先攻プレイヤーが支配します。12点を先取したプレイヤーがゲームの勝者です。</p>
          <p>不利なら自分の手番に撤退できます。相手の得点は、撤退時の手札枚数と先攻・後攻で変わります。</p>
          <h3>カード一覧</h3>
          ${CARDS.map(c => `<p><b>${esc(c.id)} ${esc(c.name)}（${theaterName(c.type)}・${c.strength}）</b><br>${esc(c.text)}</p>`).join("")}
        </div>
        <button data-action="back" style="width:100%;margin-top:12px">戻る</button>
      </section>
    </main>`;
}

function startHost() {
  if (!window.Peer) return showToast("オンライン機能を読み込めませんでした。通信環境を確認してください。");
  cleanupNetwork();
  mode = "host";
  viewer = 0;
  engine = GameEngine.create();
  roomCode = randomRoomCode();
  connectionText = "部屋を準備中…";
  render();

  peer = new window.Peer(`three-fronts-${roomCode}`);
  peer.on("open", () => { connectionText = "相手の参加を待っています"; render(); });
  peer.on("connection", incoming => {
    if (connection?.open) { incoming.close(); return; }
    connection = incoming;
    wireConnection(connection, true);
  });
  peer.on("error", handlePeerError);
}

function joinRoom(rawCode) {
  const code = cleanRoom(rawCode);
  if (code.length !== 6) return showToast("6桁の招待コードを入力してください。");
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
    "peer-unavailable": "部屋が見つかりません。コードと相手の接続状態を確認してください。",
    network: "通信に失敗しました。ネットワークを確認してください。"
  };
  connectionText = "接続できませんでした";
  showToast(messages[error?.type] || "オンライン接続に失敗しました。");
  render();
}

function leaveGame() {
  cleanupNetwork();
  engine = null;
  selectedCard = "";
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
    if (!connection?.open) return showToast("まだ相手と接続していません。");
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
    app.innerHTML = `<main class="shell"><section class="menu"><h2>オンライン対戦</h2><p>${esc(connectionText)}</p><p>招待コード <strong class="room-code">${esc(roomCode)}</strong></p><button data-action="menu">戻る</button></section></main>`;
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
        <div class="titleline"><strong>三戦域戦線</strong>${onlineInfo}</div>
        ${(mode === "host" || mode === "guest") ? `<button class="ghost" data-action="copy">招待</button>` : `<span></span>`}
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
    </main>`;
}

function scoreBox(player, actor) {
  const label = player === viewer ? "あなた" : "相手";
  const first = engine.state.firstPlayer === player ? "・先攻" : "";
  return `<div class="score-box ${actor === player && engine.state.status === Status.Playing ? "active" : ""}"><span>${label}${first}</span><b>${engine.state.scores[player]}点</b></div>`;
}

function statusText() {
  const s = engine.state;
  if (s.status === Status.GameEnded) return `プレイヤー${s.battleWinner + 1}の勝利！`;
  if (s.status === Status.BattleEnded) return `プレイヤー${s.battleWinner + 1}が第${s.battleNumber}戦に勝利し、${s.battlePoints}点獲得`;
  const actor = currentActor();
  const who = actor === viewer ? "あなた" : "相手";
  return `第${s.battleNumber}戦・${who}の${s.prompt ? "能力選択" : "手番"}`;
}

function theaterColumn(theater) {
  const a = engine.theaterStrength(0, theater);
  const b = engine.theaterStrength(1, theater);
  const controller = engine.theaterController(theater);
  const opponent = 1 - viewer;
  return `<article class="theater ${theater}">
    <div class="theater-head">
      <b>${theaterName(theater)}</b>
      <div class="strengths">
        <span class="${controller === opponent ? "controlled" : ""}">相手 ${opponent === 0 ? a : b}</span>
        <span class="${controller === viewer ? "controlled" : ""}">自分 ${viewer === 0 ? a : b}</span>
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
    if (!canAct) return `<section class="action-panel"><p class="waiting">相手が「${esc(s.prompt.title)}」を選択中です。</p></section>`;
    return `<section class="action-panel prompt">
      <div class="panel-title"><h3>${esc(s.prompt.title)}</h3></div>
      <p>${esc(s.prompt.detail)}</p>
      <div class="choices">${s.prompt.options.map(o => `<button data-action="choose" data-key="${esc(o.key)}">${esc(o.label)}</button>`).join("")}</div>
    </section>`;
  }
  if (!canAct) return `<section class="action-panel"><p class="waiting">相手の手番です。</p></section>`;

  const hand = s.players[viewer].hand;
  if (!hand.includes(selectedCard)) selectedCard = "";
  const selected = selectedCard ? getCard(selectedCard) : null;
  return `<section class="action-panel">
    <div class="panel-title"><h3>手札 ${hand.length}枚</h3><button class="danger" data-action="withdraw" ${s.forcedPlayOnly[viewer] ? "disabled" : ""}>撤退</button></div>
    <div class="hand">${hand.map(id => handCard(id)).join("")}</div>
    ${selected ? placementControls(selected) : `<p class="waiting">出すカードを選んでください。</p>`}
  </section>`;
}

function handCard(id) {
  const card = getCard(id);
  return `<button class="hand-card ${selectedCard === id ? "selected" : ""}" data-action="select" data-card="${id}">
    <span class="base">${card.strength}</span><b>${esc(card.name)}</b><small>${theaterName(card.type)}：${esc(card.text)}</small>
  </button>`;
}

function placementControls(card) {
  return `<div class="placement">${engine.state.theaterOrder.map(theater => {
    const upAllowed = engine.canPlayFaceUp(viewer, card.id, theater);
    return `<button data-action="play" data-theater="${theater}" data-face="up" ${upAllowed ? "" : "disabled"}>${theaterName(theater)}へ表向き</button>
      <button data-action="play" data-theater="${theater}" data-face="down">${theaterName(theater)}へ裏向き</button>`;
  }).join("")}</div>`;
}

async function copyInvite() {
  const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(`三戦域戦線の招待コード: ${roomCode}\n${url}`);
    showToast("招待コードとURLをコピーしました。", false);
  } catch {
    showToast(`招待コードは ${roomCode} です。`, false);
  }
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, n => alphabet[n % alphabet.length]).join("");
}

function cleanRoom(value) { return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function showToast(message, danger = true) {
  toast.textContent = message;
  toast.style.background = danger ? "#7b332f" : "#295d49";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

renderMenu();
