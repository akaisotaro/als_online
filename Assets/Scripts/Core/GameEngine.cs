using System;
using System.Collections.Generic;
using System.Linq;

namespace ThreeFronts.Core
{
    public sealed class GameEngine
    {
        public GameState State { get; private set; }

        public GameEngine(GameState state)
        {
            State = state ?? throw new ArgumentNullException(nameof(state));
            NormalizeState();
        }

        public static GameEngine CreateNew(int seed)
        {
            var state = new GameState { rngState = DeterministicRandom.Seed(seed) };
            state.firstPlayer = DeterministicRandom.Range(ref state.rngState, 2);
            var order = new List<Theater> { Theater.Air, Theater.Land, Theater.Sea };
            DeterministicRandom.Shuffle(ref state.rngState, order);
            state.theaterOrder = order.ToArray();
            var engine = new GameEngine(state);
            engine.DealBattle();
            return engine;
        }

        public RuleResult PlayCard(int player, string cardId, Theater theater, bool faceUp)
        {
            var validation = ValidateMainAction(player);
            if (!validation.ok) return validation;
            if (!State.players[player].hand.Contains(cardId)) return RuleResult.Fail("そのカードは手札にありません。");
            if (!State.theaterOrder.Contains(theater)) return RuleResult.Fail("戦域が正しくありません。");
            if (faceUp && !CanPlayFaceUp(player, cardId, theater)) return RuleResult.Fail("このカードは表向きでその戦域へ出せません。");

            State.players[player].hand.Remove(cardId);
            State.forcedPlayOnly[player] = false;
            State.airDropSources[player] = "";
            State.turnNeedsCompletion = true;
            PlaceCard(player, cardId, theater, faceUp);
            AdvanceEffects();
            return RuleResult.Ok();
        }

        public RuleResult Withdraw(int player)
        {
            var validation = ValidateMainAction(player);
            if (!validation.ok) return validation;
            if (State.forcedPlayOnly[player]) return RuleResult.Fail("再展開の効果ではカードを1枚出してください。");

            var winner = 1 - player;
            var points = WithdrawalPoints(player, State.players[player].hand.Count);
            AddLog($"プレイヤー{player + 1}が撤退。プレイヤー{winner + 1}が{points}点を獲得。 ");
            FinishBattle(winner, points);
            return RuleResult.Ok();
        }

        public RuleResult Choose(int player, string optionKey)
        {
            if (State.status != GameStatus.Playing) return RuleResult.Fail("現在は選択できません。");
            if (State.prompt == null) return RuleResult.Fail("解決待ちの選択はありません。");
            if (State.prompt.actor != player) return RuleResult.Fail("選択するプレイヤーが違います。");
            if (!State.prompt.options.Any(o => o.key == optionKey)) return RuleResult.Fail("選択肢が正しくありません。");
            if (State.effects.Count == 0) return RuleResult.Fail("解決中の効果がありません。");

            State.prompt = null;
            ResolveChoice(State.effects[State.effects.Count - 1], optionKey);
            AdvanceEffects();
            return RuleResult.Ok();
        }

        public RuleResult StartNextBattle()
        {
            if (State.status != GameStatus.BattleEnded) return RuleResult.Fail("次の戦闘はまだ開始できません。");
            State.firstPlayer = 1 - State.firstPlayer;
            State.theaterOrder = new[] { State.theaterOrder[2], State.theaterOrder[0], State.theaterOrder[1] };
            DealBattle();
            return RuleResult.Ok();
        }

        public bool CanPlayFaceUp(int player, string cardId, Theater theater)
        {
            var card = CardCatalog.Get(cardId);
            if (card.type == theater) return true;
            if (HasActiveAirDrop(player)) return true;
            return card.strength <= 3 && HasFaceUpAbility(player, Ability.Aerodrome);
        }

        public IReadOnlyList<PlayedCard> CardsAt(int player, Theater theater)
        {
            return State.field.Where(c => c.owner == player && c.theater == theater)
                .OrderBy(c => c.sequence).ToList();
        }

        public bool IsUncovered(PlayedCard card)
        {
            return !State.field.Any(c => c.owner == card.owner && c.theater == card.theater && c.sequence > card.sequence);
        }

        public int EffectiveStrength(PlayedCard card)
        {
            if (!card.faceUp) return HasFaceUpAbility(card.owner, Ability.Escalation) ? 4 : 2;
            var coveredByFire = State.field.Any(c =>
                c.owner == card.owner && c.theater == card.theater && c.sequence > card.sequence &&
                c.faceUp && CardCatalog.Get(c.cardId).ability == Ability.CoverFire);
            return coveredByFire ? 4 : CardCatalog.Get(card.cardId).strength;
        }

        public int TheaterStrength(int player, Theater theater)
        {
            var total = State.field.Where(c => c.owner == player && c.theater == theater).Sum(EffectiveStrength);
            foreach (var support in State.field.Where(c => c.owner == player && c.faceUp && CardCatalog.Get(c.cardId).ability == Ability.Support))
            {
                if (AreAdjacent(support.theater, theater)) total += 3;
            }
            return total;
        }

        public int TheaterController(Theater theater)
        {
            var p0 = TheaterStrength(0, theater);
            var p1 = TheaterStrength(1, theater);
            if (p0 == p1) return State.firstPlayer;
            return p0 > p1 ? 0 : 1;
        }

        public static int WithdrawalPointsForRole(bool withdrawingIsFirstPlayer, int cardsInHand)
        {
            cardsInHand = Math.Max(0, Math.Min(6, cardsInHand));
            if (withdrawingIsFirstPlayer)
            {
                if (cardsInHand >= 4) return 2;
                if (cardsInHand >= 2) return 3;
                if (cardsInHand == 1) return 4;
                return 6;
            }
            if (cardsInHand >= 5) return 2;
            if (cardsInHand >= 3) return 3;
            if (cardsInHand == 2) return 4;
            return 6;
        }

        private RuleResult ValidateMainAction(int player)
        {
            if (State.status != GameStatus.Playing) return RuleResult.Fail("戦闘は終了しています。");
            if (State.prompt != null || State.effects.Count > 0) return RuleResult.Fail("先にカード能力の選択を解決してください。");
            if (State.activePlayer != player) return RuleResult.Fail("相手の手番です。");
            return RuleResult.Ok();
        }

        private void NormalizeState()
        {
            if (State.scores == null || State.scores.Length != 2) State.scores = new[] { 0, 0 };
            if (State.players == null || State.players.Length != 2) State.players = new[] { new PlayerState(), new PlayerState() };
            for (var i = 0; i < 2; i++) if (State.players[i] == null) State.players[i] = new PlayerState();
            if (State.theaterOrder == null || State.theaterOrder.Length != 3) State.theaterOrder = new[] { Theater.Air, Theater.Land, Theater.Sea };
            if (State.deck == null) State.deck = new List<string>();
            if (State.discard == null) State.discard = new List<string>();
            if (State.field == null) State.field = new List<PlayedCard>();
            if (State.effects == null) State.effects = new List<EffectFrame>();
            if (State.airDropSources == null || State.airDropSources.Length != 2) State.airDropSources = new[] { "", "" };
            if (State.bonusTurns == null || State.bonusTurns.Length != 2) State.bonusTurns = new[] { 0, 0 };
            if (State.forcedPlayOnly == null || State.forcedPlayOnly.Length != 2) State.forcedPlayOnly = new[] { false, false };
            if (State.log == null) State.log = new List<string>();
        }

        private void DealBattle()
        {
            State.battleNumber++;
            State.turnNumber = 1;
            State.activePlayer = State.firstPlayer;
            State.nextSequence = 1;
            State.status = GameStatus.Playing;
            State.battleWinner = -1;
            State.battlePoints = 0;
            State.prompt = null;
            State.turnNeedsCompletion = false;
            State.field.Clear();
            State.effects.Clear();
            State.discard.Clear();
            State.deck.Clear();
            State.players[0].hand.Clear();
            State.players[1].hand.Clear();
            State.airDropSources[0] = State.airDropSources[1] = "";
            State.bonusTurns[0] = State.bonusTurns[1] = 0;
            State.forcedPlayOnly[0] = State.forcedPlayOnly[1] = false;

            foreach (var card in CardCatalog.All) State.deck.Add(card.id);
            DeterministicRandom.Shuffle(ref State.rngState, State.deck);
            for (var i = 0; i < 6; i++)
            {
                State.players[0].hand.Add(State.deck[0]);
                State.deck.RemoveAt(0);
                State.players[1].hand.Add(State.deck[0]);
                State.deck.RemoveAt(0);
            }
            AddLog($"第{State.battleNumber}戦を開始。プレイヤー{State.firstPlayer + 1}が先攻。");
        }

        private void PlaceCard(int owner, string cardId, Theater theater, bool faceUp)
        {
            var definition = CardCatalog.Get(cardId);
            var hiddenName = faceUp ? definition.name : "裏向きカード";
            if (ShouldDiscardOnPlay(theater, faceUp))
            {
                State.discard.Add(cardId);
                AddLog($"プレイヤー{owner + 1}の{hiddenName}は配置直後に捨て札になった。");
                return;
            }

            var played = new PlayedCard
            {
                cardId = cardId,
                owner = owner,
                theater = theater,
                faceUp = faceUp,
                sequence = State.nextSequence++
            };
            State.field.Add(played);
            AddLog($"プレイヤー{owner + 1}が{CardCatalog.TheaterName(theater)}へ{hiddenName}を配置。");
            if (faceUp) TriggerAbility(played);
        }

        private bool ShouldDiscardOnPlay(Theater target, bool faceUp)
        {
            if (!faceUp && State.field.Any(c => c.faceUp && CardCatalog.Get(c.cardId).ability == Ability.Containment)) return true;
            var occupied = State.field.Count(c => c.theater == target);
            if (occupied < 3) return false;
            return State.field.Any(c => c.faceUp && CardCatalog.Get(c.cardId).ability == Ability.Blockade && AreAdjacent(c.theater, target));
        }

        private void TriggerAbility(PlayedCard source)
        {
            var ability = CardCatalog.Get(source.cardId).ability;
            switch (ability)
            {
                case Ability.AirDrop:
                    State.airDropSources[source.owner] = source.cardId;
                    AddLog($"プレイヤー{source.owner + 1}は次の手番に異なる戦域へ表向き配置できる。");
                    break;
                case Ability.Reinforce: PushEffect(EffectKind.Reinforce, source); break;
                case Ability.Transport: PushEffect(EffectKind.Transport, source); break;
                case Ability.Maneuver: PushEffect(EffectKind.Maneuver, source); break;
                case Ability.Ambush: PushEffect(EffectKind.Ambush, source); break;
                case Ability.Redeploy: PushEffect(EffectKind.Redeploy, source); break;
                case Ability.Disrupt: PushEffect(EffectKind.Disrupt, source); break;
            }
        }

        private void PushEffect(EffectKind kind, PlayedCard source)
        {
            State.effects.Add(new EffectFrame { kind = kind, sourceCardId = source.cardId, owner = source.owner });
        }

        private void AdvanceEffects()
        {
            while (State.status == GameStatus.Playing && State.prompt == null && State.effects.Count > 0)
            {
                var frame = State.effects[State.effects.Count - 1];
                var source = FindPlayed(frame.sourceCardId);
                if (source == null || !source.faceUp)
                {
                    State.effects.RemoveAt(State.effects.Count - 1);
                    continue;
                }

                switch (frame.kind)
                {
                    case EffectKind.Reinforce: AdvanceReinforce(frame, source); break;
                    case EffectKind.Transport: AdvanceTransport(frame); break;
                    case EffectKind.Maneuver: AdvanceFlipEffect(frame, source, true); break;
                    case EffectKind.Ambush: AdvanceFlipEffect(frame, source, false); break;
                    case EffectKind.Redeploy: AdvanceRedeploy(frame); break;
                    case EffectKind.Disrupt: AdvanceDisrupt(frame); break;
                }
            }
            if (State.status == GameStatus.Playing && State.prompt == null && State.effects.Count == 0 && State.turnNeedsCompletion) FinishTurn();
        }

        private void AdvanceReinforce(EffectFrame frame, PlayedCard source)
        {
            if (frame.stage > 0 || State.deck.Count == 0) { PopEffect(); return; }
            frame.heldCardId = State.deck[0];
            var options = new List<ChoiceOption>();
            foreach (var theater in State.theaterOrder.Where(t => AreAdjacent(source.theater, t)))
                options.Add(new ChoiceOption("play:" + (int)theater, CardCatalog.TheaterName(theater) + "へ裏向きで出す"));
            Prompt(frame.owner, "増援投入", "山札の一番上は「" + CardCatalog.Get(frame.heldCardId).name + "」です。", options);
        }

        private void AdvanceTransport(EffectFrame frame)
        {
            if (frame.stage > 0) { PopEffect(); return; }
            var options = new List<ChoiceOption>();
            foreach (var card in State.field.Where(c => c.owner == frame.owner).OrderBy(c => c.sequence))
            {
                foreach (var theater in State.theaterOrder.Where(t => t != card.theater))
                {
                    options.Add(new ChoiceOption($"move:{card.cardId}:{(int)theater}",
                        DisplayName(card, frame.owner) + " → " + CardCatalog.TheaterName(theater)));
                }
            }
            options.Add(new ChoiceOption("skip", "移動しない"));
            Prompt(frame.owner, "輸送艦隊", "自軍カード1枚を別の戦域へ移せます。", options);
        }

        private void AdvanceFlipEffect(EffectFrame frame, PlayedCard source, bool adjacentOnly)
        {
            if (frame.stage > 0) { PopEffect(); return; }
            var candidates = State.field.Where(IsUncovered);
            if (adjacentOnly) candidates = candidates.Where(c => AreAdjacent(source.theater, c.theater));
            var options = candidates.OrderBy(c => c.sequence)
                .Select(c => new ChoiceOption("flip:" + c.cardId, DisplayName(c, frame.owner) + "を反転"))
                .ToList();
            if (options.Count == 0) { PopEffect(); return; }
            Prompt(frame.owner, adjacentOnly ? "機動" : "待ち伏せ", "反転するカードを選んでください。", options);
        }

        private void AdvanceRedeploy(EffectFrame frame)
        {
            if (frame.stage > 0) { PopEffect(); return; }
            var options = State.field.Where(c => c.owner == frame.owner && !c.faceUp)
                .OrderBy(c => c.sequence)
                .Select(c => new ChoiceOption("return:" + c.cardId, "裏向きカード（" + CardCatalog.TheaterName(c.theater) + "）を戻す"))
                .ToList();
            options.Add(new ChoiceOption("skip", "戻さない"));
            Prompt(frame.owner, "再展開", "裏向きカードを手札へ戻すと追加手番を得ます。", options);
        }

        private void AdvanceDisrupt(EffectFrame frame)
        {
            if (frame.stage == 0)
            {
                var actor = frame.owner;
                var options = State.field.Where(c => c.owner == actor && IsUncovered(c)).OrderBy(c => c.sequence)
                    .Select(c => new ChoiceOption("flip:" + c.cardId, DisplayName(c, actor) + "を反転")).ToList();
                if (options.Count == 0) { PopEffect(); return; }
                Prompt(actor, "攪乱作戦", "自分のカード1枚を反転してください。", options);
                return;
            }
            if (frame.stage == 1)
            {
                var actor = 1 - frame.owner;
                var options = State.field.Where(c => c.owner == actor && IsUncovered(c)).OrderBy(c => c.sequence)
                    .Select(c => new ChoiceOption("flip:" + c.cardId, DisplayName(c, actor) + "を反転")).ToList();
                if (options.Count == 0) { PopEffect(); return; }
                Prompt(actor, "攪乱作戦", "続いて自分のカード1枚を反転してください。", options);
                return;
            }
            PopEffect();
        }

        private void ResolveChoice(EffectFrame frame, string optionKey)
        {
            switch (frame.kind)
            {
                case EffectKind.Reinforce:
                    frame.stage = 1;
                    if (optionKey != "skip" && State.deck.Count > 0 && State.deck[0] == frame.heldCardId)
                    {
                        State.deck.RemoveAt(0);
                        PlaceCard(frame.owner, frame.heldCardId, (Theater)int.Parse(optionKey.Split(':')[1]), false);
                    }
                    break;
                case EffectKind.Transport:
                    frame.stage = 1;
                    if (optionKey != "skip")
                    {
                        var parts = optionKey.Split(':');
                        var card = FindPlayed(parts[1]);
                        if (card != null && card.owner == frame.owner)
                        {
                            card.theater = (Theater)int.Parse(parts[2]);
                            card.sequence = State.nextSequence++;
                            AddLog("輸送により" + CardCatalog.Get(card.cardId).name + "が" + CardCatalog.TheaterName(card.theater) + "へ移動。");
                        }
                    }
                    break;
                case EffectKind.Maneuver:
                case EffectKind.Ambush:
                    frame.stage = 1;
                    FlipCard(optionKey.Substring("flip:".Length));
                    break;
                case EffectKind.Redeploy:
                    frame.stage = 1;
                    if (optionKey != "skip")
                    {
                        var card = FindPlayed(optionKey.Substring("return:".Length));
                        if (card != null && card.owner == frame.owner && !card.faceUp)
                        {
                            State.field.Remove(card);
                            State.players[frame.owner].hand.Add(card.cardId);
                            State.bonusTurns[frame.owner]++;
                            AddLog($"プレイヤー{frame.owner + 1}が裏向きカードを手札へ戻し、追加手番を獲得。");
                        }
                    }
                    break;
                case EffectKind.Disrupt:
                    if (frame.stage == 0)
                    {
                        frame.stage = 1;
                        FlipCard(optionKey.Substring("flip:".Length));
                    }
                    else
                    {
                        frame.stage = 2;
                        FlipCard(optionKey.Substring("flip:".Length));
                    }
                    break;
            }
        }

        private void FlipCard(string cardId)
        {
            var card = FindPlayed(cardId);
            if (card == null || !IsUncovered(card)) return;
            card.faceUp = !card.faceUp;
            AddLog(DisplayName(card, card.owner) + (card.faceUp ? "を表向きにした。" : "を裏向きにした。"));
            if (card.faceUp) TriggerAbility(card);
        }

        private void FinishTurn()
        {
            State.turnNeedsCompletion = false;
            if (State.players[0].hand.Count == 0 && State.players[1].hand.Count == 0)
            {
                ResolveCompletedBattle();
                return;
            }

            var current = State.activePlayer;
            if (State.bonusTurns[current] > 0)
            {
                State.bonusTurns[current]--;
                State.forcedPlayOnly[current] = true;
            }
            else
            {
                State.activePlayer = 1 - current;
            }
            if (State.players[State.activePlayer].hand.Count == 0 && State.players[1 - State.activePlayer].hand.Count > 0)
                State.activePlayer = 1 - State.activePlayer;
            State.turnNumber++;
        }

        private void ResolveCompletedBattle()
        {
            var wins0 = State.theaterOrder.Count(t => TheaterController(t) == 0);
            var winner = wins0 >= 2 ? 0 : 1;
            AddLog($"全カードを解決。プレイヤー{winner + 1}が6点を獲得。");
            FinishBattle(winner, 6);
        }

        private void FinishBattle(int winner, int points)
        {
            State.scores[winner] += points;
            State.battleWinner = winner;
            State.battlePoints = points;
            State.prompt = null;
            State.effects.Clear();
            State.turnNeedsCompletion = false;
            State.status = State.scores[winner] >= 12 ? GameStatus.GameEnded : GameStatus.BattleEnded;
            if (State.status == GameStatus.GameEnded) AddLog($"プレイヤー{winner + 1}が戦争に勝利。");
        }

        private int WithdrawalPoints(int player, int cardsInHand)
        {
            return WithdrawalPointsForRole(player == State.firstPlayer, cardsInHand);
        }

        private bool HasActiveAirDrop(int player)
        {
            var id = State.airDropSources[player];
            if (string.IsNullOrEmpty(id)) return false;
            var source = FindPlayed(id);
            return source != null && source.owner == player && source.faceUp && CardCatalog.Get(id).ability == Ability.AirDrop;
        }

        private bool HasFaceUpAbility(int owner, Ability ability)
        {
            return State.field.Any(c => c.owner == owner && c.faceUp && CardCatalog.Get(c.cardId).ability == ability);
        }

        private PlayedCard FindPlayed(string cardId)
        {
            return State.field.FirstOrDefault(c => c.cardId == cardId);
        }

        private bool AreAdjacent(Theater a, Theater b)
        {
            var ia = Array.IndexOf(State.theaterOrder, a);
            var ib = Array.IndexOf(State.theaterOrder, b);
            return ia >= 0 && ib >= 0 && Math.Abs(ia - ib) == 1;
        }

        private string DisplayName(PlayedCard card, int viewer)
        {
            return card.faceUp || card.owner == viewer ? CardCatalog.Get(card.cardId).name : "相手の裏向きカード";
        }

        private void Prompt(int actor, string title, string detail, List<ChoiceOption> options)
        {
            State.prompt = new PendingPrompt { actor = actor, title = title, detail = detail, options = options };
        }

        private void PopEffect()
        {
            State.effects.RemoveAt(State.effects.Count - 1);
        }

        private void AddLog(string text)
        {
            State.log.Add(text.Trim());
            if (State.log.Count > 80) State.log.RemoveAt(0);
        }
    }
}
