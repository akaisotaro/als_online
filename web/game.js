export const Theater = Object.freeze({ Air: "air", Land: "land", Sea: "sea" });
export const Status = Object.freeze({ Playing: "playing", BattleEnded: "battle-ended", GameEnded: "game-ended" });

export const CARDS = Object.freeze([
  card("A1", "航空支援", Theater.Air, 1, "support", "ongoing", "あなたは隣接する各戦域で戦力3を得る。"),
  card("A2", "空輸指令", Theater.Air, 2, "airdrop", "instant", "あなたが次にカードを場に出すとき、それを異なる戦域に配置してよい。"),
  card("A3", "航空機動", Theater.Air, 3, "maneuver", "instant", "隣接する戦域1つにある覆われていないカード1枚を裏返す。"),
  card("A4", "臨時飛行場", Theater.Air, 4, "aerodrome", "ongoing", "あなたは戦力3以下のカードを異なる戦域に配置できる。"),
  card("A5", "監視網", Theater.Air, 5, "containment", "ongoing", "いずれかのプレイヤーがカードを裏向きで場に出したとき、このカードを破壊する。"),
  card("A6", "大型爆撃隊", Theater.Air, 6, "none", "none", "能力なし。"),
  card("L1", "増援投入", Theater.Land, 1, "reinforce", "instant", "カードを1枚引き、隣接する戦域に裏向きで配置する。"),
  card("L2", "待ち伏せ", Theater.Land, 2, "ambush", "instant", "任意の覆われていないカード1枚を裏返す。"),
  card("L3", "地上機動", Theater.Land, 3, "maneuver", "instant", "隣接する戦域にある覆われていないカード1枚を裏返す。"),
  card("L4", "掩護射撃", Theater.Land, 4, "coverfire", "ongoing", "このカードで覆われた全てのカードは戦力4となる。"),
  card("L5", "攪乱作戦", Theater.Land, 5, "disrupt", "instant", "あなたから始めて、両プレイヤーは自分の覆われていないカード1枚を選んで裏返す。"),
  card("L6", "重装甲隊", Theater.Land, 6, "none", "none", "能力なし。"),
  card("S1", "輸送艦隊", Theater.Sea, 1, "transport", "instant", "あなたは自分のカード1枚を異なる戦域へ移動させることができる。"),
  card("S2", "戦力増強", Theater.Sea, 2, "escalation", "ongoing", "あなたの全ての裏向きのカードは戦力4となる。"),
  card("S3", "海上機動", Theater.Sea, 3, "maneuver", "instant", "隣接する戦域1つにある覆われていないカード1枚を裏返す。"),
  card("S4", "再展開", Theater.Sea, 4, "redeploy", "instant", "あなたの裏向きのカード1枚を手札に戻してよい。そうしたならば、カード1枚を場に出す。"),
  card("S5", "海上封鎖", Theater.Sea, 5, "blockade", "ongoing", "他のカードが3枚以上ある隣接する戦域にいずれかのプレイヤーがカードを配置した場合、このカードを破壊する。"),
  card("S6", "主力艦隊", Theater.Sea, 6, "none", "none", "能力なし。")
]);

const BY_ID = new Map(CARDS.map(c => [c.id, c]));

function card(id, name, type, strength, ability, timing, text) {
  return Object.freeze({ id, name, type, strength, ability, timing, text });
}

export function getCard(id) {
  const result = BY_ID.get(id);
  if (!result) throw new Error(`Unknown card: ${id}`);
  return result;
}

export function theaterName(value) {
  return value === Theater.Air ? "空" : value === Theater.Land ? "陸" : "海";
}

export class GameEngine {
  constructor(state) {
    this.state = normalizeState(state);
  }

  static create(seed = Date.now()) {
    const state = normalizeState({ rngState: seed >>> 0 || 0x9e3779b9 });
    state.firstPlayer = randomRange(state, 2);
    shuffle(state, state.theaterOrder);
    const engine = new GameEngine(state);
    engine.dealBattle();
    return engine;
  }

  playCard(player, cardId, theater, faceUp) {
    const valid = this.validateMainAction(player);
    if (!valid.ok) return valid;
    if (!this.state.players[player].hand.includes(cardId)) return fail("そのカードは手札にありません。");
    if (!this.state.theaterOrder.includes(theater)) return fail("戦域が正しくありません。");
    if (faceUp && !this.canPlayFaceUp(player, cardId, theater)) return fail("このカードは表向きでその戦域へ出せません。");

    this.state.players[player].hand.splice(this.state.players[player].hand.indexOf(cardId), 1);
    this.state.forcedPlayOnly[player] = false;
    this.state.airDropSources[player] = "";
    this.state.turnNeedsCompletion = true;
    this.placeCard(player, cardId, theater, faceUp);
    this.advanceEffects();
    return ok();
  }

  withdraw(player) {
    const valid = this.validateMainAction(player);
    if (!valid.ok) return valid;
    if (this.state.forcedPlayOnly[player]) return fail("再展開の効果ではカードを1枚出してください。");
    const winner = 1 - player;
    const points = GameEngine.withdrawalPoints(player === this.state.firstPlayer, this.state.players[player].hand.length);
    this.addLog(`プレイヤー${player + 1}が撤退。プレイヤー${winner + 1}が${points}点を獲得。`);
    this.finishBattle(winner, points);
    return ok();
  }

  choose(player, key) {
    const s = this.state;
    if (s.status !== Status.Playing || !s.prompt) return fail("解決待ちの選択はありません。");
    if (s.prompt.actor !== player) return fail("選択するプレイヤーが違います。");
    if (!s.prompt.options.some(o => o.key === key)) return fail("選択肢が正しくありません。");
    if (!s.effects.length) return fail("解決中の効果がありません。");
    s.prompt = null;
    this.resolveChoice(s.effects[s.effects.length - 1], key);
    this.advanceEffects();
    return ok();
  }

  startNextBattle() {
    const s = this.state;
    if (s.status !== Status.BattleEnded) return fail("次の戦闘はまだ開始できません。");
    s.firstPlayer = 1 - s.firstPlayer;
    s.theaterOrder = [s.theaterOrder[2], s.theaterOrder[0], s.theaterOrder[1]];
    this.dealBattle();
    return ok();
  }

  canPlayFaceUp(player, cardId, theater) {
    const definition = getCard(cardId);
    return definition.type === theater || this.hasActiveAirDrop(player) ||
      (definition.strength <= 3 && this.hasFaceUpAbility(player, "aerodrome"));
  }

  cardsAt(owner, theater) {
    return this.state.field.filter(c => c.owner === owner && c.theater === theater).sort((a, b) => a.sequence - b.sequence);
  }

  isUncovered(target) {
    return !this.state.field.some(c => c.owner === target.owner && c.theater === target.theater && c.sequence > target.sequence);
  }

  effectiveStrength(target) {
    if (!target.faceUp) return this.hasFaceUpAbility(target.owner, "escalation") ? 4 : 2;
    const coveredByFire = this.state.field.some(c => c.owner === target.owner && c.theater === target.theater &&
      c.sequence > target.sequence && c.faceUp && getCard(c.cardId).ability === "coverfire");
    return coveredByFire ? 4 : getCard(target.cardId).strength;
  }

  theaterStrength(player, theater) {
    let total = this.state.field.filter(c => c.owner === player && c.theater === theater)
      .reduce((sum, c) => sum + this.effectiveStrength(c), 0);
    for (const support of this.state.field.filter(c => c.owner === player && c.faceUp && getCard(c.cardId).ability === "support")) {
      if (this.areAdjacent(support.theater, theater)) total += 3;
    }
    return total;
  }

  theaterController(theater) {
    const a = this.theaterStrength(0, theater);
    const b = this.theaterStrength(1, theater);
    return a === b ? this.state.firstPlayer : a > b ? 0 : 1;
  }

  static withdrawalPoints(isFirst, count) {
    count = Math.max(0, Math.min(6, count));
    if (isFirst) return count >= 4 ? 2 : count >= 2 ? 3 : count === 1 ? 4 : 6;
    return count >= 5 ? 2 : count >= 3 ? 3 : count === 2 ? 4 : 6;
  }

  validateMainAction(player) {
    const s = this.state;
    if (s.status !== Status.Playing) return fail("戦闘は終了しています。");
    if (s.prompt || s.effects.length) return fail("先にカード能力を解決してください。");
    if (s.activePlayer !== player) return fail("相手の手番です。");
    return ok();
  }

  dealBattle() {
    const s = this.state;
    s.battleNumber += 1;
    s.turnNumber = 1;
    s.activePlayer = s.firstPlayer;
    s.nextSequence = 1;
    s.status = Status.Playing;
    s.battleWinner = -1;
    s.battlePoints = 0;
    s.prompt = null;
    s.turnNeedsCompletion = false;
    s.field = [];
    s.effects = [];
    s.discard = [];
    s.deck = CARDS.map(c => c.id);
    s.players = [{ hand: [] }, { hand: [] }];
    s.airDropSources = ["", ""];
    s.bonusTurns = [0, 0];
    s.forcedPlayOnly = [false, false];
    shuffle(s, s.deck);
    for (let i = 0; i < 6; i += 1) {
      s.players[0].hand.push(s.deck.shift());
      s.players[1].hand.push(s.deck.shift());
    }
    this.addLog(`第${s.battleNumber}戦を開始。プレイヤー${s.firstPlayer + 1}が先攻。`);
  }

  placeCard(owner, cardId, theater, faceUp) {
    const name = faceUp ? getCard(cardId).name : "裏向きカード";
    if (this.shouldDiscardOnPlay(theater, faceUp)) {
      this.state.discard.push(cardId);
      this.addLog(`プレイヤー${owner + 1}の${name}は配置直後に破壊された。`);
      return;
    }
    const played = { cardId, owner, theater, faceUp, sequence: this.state.nextSequence++ };
    this.state.field.push(played);
    this.addLog(`プレイヤー${owner + 1}が${theaterName(theater)}へ${name}を配置。`);
    if (faceUp) this.triggerAbility(played);
  }

  shouldDiscardOnPlay(target, faceUp) {
    if (!faceUp && this.state.field.some(c => c.faceUp && getCard(c.cardId).ability === "containment")) return true;
    if (this.state.field.filter(c => c.theater === target).length < 3) return false;
    return this.state.field.some(c => c.faceUp && getCard(c.cardId).ability === "blockade" && this.areAdjacent(c.theater, target));
  }

  triggerAbility(source) {
    const ability = getCard(source.cardId).ability;
    if (ability === "airdrop") {
      this.state.airDropSources[source.owner] = source.cardId;
      this.addLog(`プレイヤー${source.owner + 1}は次のカードを異なる戦域へ配置できる。`);
      return;
    }
    const effectKinds = new Set(["reinforce", "transport", "maneuver", "ambush", "redeploy", "disrupt"]);
    if (effectKinds.has(ability)) this.state.effects.push({ kind: ability, sourceCardId: source.cardId, owner: source.owner, stage: 0, heldCardId: "" });
  }

  advanceEffects() {
    const s = this.state;
    while (s.status === Status.Playing && !s.prompt && s.effects.length) {
      const frame = s.effects[s.effects.length - 1];
      const source = this.findPlayed(frame.sourceCardId);
      if (!source || !source.faceUp) { s.effects.pop(); continue; }
      if (frame.kind === "reinforce") this.advanceReinforce(frame, source);
      else if (frame.kind === "transport") this.advanceTransport(frame);
      else if (frame.kind === "maneuver") this.advanceFlip(frame, source, true);
      else if (frame.kind === "ambush") this.advanceFlip(frame, source, false);
      else if (frame.kind === "redeploy") this.advanceRedeploy(frame);
      else if (frame.kind === "disrupt") this.advanceDisrupt(frame);
    }
    if (s.status === Status.Playing && !s.prompt && !s.effects.length && s.turnNeedsCompletion) this.finishTurn();
  }

  advanceReinforce(frame, source) {
    if (frame.stage > 0 || !this.state.deck.length) { this.state.effects.pop(); return; }
    frame.heldCardId = this.state.deck[0];
    const options = this.state.theaterOrder.filter(t => this.areAdjacent(source.theater, t))
      .map(t => ({ key: `play:${t}`, label: `${theaterName(t)}へ裏向きで出す` }));
    this.prompt(frame.owner, "増援投入", `山札の一番上は「${getCard(frame.heldCardId).name}」です。`, options);
  }

  advanceTransport(frame) {
    if (frame.stage > 0) { this.state.effects.pop(); return; }
    const options = [];
    for (const target of this.state.field.filter(c => c.owner === frame.owner).sort(bySequence)) {
      for (const theater of this.state.theaterOrder.filter(t => t !== target.theater)) {
        options.push({ key: `move:${target.cardId}:${theater}`, label: `${this.displayName(target, frame.owner)} → ${theaterName(theater)}` });
      }
    }
    options.push({ key: "skip", label: "移動しない" });
    this.prompt(frame.owner, "輸送艦隊", "自分のカード1枚を異なる戦域へ移動できます。", options);
  }

  advanceFlip(frame, source, adjacentOnly) {
    if (frame.stage > 0) { this.state.effects.pop(); return; }
    let candidates = this.state.field.filter(c => this.isUncovered(c));
    if (adjacentOnly) candidates = candidates.filter(c => this.areAdjacent(source.theater, c.theater));
    const options = candidates.sort(bySequence).map(c => ({ key: `flip:${c.cardId}`, label: `${this.displayName(c, frame.owner)}を裏返す` }));
    if (!options.length) { this.state.effects.pop(); return; }
    this.prompt(frame.owner, adjacentOnly ? "機動" : "待ち伏せ", "裏返すカードを選んでください。", options);
  }

  advanceRedeploy(frame) {
    if (frame.stage > 0) { this.state.effects.pop(); return; }
    const options = this.state.field.filter(c => c.owner === frame.owner && !c.faceUp).sort(bySequence)
      .map(c => ({ key: `return:${c.cardId}`, label: `裏向きカード（${theaterName(c.theater)}）を戻す` }));
    options.push({ key: "skip", label: "戻さない" });
    this.prompt(frame.owner, "再展開", "裏向きカードを戻した場合、続けてカードを1枚出します。", options);
  }

  advanceDisrupt(frame) {
    if (frame.stage > 1) { this.state.effects.pop(); return; }
    const actor = frame.stage === 0 ? frame.owner : 1 - frame.owner;
    const options = this.state.field.filter(c => c.owner === actor && this.isUncovered(c)).sort(bySequence)
      .map(c => ({ key: `flip:${c.cardId}`, label: `${this.displayName(c, actor)}を裏返す` }));
    if (!options.length) { frame.stage += 1; return; }
    this.prompt(actor, "攪乱作戦", frame.stage === 0 ? "自分のカード1枚を裏返してください。" : "続いて自分のカード1枚を裏返してください。", options);
  }

  resolveChoice(frame, key) {
    if (frame.kind === "reinforce") {
      frame.stage = 1;
      if (this.state.deck[0] === frame.heldCardId) {
        this.state.deck.shift();
        this.placeCard(frame.owner, frame.heldCardId, key.split(":")[1], false);
      }
    } else if (frame.kind === "transport") {
      frame.stage = 1;
      if (key !== "skip") {
        const [, id, theater] = key.split(":");
        const target = this.findPlayed(id);
        if (target && target.owner === frame.owner) {
          target.theater = theater;
          target.sequence = this.state.nextSequence++;
          this.addLog(`輸送により${getCard(id).name}が${theaterName(theater)}へ移動。`);
        }
      }
    } else if (frame.kind === "maneuver" || frame.kind === "ambush") {
      frame.stage = 1;
      this.flipCard(key.slice(5));
    } else if (frame.kind === "redeploy") {
      frame.stage = 1;
      if (key !== "skip") {
        const target = this.findPlayed(key.slice(7));
        if (target && target.owner === frame.owner && !target.faceUp) {
          this.state.field.splice(this.state.field.indexOf(target), 1);
          this.state.players[frame.owner].hand.push(target.cardId);
          this.state.bonusTurns[frame.owner] += 1;
          this.addLog(`プレイヤー${frame.owner + 1}が裏向きカードを手札へ戻した。`);
        }
      }
    } else if (frame.kind === "disrupt") {
      frame.stage += 1;
      this.flipCard(key.slice(5));
    }
  }

  flipCard(cardId) {
    const target = this.findPlayed(cardId);
    if (!target || !this.isUncovered(target)) return;
    target.faceUp = !target.faceUp;
    const visibleName = target.faceUp ? getCard(target.cardId).name : "カード";
    this.addLog(`${visibleName}を${target.faceUp ? "表" : "裏"}向きにした。`);
    if (target.faceUp) this.triggerAbility(target);
  }

  finishTurn() {
    const s = this.state;
    s.turnNeedsCompletion = false;
    if (!s.players[0].hand.length && !s.players[1].hand.length) { this.resolveCompletedBattle(); return; }
    const current = s.activePlayer;
    if (s.bonusTurns[current] > 0) {
      s.bonusTurns[current] -= 1;
      s.forcedPlayOnly[current] = true;
    } else s.activePlayer = 1 - current;
    if (!s.players[s.activePlayer].hand.length && s.players[1 - s.activePlayer].hand.length) s.activePlayer = 1 - s.activePlayer;
    s.turnNumber += 1;
  }

  resolveCompletedBattle() {
    const wins = this.state.theaterOrder.filter(t => this.theaterController(t) === 0).length;
    const winner = wins >= 2 ? 0 : 1;
    this.addLog(`全カードを解決。プレイヤー${winner + 1}が6点を獲得。`);
    this.finishBattle(winner, 6);
  }

  finishBattle(winner, points) {
    const s = this.state;
    s.scores[winner] += points;
    s.battleWinner = winner;
    s.battlePoints = points;
    s.prompt = null;
    s.effects = [];
    s.turnNeedsCompletion = false;
    s.status = s.scores[winner] >= 12 ? Status.GameEnded : Status.BattleEnded;
    if (s.status === Status.GameEnded) this.addLog(`プレイヤー${winner + 1}がゲームに勝利。`);
  }

  hasActiveAirDrop(player) {
    const id = this.state.airDropSources[player];
    const source = id && this.findPlayed(id);
    return Boolean(source && source.owner === player && source.faceUp && getCard(id).ability === "airdrop");
  }

  hasFaceUpAbility(owner, ability) {
    return this.state.field.some(c => c.owner === owner && c.faceUp && getCard(c.cardId).ability === ability);
  }

  findPlayed(id) { return this.state.field.find(c => c.cardId === id); }

  areAdjacent(a, b) {
    return Math.abs(this.state.theaterOrder.indexOf(a) - this.state.theaterOrder.indexOf(b)) === 1;
  }

  displayName(target, viewer) {
    return target.faceUp || target.owner === viewer ? getCard(target.cardId).name : "相手の裏向きカード";
  }

  prompt(actor, title, detail, options) { this.state.prompt = { actor, title, detail, options }; }

  addLog(text) {
    this.state.log.push(text.trim());
    if (this.state.log.length > 80) this.state.log.shift();
  }
}

function normalizeState(input = {}) {
  return {
    schemaVersion: 1,
    rngState: input.rngState >>> 0 || 0x9e3779b9,
    battleNumber: input.battleNumber || 0,
    turnNumber: input.turnNumber || 0,
    firstPlayer: input.firstPlayer || 0,
    activePlayer: input.activePlayer || 0,
    nextSequence: input.nextSequence || 1,
    scores: input.scores || [0, 0],
    theaterOrder: input.theaterOrder || [Theater.Air, Theater.Land, Theater.Sea],
    players: input.players || [{ hand: [] }, { hand: [] }],
    deck: input.deck || [],
    discard: input.discard || [],
    field: input.field || [],
    effects: input.effects || [],
    prompt: input.prompt || null,
    airDropSources: input.airDropSources || ["", ""],
    bonusTurns: input.bonusTurns || [0, 0],
    forcedPlayOnly: input.forcedPlayOnly || [false, false],
    turnNeedsCompletion: Boolean(input.turnNeedsCompletion),
    status: input.status || Status.Playing,
    battleWinner: Number.isInteger(input.battleWinner) ? input.battleWinner : -1,
    battlePoints: input.battlePoints || 0,
    log: input.log || []
  };
}

function nextRandom(state) {
  let value = state.rngState >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState;
}

function randomRange(state, max) { return nextRandom(state) % max; }
function shuffle(state, values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomRange(state, i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
}
function bySequence(a, b) { return a.sequence - b.sequence; }
function ok(message = "") { return { ok: true, message }; }
function fail(message) { return { ok: false, message }; }
