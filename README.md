# 三戦域戦線

3つの戦域をめぐる2人用カードゲームを、Unity Webで遊べるようにした非公式の独自実装です。
原作のゲーム進行を検証できるルールエンジンを備えていますが、原作のロゴ、画像、レイアウト、文章は収録していません。

## 対応範囲

- 18枚のカードと全能力
- 表向き／裏向き配置、被覆、戦力計算、同点時の先攻優先
- 撤退点、戦域ローテーション、先攻交代、12点勝利
- ローカル2人対戦（端末受け渡し時の手札隠し）
- WebGLでの招待コード式P2P対戦（PeerJS。試験実装）
- PCブラウザとiPhone Safari 15以降を想定したレスポンシブUI

## 開き方

1. Unity Hubで Unity 6.3 LTS（6000.3.15f1）と Web Build Support を導入します。
2. このフォルダをUnity Hubから開きます。
3. 初回コンパイル後、`Assets/Scenes/Main.unity` が自動生成されます。
4. Playを押すとローカル対戦を確認できます。

## Webビルド

Unityのメニューから `三戦域戦線 > WebGLをビルド` を選びます。成果物は `Builds/WebGL` に出力されます。
ローカル確認は `三戦域戦線 > WebGLをビルドして起動` を使用してください。

GitHub Pagesでは、リポジトリ設定の Pages を GitHub Actions に変更すると、`.github/workflows/pages.yml` が `Builds/WebGL` を公開します。
Unityエディターが未導入の環境ではWebGL成果物を生成できません。

## ルールテスト

Unity不要のテストランナーです。

```powershell
dotnet run --project Tests/Rules.TestRunner/Rules.TestRunner.csproj
```

## 公開前の注意

本リポジトリは原作の画像・ロゴ・カード文章を含めない設計です。ゲーム名を原作名に変更したり、原作素材を追加して一般公開する前に、権利者の許諾と利用条件を確認してください。詳細は `docs/RIGHTS.md` を参照してください。
