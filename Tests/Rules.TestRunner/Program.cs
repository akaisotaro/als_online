using System;
using System.Collections.Generic;
using System.Linq;
using ThreeFronts.Core;

internal static class Program
{
    private static int _passed;

    private static void Main()
    {
        Run("カードは18枚で一意", CatalogHasEighteenUniqueCards);
        Run("指定された日本語効果文を保持", JapaneseCardTextMatchesProvidedFile);
        Run("同じシードなら同じ配札", SeedIsDeterministic);
        Run("裏向き戦力と戦力増強", FacedownAndEscalationStrength);
        Run("航空支援は隣接戦域に加算", SupportAddsToAdjacentTheaters);
        Run("掩護射撃は下のカードを戦力4にする", CoverFireOverridesCoveredCard);
        Run("監視網は裏向き配置を捨て札にする", ContainmentDiscardsFacedownPlay);
        Run("海上封鎖は隣接戦域の4枚目を捨てる", BlockadeDiscardsFourthCard);
        Run("待ち伏せの選択でカードを反転", AmbushFlipsSelectedCard);
        Run("空輸指令は次の手番だけ異戦域配置を許可", AirDropAllowsOneOffTypeMismatch);
        Run("臨時飛行場は戦力3以下だけ異戦域配置を許可", AerodromeAllowsLowStrengthMismatch);
        Run("増援投入は山札上を隣接戦域へ出す", ReinforcePlaysTopDeckCard);
        Run("輸送艦隊は被覆カードも移動できる", TransportMovesCoveredCard);
        Run("再展開は伏せ札を戻してカード配置を続ける", RedeployReturnsCardAndForcesPlay);
        Run("攪乱作戦は自分、相手の順で反転", DisruptFlipsInOrder);
        Run("攪乱作戦は途中で裏向きになると中断", DisruptCanBeInterrupted);
        Run("撤退点表は先攻と後攻で異なる", WithdrawalChartMatchesCommanderRole);
        Run("同点戦域は先攻が支配", FirstPlayerWinsTies);
        Console.WriteLine($"OK: {_passed} tests passed");
    }

    private static void Run(string name, Action test)
    {
        try
        {
            test();
            _passed++;
            Console.WriteLine("PASS  " + name);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("FAIL  " + name + "\n" + ex.Message);
            Environment.ExitCode = 1;
            throw;
        }
    }

    private static void CatalogHasEighteenUniqueCards()
    {
        Equal(18, CardCatalog.All.Count);
        Equal(18, CardCatalog.All.Select(c => c.id).Distinct().Count());
        foreach (Theater theater in Enum.GetValues(typeof(Theater)))
            Equal(6, CardCatalog.All.Count(c => c.type == theater));
    }

    private static void JapaneseCardTextMatchesProvidedFile()
    {
        var expected = new Dictionary<string, string>
        {
            ["A1"] = "あなたは隣接する各戦域で戦力3を得る。",
            ["A2"] = "あなたが次にカードを場に出すとき、それを異なる戦域に配置してよい。",
            ["A3"] = "隣接する戦域1つにある覆われていないカード1枚を裏返す。",
            ["A4"] = "あなたは戦力3以下のカードを異なる戦域に配置できる。",
            ["A5"] = "いずれかのプレイヤーがカードを裏向きで場に出したとき、このカードを破壊する。",
            ["L1"] = "カードを1枚引き、隣接する戦域に裏向きで配置する。",
            ["L2"] = "任意の覆われていないカード1枚を裏返す。",
            ["L3"] = "隣接する戦域にある覆われていないカード1枚を裏返す。",
            ["L4"] = "このカードで覆われた全てのカードは戦力4となる。",
            ["L5"] = "あなたから始めて、両プレイヤーは自分の覆われていないカード1枚を選んで裏返す。",
            ["S1"] = "あなたは自分のカード1枚を異なる戦域へ移動させることができる。",
            ["S2"] = "あなたの全ての裏向きのカードは戦力4となる。",
            ["S3"] = "隣接する戦域1つにある覆われていないカード1枚を裏返す。",
            ["S4"] = "あなたの裏向きのカード1枚を手札に戻してよい。そうしたならば、カード1枚を場に出す。",
            ["S5"] = "他のカードが3枚以上ある隣接する戦域にいずれかのプレイヤーがカードを配置した場合、このカードを破壊する。"
        };
        foreach (var pair in expected) Equal(pair.Value, CardCatalog.Get(pair.Key).description);
    }

    private static void SeedIsDeterministic()
    {
        var a = GameEngine.CreateNew(12345).State;
        var b = GameEngine.CreateNew(12345).State;
        Sequence(a.players[0].hand, b.players[0].hand);
        Sequence(a.players[1].hand, b.players[1].hand);
        Sequence(a.theaterOrder, b.theaterOrder);
        Equal(a.firstPlayer, b.firstPlayer);
    }

    private static void FacedownAndEscalationStrength()
    {
        var state = EmptyState();
        var hidden = Add(state, "A6", 0, Theater.Air, false, 1);
        var engine = new GameEngine(state);
        Equal(2, engine.EffectiveStrength(hidden));
        Add(state, "S2", 0, Theater.Sea, true, 2);
        Equal(4, engine.EffectiveStrength(hidden));
    }

    private static void SupportAddsToAdjacentTheaters()
    {
        var state = EmptyState();
        state.theaterOrder = new[] { Theater.Land, Theater.Air, Theater.Sea };
        Add(state, "A1", 0, Theater.Air, true, 1);
        var engine = new GameEngine(state);
        Equal(1, engine.TheaterStrength(0, Theater.Air));
        Equal(3, engine.TheaterStrength(0, Theater.Land));
        Equal(3, engine.TheaterStrength(0, Theater.Sea));
    }

    private static void CoverFireOverridesCoveredCard()
    {
        var state = EmptyState();
        var tank = Add(state, "L6", 0, Theater.Land, true, 1);
        Add(state, "L4", 0, Theater.Land, true, 2);
        var engine = new GameEngine(state);
        Equal(4, engine.EffectiveStrength(tank));
        Equal(8, engine.TheaterStrength(0, Theater.Land));
    }

    private static void ContainmentDiscardsFacedownPlay()
    {
        var state = EmptyState();
        state.activePlayer = 1;
        state.players[1].hand.Add("L6");
        Add(state, "A5", 0, Theater.Air, true, 1);
        var engine = new GameEngine(state);
        True(engine.PlayCard(1, "L6", Theater.Land, false).ok);
        Equal(0, state.field.Count(c => c.cardId == "L6"));
        True(state.discard.Contains("L6"));
    }

    private static void BlockadeDiscardsFourthCard()
    {
        var state = EmptyState();
        state.activePlayer = 1;
        state.players[1].hand.Add("A6");
        Add(state, "S5", 0, Theater.Sea, true, 1);
        Add(state, "L1", 0, Theater.Land, false, 2);
        Add(state, "L2", 1, Theater.Land, false, 3);
        Add(state, "L3", 0, Theater.Land, false, 4);
        var engine = new GameEngine(state);
        True(engine.PlayCard(1, "A6", Theater.Land, false).ok);
        Equal(3, state.field.Count(c => c.theater == Theater.Land));
        True(state.discard.Contains("A6"));
    }

    private static void AmbushFlipsSelectedCard()
    {
        var state = EmptyState();
        state.activePlayer = 0;
        state.players[0].hand.Add("L2");
        var target = Add(state, "A6", 1, Theater.Air, true, 1);
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "L2", Theater.Land, true).ok);
        True(state.prompt != null && state.prompt.actor == 0);
        True(engine.Choose(0, "flip:A6").ok);
        True(!target.faceUp);
    }

    private static void AirDropAllowsOneOffTypeMismatch()
    {
        var state = EmptyState();
        state.players[0].hand.AddRange(new[] { "A2", "L6" });
        state.players[1].hand.Add("A6");
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "A2", Theater.Air, true).ok);
        True(engine.PlayCard(1, "A6", Theater.Air, true).ok);
        True(engine.CanPlayFaceUp(0, "L6", Theater.Sea));
        True(engine.PlayCard(0, "L6", Theater.Sea, true).ok);
        True(string.IsNullOrEmpty(state.airDropSources[0]));
    }

    private static void AerodromeAllowsLowStrengthMismatch()
    {
        var state = EmptyState();
        Add(state, "A4", 0, Theater.Air, true, 1);
        var engine = new GameEngine(state);
        True(engine.CanPlayFaceUp(0, "L3", Theater.Sea));
        True(!engine.CanPlayFaceUp(0, "L4", Theater.Sea));
    }

    private static void ReinforcePlaysTopDeckCard()
    {
        var state = EmptyState();
        state.players[0].hand.Add("L1");
        state.players[1].hand.Add("S6");
        state.deck.Add("A6");
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "L1", Theater.Land, true).ok);
        True(state.prompt != null && state.prompt.actor == 0);
        True(engine.Choose(0, "play:0").ok);
        var added = state.field.Single(c => c.cardId == "A6");
        True(!added.faceUp);
        Equal(Theater.Air, added.theater);
        Equal(0, state.deck.Count);
    }

    private static void TransportMovesCoveredCard()
    {
        var state = EmptyState();
        state.players[0].hand.Add("S1");
        state.players[1].hand.Add("L6");
        var covered = Add(state, "A6", 0, Theater.Air, true, 1);
        Add(state, "A1", 0, Theater.Air, true, 2);
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "S1", Theater.Sea, true).ok);
        True(engine.Choose(0, "move:A6:1").ok);
        Equal(Theater.Land, covered.theater);
        True(engine.IsUncovered(covered));
    }

    private static void RedeployReturnsCardAndForcesPlay()
    {
        var state = EmptyState();
        state.players[0].hand.Add("S4");
        state.players[1].hand.Add("L6");
        Add(state, "A6", 0, Theater.Air, false, 1);
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "S4", Theater.Sea, true).ok);
        True(engine.Choose(0, "return:A6").ok);
        True(state.players[0].hand.Contains("A6"));
        Equal(0, state.activePlayer);
        Equal(0, state.bonusTurns[0]);
        True(state.forcedPlayOnly[0]);
        True(!engine.Withdraw(0).ok);
    }

    private static void DisruptFlipsInOrder()
    {
        var state = EmptyState();
        state.players[0].hand.Add("L5");
        state.players[1].hand.Add("S5");
        var theirs = Add(state, "A6", 1, Theater.Air, true, 1);
        var ours = Add(state, "S6", 0, Theater.Sea, true, 2);
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "L5", Theater.Land, true).ok);
        True(state.prompt != null && state.prompt.actor == 0);
        True(engine.Choose(0, "flip:S6").ok);
        True(state.prompt != null && state.prompt.actor == 1);
        True(engine.Choose(1, "flip:A6").ok);
        True(!theirs.faceUp && !ours.faceUp);
    }

    private static void DisruptCanBeInterrupted()
    {
        var state = EmptyState();
        state.players[0].hand.Add("L5");
        state.players[1].hand.Add("S5");
        var ambush = Add(state, "L2", 0, Theater.Air, false, 1);
        var engine = new GameEngine(state);
        True(engine.PlayCard(0, "L5", Theater.Land, true).ok);
        True(engine.Choose(0, "flip:L2").ok);
        True(ambush.faceUp);
        True(state.prompt != null && state.prompt.actor == 0 && state.prompt.title == "待ち伏せ");
        True(engine.Choose(0, "flip:L5").ok);
        var disrupt = state.field.Single(c => c.cardId == "L5");
        True(!disrupt.faceUp);
        True(state.prompt == null);
    }

    private static void WithdrawalChartMatchesCommanderRole()
    {
        Equal(2, GameEngine.WithdrawalPointsForRole(true, 6));
        Equal(2, GameEngine.WithdrawalPointsForRole(true, 4));
        Equal(3, GameEngine.WithdrawalPointsForRole(true, 3));
        Equal(4, GameEngine.WithdrawalPointsForRole(true, 1));
        Equal(6, GameEngine.WithdrawalPointsForRole(true, 0));
        Equal(2, GameEngine.WithdrawalPointsForRole(false, 5));
        Equal(3, GameEngine.WithdrawalPointsForRole(false, 4));
        Equal(4, GameEngine.WithdrawalPointsForRole(false, 2));
        Equal(6, GameEngine.WithdrawalPointsForRole(false, 1));
    }

    private static void FirstPlayerWinsTies()
    {
        var state = EmptyState();
        state.firstPlayer = 1;
        var engine = new GameEngine(state);
        Equal(1, engine.TheaterController(Theater.Air));
    }

    private static GameState EmptyState()
    {
        return new GameState
        {
            rngState = 1,
            firstPlayer = 0,
            activePlayer = 0,
            nextSequence = 10,
            theaterOrder = new[] { Theater.Air, Theater.Land, Theater.Sea },
            players = new[] { new PlayerState(), new PlayerState() },
            field = new List<PlayedCard>(),
            deck = new List<string>(),
            discard = new List<string>(),
            effects = new List<EffectFrame>(),
            log = new List<string>()
        };
    }

    private static PlayedCard Add(GameState state, string id, int owner, Theater theater, bool faceUp, int sequence)
    {
        var card = new PlayedCard { cardId = id, owner = owner, theater = theater, faceUp = faceUp, sequence = sequence };
        state.field.Add(card);
        return card;
    }

    private static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new Exception($"expected={expected}, actual={actual}");
    }

    private static void Sequence<T>(IEnumerable<T> expected, IEnumerable<T> actual)
    {
        if (!expected.SequenceEqual(actual)) throw new Exception("sequences differ");
    }

    private static void True(bool value)
    {
        if (!value) throw new Exception("condition was false");
    }
}
