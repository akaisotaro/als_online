using System;
using System.Collections.Generic;

namespace ThreeFronts.Core
{
    public enum Theater { Air, Land, Sea }
    public enum Ability
    {
        None, Support, AirDrop, Maneuver, Aerodrome, Containment,
        Reinforce, Ambush, CoverFire, Disrupt,
        Transport, Escalation, Redeploy, Blockade
    }
    public enum AbilityTiming { None, Instant, Ongoing }
    public enum GameStatus { Playing, BattleEnded, GameEnded }
    public enum EffectKind { Reinforce, Transport, Maneuver, Ambush, Redeploy, Disrupt }

    [Serializable]
    public sealed class CardDefinition
    {
        public string id;
        public string name;
        public Theater type;
        public int strength;
        public Ability ability;
        public AbilityTiming timing;
        public string description;
    }

    [Serializable]
    public sealed class PlayedCard
    {
        public string cardId;
        public int owner;
        public Theater theater;
        public bool faceUp;
        public int sequence;
    }

    [Serializable]
    public sealed class PlayerState
    {
        public List<string> hand = new List<string>();
    }

    [Serializable]
    public sealed class EffectFrame
    {
        public EffectKind kind;
        public string sourceCardId;
        public int owner;
        public int stage;
        public string heldCardId;
    }

    [Serializable]
    public sealed class ChoiceOption
    {
        public string key;
        public string label;

        public ChoiceOption() { }
        public ChoiceOption(string key, string label)
        {
            this.key = key;
            this.label = label;
        }
    }

    [Serializable]
    public sealed class PendingPrompt
    {
        public int actor;
        public string title;
        public string detail;
        public List<ChoiceOption> options = new List<ChoiceOption>();
    }

    [Serializable]
    public sealed class GameState
    {
        public int schemaVersion = 1;
        public uint rngState;
        public int battleNumber;
        public int turnNumber;
        public int firstPlayer;
        public int activePlayer;
        public int nextSequence;
        public int[] scores = { 0, 0 };
        public Theater[] theaterOrder = { Theater.Air, Theater.Land, Theater.Sea };
        public PlayerState[] players = { new PlayerState(), new PlayerState() };
        public List<string> deck = new List<string>();
        public List<string> discard = new List<string>();
        public List<PlayedCard> field = new List<PlayedCard>();
        public List<EffectFrame> effects = new List<EffectFrame>();
        public PendingPrompt prompt;
        public string[] airDropSources = { "", "" };
        public int[] bonusTurns = { 0, 0 };
        public bool[] forcedPlayOnly = { false, false };
        public bool turnNeedsCompletion;
        public GameStatus status = GameStatus.Playing;
        public int battleWinner = -1;
        public int battlePoints;
        public List<string> log = new List<string>();
    }

    public sealed class RuleResult
    {
        public bool ok;
        public string message;

        public static RuleResult Ok(string message = "") => new RuleResult { ok = true, message = message };
        public static RuleResult Fail(string message) => new RuleResult { ok = false, message = message };
    }
}
