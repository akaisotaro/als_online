mergeInto(LibraryManager.library, {
  TF_PeerHost: function (roomPtr, targetPtr, callbackPtr) {
    ThreeFrontsPeer.start(true, UTF8ToString(roomPtr), UTF8ToString(targetPtr), UTF8ToString(callbackPtr));
  },
  TF_PeerJoin: function (roomPtr, targetPtr, callbackPtr) {
    ThreeFrontsPeer.start(false, UTF8ToString(roomPtr), UTF8ToString(targetPtr), UTF8ToString(callbackPtr));
  },
  TF_PeerSend: function (messagePtr) {
    ThreeFrontsPeer.send(UTF8ToString(messagePtr));
  },
  TF_PeerClose: function () {
    ThreeFrontsPeer.close();
  }
});

var ThreeFrontsPeer = {
  peer: null,
  conn: null,
  target: null,
  callback: null,
  emit: function (type, payload) {
    if (!this.target || !this.callback) return;
    SendMessage(this.target, this.callback, JSON.stringify({ type: type, payload: payload || "" }));
  },
  load: function (done) {
    if (window.Peer) { done(); return; }
    var existing = document.getElementById("three-fronts-peerjs");
    if (existing) { existing.addEventListener("load", done, { once: true }); return; }
    var script = document.createElement("script");
    script.id = "three-fronts-peerjs";
    script.src = "https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js";
    script.onload = done;
    script.onerror = function () { ThreeFrontsPeer.emit("error", "通信ライブラリを読み込めませんでした。"); };
    document.head.appendChild(script);
  },
  start: function (isHost, room, target, callback) {
    this.close();
    this.target = target;
    this.callback = callback;
    if (!room) { this.emit("error", "部屋コードを入力してください。"); return; }
    this.load(function () {
      var id = "three-fronts-" + room;
      ThreeFrontsPeer.peer = isHost ? new Peer(id) : new Peer();
      ThreeFrontsPeer.peer.on("open", function () {
        ThreeFrontsPeer.emit("open", room);
        if (!isHost) ThreeFrontsPeer.attach(ThreeFrontsPeer.peer.connect(id, { reliable: true }));
      });
      ThreeFrontsPeer.peer.on("connection", function (connection) {
        if (isHost && !ThreeFrontsPeer.conn) ThreeFrontsPeer.attach(connection);
        else connection.close();
      });
      ThreeFrontsPeer.peer.on("error", function (error) {
        var message = error && error.type === "unavailable-id" ? "その部屋コードは使用中です。" : "接続エラー: " + (error.type || error.message || error);
        ThreeFrontsPeer.emit("error", message);
      });
    });
  },
  attach: function (connection) {
    this.conn = connection;
    connection.on("open", function () { ThreeFrontsPeer.emit("connected", ""); });
    connection.on("data", function (data) { ThreeFrontsPeer.emit("data", String(data)); });
    connection.on("close", function () { ThreeFrontsPeer.conn = null; ThreeFrontsPeer.emit("closed", ""); });
    connection.on("error", function (error) { ThreeFrontsPeer.emit("error", "通信エラー: " + (error.message || error)); });
  },
  send: function (message) {
    if (this.conn && this.conn.open) this.conn.send(message);
    else this.emit("error", "対戦相手と接続されていません。");
  },
  close: function () {
    if (this.conn) { try { this.conn.close(); } catch (_) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (_) {} }
    this.conn = null;
    this.peer = null;
  }
};
