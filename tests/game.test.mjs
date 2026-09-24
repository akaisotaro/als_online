import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARDS, GameEngine, Status, Theater, getCard, playerName } from "../web/game.js";
import { cleanRoom, randomRoomCode } from "../web/room-code.js";

let passed = 0;
function test(name, body) {
  try {
    body();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeEngine(overrides = {}) {
  return new GameEngine({
    rngState: 123,
    battleNumber: 1,
    turnNumber: 1,
    firstPlayer: 0,
    activePlayer: 0,
    nextSequence: 20,
    scores: [0, 0],
    theaterOrder: [Theater.Air, Theater.Land, Theater.Sea],
    players: [{ hand: [] }, { hand: [] }],
    deck: [],
    discard: [],
    field: [],
    effects: [],
    prompt: null,
    airDropSources: ["", ""],
    bonusTurns: [0, 0],
    forcedPlayOnly: [false, false],
    status: Status.Playing,
    log: [],
    ...overrides
  });
}

const p = (cardId, owner, theater, faceUp, sequence) => ({ cardId, owner, theater, faceUp, sequence });

test("18枚のカードが重複なく定義されている", () => {
  assert.equal(CARDS.length, 18);
  assert.equal(new Set(CARDS.map(c => c.id)).size, 18);
});

test("招待コードは2桁の数字", () => {
  for (let i = 0; i < 100; i += 1) assert.match(randomRoomCode(), /^\d{2}$/);
  assert.equal(cleanRoom("A1-23"), "12");
});

test("プレイヤー名はホストとゲスト", () => {
  assert.equal(playerName(0), "ホスト");
  assert.equal(playerName(1), "ゲスト");
});

test("指定された全効果文を保持する", () => {
  const expected = {
    A1: "あなたは隣接する各戦域で戦力3を得る。",
    A2: "あなたが次にカードを場に出すとき、それを異なる戦域に配置してよい。",
    A3: "隣接する戦域1つにある覆われていないカード1枚を裏返す。",
    A4: "あなたは戦力3以下のカードを異なる戦域に配置できる。",
    A5: "いずれかのプレイヤーがカードを裏向きで場に出したとき、このカードを破壊する。",
    A6: "能力なし。",
    L1: "カードを1枚引き、隣接する戦域に裏向きで配置する。",
    L2: "任意の覆われていないカード1枚を裏返す。",
    L3: "隣接する戦域にある覆われていないカード1枚を裏返す。",
    L4: "このカードで覆われた全てのカードは戦力4となる。",
    L5: "あなたから始めて、両プレイヤーは自分の覆われていないカード1枚を選んで裏返す。",
    L6: "能力なし。",
    S1: "あなたは自分のカード1枚を異なる戦域へ移動させることができる。",
    S2: "あなたの全ての裏向きのカードは戦力4となる。",
    S3: "隣接する戦域1つにある覆われていないカード1枚を裏返す。",
    S4: "あなたの裏向きのカード1枚を手札に戻してよい。そうしたならば、カード1枚を場に出す。",
    S5: "他のカードが3枚以上ある隣接する戦域にいずれかのプレイヤーがカードを配置した場合、このカードを破壊する。",
    S6: "能力なし。"
  };
  assert.deepEqual(Object.fromEntries(CARDS.map(c => [c.id, c.text])), expected);
});

test("rule.mdに全カード効果と得点処理がある", () => {
  const rules = readFileSync(new URL("../web/rule.md", import.meta.url), "utf8");
  for (const card of CARDS) {
    assert.equal(rules.includes(card.text), true, `${card.id}の効果文がrule.mdにありません`);
  }
  for (const phrase of ["合計12点", "6点を獲得", "手札6〜4枚: 相手が2点", "手札1〜0枚: 相手が6点"]) {
    assert.equal(rules.includes(phrase), true, `得点処理「${phrase}」がrule.mdにありません`);
  }
});

test("初期配布は各6枚で残り6枚", () => {
  const game = GameEngine.create(42);
  assert.equal(game.state.players[0].hand.length, 6);
  assert.equal(game.state.players[1].hand.length, 6);
  assert.equal(game.state.deck.length, 6);
});

test("撤退点表（先攻）", () => {
  assert.deepEqual([6, 5, 4, 3, 2, 1, 0].map(n => GameEngine.withdrawalPoints(true, n)), [2, 2, 2, 3, 3, 4, 6]);
});

test("撤退点表（後攻）", () => {
  assert.deepEqual([6, 5, 4, 3, 2, 1, 0].map(n => GameEngine.withdrawalPoints(false, n)), [2, 2, 3, 3, 4, 6, 6]);
});

test("通常の表向きカードは本来の戦域だけに出せる", () => {
  const game = makeEngine({ players: [{ hand: ["A6"] }, { hand: ["L6"] }] });
  assert.equal(game.canPlayFaceUp(0, "A6", Theater.Air), true);
  assert.equal(game.canPlayFaceUp(0, "A6", Theater.Sea), false);
});

test("裏向きカードの戦力は2", () => {
  const target = p("A6", 0, Theater.Land, false, 1);
  const game = makeEngine({ field: [target] });
  assert.equal(game.effectiveStrength(target), 2);
});

test("戦力増強は自分の裏向きカードを4にする", () => {
  const target = p("A6", 0, Theater.Land, false, 1);
  const game = makeEngine({ field: [target, p("S2", 0, Theater.Sea, true, 2)] });
  assert.equal(game.effectiveStrength(target), 4);
});

test("航空支援は隣接戦域に3を加える", () => {
  const game = makeEngine({ field: [p("A1", 0, Theater.Land, true, 1)] });
  assert.equal(game.theaterStrength(0, Theater.Air), 3);
  assert.equal(game.theaterStrength(0, Theater.Land), 1);
  assert.equal(game.theaterStrength(0, Theater.Sea), 3);
});

test("掩護射撃は下にあるカードを戦力4にする", () => {
  const lower = p("A6", 0, Theater.Air, true, 1);
  const cover = p("L4", 0, Theater.Air, true, 2);
  const game = makeEngine({ field: [lower, cover] });
  assert.equal(game.effectiveStrength(lower), 4);
  assert.equal(game.effectiveStrength(cover), 4);
});

test("同点戦域は先攻が支配する", () => {
  const game = makeEngine({ firstPlayer: 1 });
  assert.equal(game.theaterController(Theater.Air), 1);
});

test("監視網があると裏向き配置は破壊される", () => {
  const game = makeEngine({
    players: [{ hand: ["L6"] }, { hand: [] }],
    field: [p("A5", 1, Theater.Air, true, 1)]
  });
  assert.equal(game.playCard(0, "L6", Theater.Land, false).ok, true);
  assert.equal(game.state.field.some(c => c.cardId === "L6"), false);
  assert.deepEqual(game.state.discard, ["L6"]);
});

test("海上封鎖は隣接する混雑戦域への配置を破壊する", () => {
  const game = makeEngine({
    players: [{ hand: ["L6"] }, { hand: ["A6"] }],
    field: [
      p("S5", 1, Theater.Sea, true, 1),
      p("A1", 0, Theater.Land, true, 2),
      p("A2", 1, Theater.Land, false, 3),
      p("A3", 0, Theater.Land, false, 4)
    ]
  });
  assert.equal(game.playCard(0, "L6", Theater.Land, true).ok, true);
  assert.equal(game.state.field.some(c => c.cardId === "L6"), false);
  assert.deepEqual(game.state.discard, ["L6"]);
});

test("機動は隣接戦域だけを候補にする", () => {
  const game = makeEngine({
    players: [{ hand: ["A3"] }, { hand: ["S6"] }],
    field: [p("A6", 1, Theater.Air, true, 1), p("L6", 1, Theater.Land, true, 2), p("S5", 1, Theater.Sea, true, 3)]
  });
  game.playCard(0, "A3", Theater.Air, true);
  const keys = game.state.prompt.options.map(o => o.key);
  assert.equal(keys.includes("flip:L6"), true);
  assert.equal(keys.includes("flip:S5"), false);
});

test("臨時飛行場は戦力3以下を別戦域へ出せる", () => {
  const game = makeEngine({ field: [p("A4", 0, Theater.Air, true, 1)] });
  assert.equal(game.canPlayFaceUp(0, "L3", Theater.Sea), true);
  assert.equal(game.canPlayFaceUp(0, "L4", Theater.Sea), false);
});

test("空輸指令は次の1枚だけ別戦域へ出せる", () => {
  const game = makeEngine({
    players: [{ hand: ["A2", "L6"] }, { hand: ["S6"] }],
    activePlayer: 0
  });
  assert.equal(game.playCard(0, "A2", Theater.Air, true).ok, true);
  game.state.activePlayer = 0;
  assert.equal(game.canPlayFaceUp(0, "L6", Theater.Sea), true);
  assert.equal(game.playCard(0, "L6", Theater.Sea, true).ok, true);
  assert.equal(game.canPlayFaceUp(0, "A6", Theater.Sea), false);
});

test("待ち伏せは覆われていないカードを裏返す", () => {
  const game = makeEngine({
    players: [{ hand: ["L2"] }, { hand: ["S6"] }],
    field: [p("A6", 1, Theater.Air, true, 1)]
  });
  game.playCard(0, "L2", Theater.Land, true);
  assert.equal(game.state.prompt.title, "待ち伏せ");
  game.choose(0, "flip:A6");
  assert.equal(game.state.field.find(c => c.cardId === "A6").faceUp, false);
});

test("増援投入は山札から隣接戦域へ裏向き配置する", () => {
  const game = makeEngine({
    players: [{ hand: ["L1"] }, { hand: ["S6"] }],
    deck: ["A6"]
  });
  game.playCard(0, "L1", Theater.Land, true);
  assert.equal(game.state.prompt.title, "増援投入");
  game.choose(0, "play:air");
  const reinforced = game.state.field.find(c => c.cardId === "A6");
  assert.equal(reinforced.faceUp, false);
  assert.equal(reinforced.theater, Theater.Air);
});

test("輸送艦隊は自分のカードを別戦域へ移動する", () => {
  const game = makeEngine({
    players: [{ hand: ["S1"] }, { hand: ["L6"] }],
    field: [p("A6", 0, Theater.Air, true, 1)]
  });
  game.playCard(0, "S1", Theater.Sea, true);
  game.choose(0, "move:A6:land");
  assert.equal(game.state.field.find(c => c.cardId === "A6").theater, Theater.Land);
});

test("再展開で戻すと同じプレイヤーが追加で1枚出す", () => {
  const game = makeEngine({
    players: [{ hand: ["S4", "A6"] }, { hand: ["L6"] }],
    field: [p("L3", 0, Theater.Land, false, 1)]
  });
  game.playCard(0, "S4", Theater.Sea, true);
  game.choose(0, "return:L3");
  assert.equal(game.state.activePlayer, 0);
  assert.equal(game.state.forcedPlayOnly[0], true);
  assert.equal(game.withdraw(0).ok, false);
});

test("12点に達するとゲーム終了", () => {
  const game = makeEngine({ activePlayer: 1, scores: [11, 0], players: [{ hand: ["A6"] }, { hand: ["L6", "S6", "A5", "L5", "S5", "A4"] }] });
  game.withdraw(1);
  assert.equal(game.state.status, Status.GameEnded);
  assert.equal(game.state.scores[0] >= 12, true);
});

console.log(`\n${passed} tests passed.`);
