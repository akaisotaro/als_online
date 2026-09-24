using System;
using System.Collections.Generic;
using System.Linq;
using ThreeFronts.Core;
using ThreeFronts.Networking;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ThreeFronts.UI
{
    public sealed class GameApp : MonoBehaviour
    {
        private enum PlayMode { Menu, Local, Host, Guest }

        private static readonly Color Ink = Hex("E8EEF2");
        private static readonly Color Muted = Hex("AAB8C2");
        private static readonly Color Night = Hex("101820");
        private static readonly Color PanelColor = Hex("192630");
        private static readonly Color AirColor = Hex("52606D");
        private static readonly Color LandColor = Hex("476B4E");
        private static readonly Color SeaColor = Hex("285D78");
        private static readonly Color Accent = Hex("D89A3D");
        private static readonly Color Danger = Hex("9D4B4B");

        private RectTransform _safeRoot;
        private Font _font;
        private PeerNetwork _network;
        private GameEngine _engine;
        private PlayMode _mode;
        private int _localPlayer;
        private int _viewer = -1;
        private string _selectedCard;
        private string _roomCode;
        private string _notice = "";
        private InputField _roomInput;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (FindFirstObjectByType<GameApp>() != null) return;
            new GameObject("ThreeFrontsApp").AddComponent<GameApp>();
        }

        private void Awake()
        {
            DontDestroyOnLoad(gameObject);
            _font = Resources.Load<Font>("Fonts/NotoSansJP-Regular");
            if (_font == null)
            {
                try { _font = Font.CreateDynamicFontFromOSFont(new[] { "Yu Gothic UI", "Meiryo", "Arial" }, 32); }
                catch { _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
            }
            BuildCanvas();
            _network = gameObject.AddComponent<PeerNetwork>();
            _network.Opened += OnPeerOpened;
            _network.Connected += OnPeerConnected;
            _network.MessageReceived += OnPeerMessage;
            _network.ErrorReceived += message => { _notice = message; Render(); };
            _network.Closed += () => { _notice = "対戦相手との接続が切れました。"; Render(); };
            ShowMenu();
        }

        private void BuildCanvas()
        {
            var canvasObject = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = 0.55f;
            var background = canvasObject.AddComponent<Image>();
            background.color = Night;

            var safe = new GameObject("SafeArea", typeof(RectTransform), typeof(SafeAreaFitter));
            safe.transform.SetParent(canvasObject.transform, false);
            _safeRoot = safe.GetComponent<RectTransform>();
            Stretch(_safeRoot);

            if (FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        }

        private void ShowMenu()
        {
            _mode = PlayMode.Menu;
            _engine = null;
            _viewer = -1;
            _selectedCard = null;
            Render();
        }

        private void StartLocal()
        {
            _mode = PlayMode.Local;
            _engine = GameEngine.CreateNew(Environment.TickCount);
            _viewer = -1;
            _selectedCard = null;
            _notice = "";
            Render();
        }

        private void HostRoom()
        {
            var code = NormalizeRoom(_roomInput == null ? "" : _roomInput.text);
            if (string.IsNullOrEmpty(code)) code = RandomRoomCode();
            _roomCode = code;
            _mode = PlayMode.Host;
            _localPlayer = 0;
            _viewer = 0;
            _notice = "部屋を準備しています…";
            Render();
            _network.Host(code);
        }

        private void JoinRoom()
        {
            var code = NormalizeRoom(_roomInput == null ? "" : _roomInput.text);
            if (string.IsNullOrEmpty(code))
            {
                _notice = "部屋コードを入力してください。";
                Render();
                return;
            }
            _roomCode = code;
            _mode = PlayMode.Guest;
            _localPlayer = 1;
            _viewer = 1;
            _notice = "部屋へ接続しています…";
            Render();
            _network.Join(code);
        }

        private void OnPeerOpened()
        {
            _notice = _mode == PlayMode.Host ? "部屋コード「" + _roomCode + "」を友達へ送ってください。" : "部屋を探しています…";
            Render();
        }

        private void OnPeerConnected()
        {
            _notice = "対戦相手と接続しました。";
            if (_mode == PlayMode.Host)
            {
                _engine = GameEngine.CreateNew(Environment.TickCount);
                SendSnapshot();
            }
            Render();
        }

        private void OnPeerMessage(string raw)
        {
            var envelope = JsonUtility.FromJson<NetEnvelope>(raw);
            if (envelope == null) return;
            if (envelope.type == "state" && _mode == PlayMode.Guest)
            {
                var state = JsonUtility.FromJson<GameState>(envelope.payload);
                _engine = new GameEngine(state);
                _selectedCard = null;
                _notice = "";
                Render();
            }
            else if (envelope.type == "command" && _mode == PlayMode.Host)
            {
                var command = JsonUtility.FromJson<GameCommand>(envelope.payload);
                if (command == null) return;
                command.player = 1;
                ApplyCommand(command);
                SendSnapshot();
                Render();
            }
        }

        private void Issue(GameCommand command)
        {
            if (_engine == null) return;
            if (_mode == PlayMode.Guest)
            {
                command.player = 1;
                _network.Send("command", JsonUtility.ToJson(command));
                _notice = "相手側で処理しています…";
            }
            else
            {
                ApplyCommand(command);
                if (_mode == PlayMode.Host) SendSnapshot();
            }
            _selectedCard = null;
            Render();
        }

        private void ApplyCommand(GameCommand command)
        {
            RuleResult result;
            switch (command.kind)
            {
                case "play": result = _engine.PlayCard(command.player, command.cardId, (Theater)command.theater, command.faceUp); break;
                case "withdraw": result = _engine.Withdraw(command.player); break;
                case "choose": result = _engine.Choose(command.player, command.option); break;
                case "next": result = _engine.StartNextBattle(); break;
                default: result = RuleResult.Fail("不明な操作です。"); break;
            }
            _notice = result.ok ? "" : result.message;
        }

        private void SendSnapshot()
        {
            if (_engine != null) _network.Send("state", JsonUtility.ToJson(_engine.State));
        }

        private void Render()
        {
            Clear(_safeRoot);
            if (_mode == PlayMode.Menu) RenderMenu();
            else if (_engine == null) RenderWaiting();
            else RenderGame();
        }

        private void RenderMenu()
        {
            var root = Vertical(_safeRoot, 22, new RectOffset(52, 52, 90, 70));
            AddSpacer(root, 120);
            Label(root, "三戦域戦線", 64, Ink, TextAnchor.MiddleCenter, 110);
            Label(root, "18枚のカードで、空・陸・海のうち2戦域を制圧する\n2人専用の短時間戦略ゲーム", 30, Muted, TextAnchor.MiddleCenter, 130);
            AddSpacer(root, 60);
            Button(root, "この端末で2人対戦", StartLocal, Accent, 108);
            AddSpacer(root, 45);
            Label(root, "オンライン対戦（WebGL版）", 28, Ink, TextAnchor.MiddleCenter, 52);
            _roomInput = Input(root, "例: sora27", 86);
            var row = Horizontal(root, 18, 100);
            Button(row, "部屋を作る", HostRoom, SeaColor, 96);
            Button(row, "部屋に入る", JoinRoom, LandColor, 96);
            if (!string.IsNullOrEmpty(_notice)) Label(root, _notice, 26, Hex("F0B8A9"), TextAnchor.MiddleCenter, 110);
            AddSpacer(root, 20);
            Label(root, "非公式の独自UIです。原作の画像・ロゴ・文章は使用していません。", 22, Muted, TextAnchor.MiddleCenter, 70);
        }

        private void RenderWaiting()
        {
            var root = Vertical(_safeRoot, 24, new RectOffset(55, 55, 130, 80));
            Label(root, "オンライン対戦", 52, Ink, TextAnchor.MiddleCenter, 100);
            if (_mode == PlayMode.Host) Label(root, "部屋コード", 26, Muted, TextAnchor.MiddleCenter, 46);
            if (_mode == PlayMode.Host) Label(root, _roomCode, 74, Accent, TextAnchor.MiddleCenter, 120);
            Label(root, _notice, 30, Ink, TextAnchor.MiddleCenter, 180);
            AddSpacer(root, 40);
            Button(root, "メニューへ戻る", () => { _network.Close(); ShowMenu(); }, PanelColor, 94);
        }

        private void RenderGame()
        {
            var state = _engine.State;
            var requiredViewer = state.prompt != null ? state.prompt.actor : state.activePlayer;
            if (_mode == PlayMode.Local && state.status == GameStatus.Playing && _viewer != requiredViewer)
            {
                RenderPrivacy(requiredViewer);
                return;
            }
            if (_mode != PlayMode.Local) _viewer = _localPlayer;
            if (_viewer < 0) _viewer = requiredViewer;

            var root = Vertical(_safeRoot, 10, new RectOffset(18, 18, 18, 18));
            RenderHeader(root, state);
            RenderBoard(root, state);
            RenderHand(root, state);
            RenderControls(root, state);
            var lastLog = string.Join("\n", state.log.Skip(Math.Max(0, state.log.Count - 2)));
            Label(root, lastLog, 20, Muted, TextAnchor.MiddleLeft, 72);
        }

        private void RenderPrivacy(int player)
        {
            var root = Vertical(_safeRoot, 24, new RectOffset(60, 60, 180, 120));
            AddSpacer(root, 220);
            Label(root, "端末を渡してください", 50, Ink, TextAnchor.MiddleCenter, 100);
            Label(root, "プレイヤー" + (player + 1) + "の番です。\n手札が見えないよう、本人がボタンを押してください。", 30, Muted, TextAnchor.MiddleCenter, 170);
            Button(root, "プレイヤー" + (player + 1) + "として続ける", () => { _viewer = player; Render(); }, Accent, 110);
        }

        private void RenderHeader(Transform root, GameState state)
        {
            var header = Horizontal(root, 12, 92);
            Label(header, $"P1  {state.scores[0]}点", 30, state.firstPlayer == 0 ? Accent : Ink, TextAnchor.MiddleCenter, 88);
            Label(header, $"第{state.battleNumber}戦", 26, Muted, TextAnchor.MiddleCenter, 88);
            Label(header, $"P2  {state.scores[1]}点", 30, state.firstPlayer == 1 ? Accent : Ink, TextAnchor.MiddleCenter, 88);
            var message = state.status == GameStatus.Playing
                ? (state.prompt != null ? "能力を解決中" : "プレイヤー" + (state.activePlayer + 1) + "の手番")
                : (state.status == GameStatus.GameEnded ? "ゲーム終了" : "戦闘終了");
            Label(root, message + (string.IsNullOrEmpty(_notice) ? "" : "　" + _notice), 24,
                string.IsNullOrEmpty(_notice) ? Ink : Hex("F0B8A9"), TextAnchor.MiddleCenter, 52);
        }

        private void RenderBoard(Transform root, GameState state)
        {
            var board = Horizontal(root, 10, 720);
            Layout(board.gameObject, -1, 720, 1, 1);
            foreach (var theater in state.theaterOrder)
            {
                var column = Vertical(board, 7, new RectOffset(8, 8, 8, 8));
                column.GetComponent<Image>().color = TheaterColor(theater);
                Layout(column.gameObject, 0, 700, 1, 1);
                var opponent = 1 - _viewer;
                var oppStrength = _engine.TheaterStrength(opponent, theater);
                var myStrength = _engine.TheaterStrength(_viewer, theater);
                var controller = _engine.TheaterController(theater);
                Label(column, "相手 " + oppStrength, 23, controller == opponent ? Accent : Muted, TextAnchor.MiddleCenter, 42);
                RenderStack(column, opponent, theater, false);
                Label(column, CardCatalog.TheaterName(theater), 38, Ink, TextAnchor.MiddleCenter, 62);
                RenderStack(column, _viewer, theater, true);
                Label(column, "自分 " + myStrength, 23, controller == _viewer ? Accent : Muted, TextAnchor.MiddleCenter, 42);
            }
        }

        private void RenderStack(Transform parent, int owner, Theater theater, bool own)
        {
            var area = Vertical(parent, 3, new RectOffset(2, 2, 2, 2));
            area.GetComponent<Image>().color = new Color(0, 0, 0, 0.12f);
            Layout(area.gameObject, -1, 265, 1, 1);
            var cards = _engine.CardsAt(owner, theater);
            if (cards.Count == 0)
            {
                Label(area, "—", 24, new Color(1, 1, 1, 0.22f), TextAnchor.MiddleCenter, 44);
                return;
            }
            foreach (var card in cards.Reverse())
            {
                var definition = CardCatalog.Get(card.cardId);
                var visible = card.faceUp || own;
                var face = card.faceUp ? "表" : "裏";
                var name = visible ? definition.name : "伏せ札";
                var strength = _engine.EffectiveStrength(card);
                var covered = _engine.IsUncovered(card) ? "" : "・被覆";
                Label(area, $"{strength}  {name}\n{face}{covered}", 19, card.faceUp ? Ink : Muted, TextAnchor.MiddleLeft, 62);
            }
        }

        private void RenderHand(Transform root, GameState state)
        {
            var title = state.status == GameStatus.Playing ? "手札（" + state.players[_viewer].hand.Count + "枚）" : "手札";
            Label(root, title, 24, Muted, TextAnchor.MiddleLeft, 38);
            var hand = Horizontal(root, 8, 235);
            hand.GetComponent<Image>().color = new Color(0, 0, 0, 0.18f);
            Layout(hand.gameObject, -1, 235, 1, 0);
            foreach (var id in state.players[_viewer].hand.OrderBy(id => CardCatalog.Get(id).type).ThenBy(id => CardCatalog.Get(id).strength))
            {
                var card = CardCatalog.Get(id);
                var selected = id == _selectedCard;
                Button(hand, $"{CardCatalog.TheaterName(card.type)} {card.strength}\n{card.name}\n{card.description}",
                    () => { _selectedCard = id; _notice = ""; Render(); }, selected ? Accent : TheaterColor(card.type), 215, 150);
            }
        }

        private void RenderControls(Transform root, GameState state)
        {
            var box = Vertical(root, 8, new RectOffset(8, 8, 8, 8));
            box.GetComponent<Image>().color = PanelColor;
            Layout(box.gameObject, -1, 340, 1, 0);

            if (state.status != GameStatus.Playing)
            {
                Label(box, $"プレイヤー{state.battleWinner + 1}が{state.battlePoints}点獲得", 30, Accent, TextAnchor.MiddleCenter, 68);
                if (state.status == GameStatus.GameEnded)
                {
                    Label(box, $"プレイヤー{state.battleWinner + 1}の勝利！", 40, Ink, TextAnchor.MiddleCenter, 88);
                    Button(box, "メニューへ戻る", ShowMenu, SeaColor, 82);
                }
                else
                {
                    Button(box, "次の戦闘へ", () => Issue(new GameCommand { kind = "next", player = _viewer }), Accent, 88);
                }
                return;
            }

            if (state.prompt != null)
            {
                if (state.prompt.actor != _viewer)
                {
                    Label(box, "相手が「" + state.prompt.title + "」を選択しています。", 25, Muted, TextAnchor.MiddleCenter, 95);
                    return;
                }
                Label(box, state.prompt.title + "　" + state.prompt.detail, 23, Ink, TextAnchor.MiddleLeft, 70);
                var options = Vertical(box, 5, new RectOffset(0, 0, 0, 0));
                foreach (var option in state.prompt.options)
                {
                    var key = option.key;
                    Button(options, option.label, () => Issue(new GameCommand { kind = "choose", player = _viewer, option = key }), SeaColor, 58);
                }
                return;
            }

            if (state.activePlayer != _viewer)
            {
                Label(box, "相手の操作を待っています。", 28, Muted, TextAnchor.MiddleCenter, 100);
                return;
            }

            if (string.IsNullOrEmpty(_selectedCard))
            {
                Label(box, "手札からカードを1枚選んでください。", 26, Ink, TextAnchor.MiddleCenter, 75);
            }
            else
            {
                var selected = CardCatalog.Get(_selectedCard);
                Label(box, selected.name + "　" + selected.description, 22, Ink, TextAnchor.MiddleLeft, 64);
                foreach (var theater in state.theaterOrder)
                {
                    var row = Horizontal(box, 8, 58);
                    var localTheater = theater;
                    var canFaceUp = _engine.CanPlayFaceUp(_viewer, _selectedCard, theater);
                    Button(row, CardCatalog.TheaterName(theater) + "へ表向き", () => Issue(new GameCommand
                    {
                        kind = "play", player = _viewer, cardId = _selectedCard, theater = (int)localTheater, faceUp = true
                    }), canFaceUp ? TheaterColor(theater) : Hex("39434A"), 56, -1, canFaceUp);
                    Button(row, CardCatalog.TheaterName(theater) + "へ裏向き", () => Issue(new GameCommand
                    {
                        kind = "play", player = _viewer, cardId = _selectedCard, theater = (int)localTheater, faceUp = false
                    }), Hex("3B4650"), 56);
                }
            }
            var canWithdraw = !state.forcedPlayOnly[_viewer];
            Button(box, canWithdraw
                    ? "撤退する（相手に" + GameEngine.WithdrawalPointsForRole(_viewer == state.firstPlayer, state.players[_viewer].hand.Count) + "点）"
                    : "再展開：カードを1枚出してください",
                () => Issue(new GameCommand { kind = "withdraw", player = _viewer }), canWithdraw ? Danger : Hex("39434A"), 58, -1, canWithdraw);
        }

        private InputField Input(Transform parent, string placeholder, float height)
        {
            var root = Panel("Input", parent, Ink);
            Layout(root.gameObject, -1, height, 1, 0);
            var input = root.gameObject.AddComponent<InputField>();
            var value = Label(root, "", 34, Night, TextAnchor.MiddleLeft, height - 8);
            Stretch(value.rectTransform);
            value.rectTransform.offsetMin = new Vector2(22, 4);
            value.rectTransform.offsetMax = new Vector2(-22, -4);
            var hint = Label(root, placeholder, 30, Hex("6E7C86"), TextAnchor.MiddleLeft, height - 8);
            Stretch(hint.rectTransform);
            hint.rectTransform.offsetMin = new Vector2(22, 4);
            hint.rectTransform.offsetMax = new Vector2(-22, -4);
            input.textComponent = value;
            input.placeholder = hint;
            input.characterLimit = 12;
            input.contentType = InputField.ContentType.Alphanumeric;
            return input;
        }

        private RectTransform Vertical(Transform parent, float spacing, RectOffset padding)
        {
            var rect = Panel("Vertical", parent, Color.clear);
            var layout = rect.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = spacing;
            layout.padding = padding;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            return rect;
        }

        private RectTransform Vertical(Transform parent, float spacing, float height)
        {
            var rect = Vertical(parent, spacing, new RectOffset());
            Layout(rect.gameObject, -1, height, 1, 0);
            return rect;
        }

        private RectTransform Horizontal(Transform parent, float spacing, float height)
        {
            var rect = Panel("Horizontal", parent, Color.clear);
            var layout = rect.gameObject.AddComponent<HorizontalLayoutGroup>();
            layout.spacing = spacing;
            layout.padding = new RectOffset();
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = true;
            Layout(rect.gameObject, -1, height, 1, 0);
            return rect;
        }

        private Text Label(Transform parent, string value, int size, Color color, TextAnchor anchor, float height)
        {
            var obj = new GameObject("Text", typeof(RectTransform), typeof(Text), typeof(LayoutElement));
            obj.transform.SetParent(parent, false);
            var text = obj.GetComponent<Text>();
            text.text = value;
            text.font = _font;
            text.fontSize = size;
            text.color = color;
            text.alignment = anchor;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Truncate;
            text.resizeTextForBestFit = true;
            text.resizeTextMinSize = Math.Max(13, size - 10);
            text.resizeTextMaxSize = size;
            Layout(obj, -1, height, 1, 0);
            return text;
        }

        private Button Button(Transform parent, string value, Action action, Color color, float height, float width = -1, bool interactable = true)
        {
            var rect = Panel("Button", parent, color);
            Layout(rect.gameObject, width, height, width < 0 ? 1 : 0, 0);
            var button = rect.gameObject.AddComponent<Button>();
            button.targetGraphic = rect.GetComponent<Image>();
            button.interactable = interactable;
            if (action != null) button.onClick.AddListener(() => action());
            var text = Label(rect, value, 25, interactable ? Ink : Muted, TextAnchor.MiddleCenter, height - 6);
            Stretch(text.rectTransform);
            return button;
        }

        private RectTransform Panel(string name, Transform parent, Color color)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(Image));
            obj.transform.SetParent(parent, false);
            obj.GetComponent<Image>().color = color;
            return obj.GetComponent<RectTransform>();
        }

        private static void Layout(GameObject obj, float width, float height, float flexibleWidth, float flexibleHeight)
        {
            var element = obj.GetComponent<LayoutElement>() ?? obj.AddComponent<LayoutElement>();
            if (width >= 0) { element.preferredWidth = width; element.minWidth = width; }
            if (height >= 0) { element.preferredHeight = height; element.minHeight = height; }
            element.flexibleWidth = flexibleWidth;
            element.flexibleHeight = flexibleHeight;
        }

        private static void AddSpacer(Transform parent, float height)
        {
            var obj = new GameObject("Spacer", typeof(RectTransform), typeof(LayoutElement));
            obj.transform.SetParent(parent, false);
            Layout(obj, -1, height, 1, 0);
        }

        private static void Stretch(RectTransform rect)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }

        private static void Clear(Transform parent)
        {
            for (var i = parent.childCount - 1; i >= 0; i--)
            {
                var child = parent.GetChild(i);
                child.SetParent(null, false);
                Destroy(child.gameObject);
            }
        }

        private static Color TheaterColor(Theater theater)
        {
            return theater == Theater.Air ? AirColor : theater == Theater.Land ? LandColor : SeaColor;
        }

        private static string NormalizeRoom(string value)
        {
            return new string((value ?? "").ToLowerInvariant().Where(c => char.IsLetterOrDigit(c)).Take(12).ToArray());
        }

        private static string RandomRoomCode()
        {
            const string chars = "abcdefghjkmnpqrstuvwxyz23456789";
            var rng = new System.Random(Environment.TickCount);
            return new string(Enumerable.Range(0, 6).Select(_ => chars[rng.Next(chars.Length)]).ToArray());
        }

        private static Color Hex(string hex)
        {
            Color color;
            return ColorUtility.TryParseHtmlString("#" + hex, out color) ? color : Color.white;
        }
    }
}
