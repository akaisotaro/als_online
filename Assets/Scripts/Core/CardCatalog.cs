using System;
using System.Collections.Generic;

namespace ThreeFronts.Core
{
    public static class CardCatalog
    {
        private static readonly List<CardDefinition> Cards = new List<CardDefinition>
        {
            Card("A1", "航空支援", Theater.Air, 1, Ability.Support, AbilityTiming.Ongoing, "あなたは隣接する各戦域で戦力3を得る。"),
            Card("A2", "空輸指令", Theater.Air, 2, Ability.AirDrop, AbilityTiming.Instant, "あなたが次にカードを場に出すとき、それを異なる戦域に配置してよい。"),
            Card("A3", "航空機動", Theater.Air, 3, Ability.Maneuver, AbilityTiming.Instant, "隣接する戦域1つにある覆われていないカード1枚を裏返す。"),
            Card("A4", "臨時飛行場", Theater.Air, 4, Ability.Aerodrome, AbilityTiming.Ongoing, "あなたは戦力3以下のカードを異なる戦域に配置できる。"),
            Card("A5", "監視網", Theater.Air, 5, Ability.Containment, AbilityTiming.Ongoing, "いずれかのプレイヤーがカードを裏向きで場に出したとき、このカードを破壊する。"),
            Card("A6", "大型爆撃隊", Theater.Air, 6, Ability.None, AbilityTiming.None, "能力なし。"),
            Card("L1", "増援投入", Theater.Land, 1, Ability.Reinforce, AbilityTiming.Instant, "カードを1枚引き、隣接する戦域に裏向きで配置する。"),
            Card("L2", "待ち伏せ", Theater.Land, 2, Ability.Ambush, AbilityTiming.Instant, "任意の覆われていないカード1枚を裏返す。"),
            Card("L3", "地上機動", Theater.Land, 3, Ability.Maneuver, AbilityTiming.Instant, "隣接する戦域にある覆われていないカード1枚を裏返す。"),
            Card("L4", "掩護射撃", Theater.Land, 4, Ability.CoverFire, AbilityTiming.Ongoing, "このカードで覆われた全てのカードは戦力4となる。"),
            Card("L5", "攪乱作戦", Theater.Land, 5, Ability.Disrupt, AbilityTiming.Instant, "あなたから始めて、両プレイヤーは自分の覆われていないカード1枚を選んで裏返す。"),
            Card("L6", "重装甲隊", Theater.Land, 6, Ability.None, AbilityTiming.None, "能力なし。"),
            Card("S1", "輸送艦隊", Theater.Sea, 1, Ability.Transport, AbilityTiming.Instant, "あなたは自分のカード1枚を異なる戦域へ移動させることができる。"),
            Card("S2", "戦力増強", Theater.Sea, 2, Ability.Escalation, AbilityTiming.Ongoing, "あなたの全ての裏向きのカードは戦力4となる。"),
            Card("S3", "海上機動", Theater.Sea, 3, Ability.Maneuver, AbilityTiming.Instant, "隣接する戦域1つにある覆われていないカード1枚を裏返す。"),
            Card("S4", "再展開", Theater.Sea, 4, Ability.Redeploy, AbilityTiming.Instant, "あなたの裏向きのカード1枚を手札に戻してよい。そうしたならば、カード1枚を場に出す。"),
            Card("S5", "海上封鎖", Theater.Sea, 5, Ability.Blockade, AbilityTiming.Ongoing, "他のカードが3枚以上ある隣接する戦域にいずれかのプレイヤーがカードを配置した場合、このカードを破壊する。"),
            Card("S6", "主力艦隊", Theater.Sea, 6, Ability.None, AbilityTiming.None, "能力なし。")
        };

        private static readonly Dictionary<string, CardDefinition> ById = BuildIndex();
        public static IReadOnlyList<CardDefinition> All => Cards;

        public static CardDefinition Get(string id)
        {
            CardDefinition card;
            if (!ById.TryGetValue(id, out card)) throw new ArgumentException("Unknown card: " + id, nameof(id));
            return card;
        }

        public static string TheaterName(Theater theater)
        {
            switch (theater)
            {
                case Theater.Air: return "空";
                case Theater.Land: return "陸";
                default: return "海";
            }
        }

        private static CardDefinition Card(string id, string name, Theater type, int strength, Ability ability, AbilityTiming timing, string description)
        {
            return new CardDefinition { id = id, name = name, type = type, strength = strength, ability = ability, timing = timing, description = description };
        }

        private static Dictionary<string, CardDefinition> BuildIndex()
        {
            var result = new Dictionary<string, CardDefinition>(StringComparer.Ordinal);
            foreach (var card in Cards) result.Add(card.id, card);
            return result;
        }
    }
}
