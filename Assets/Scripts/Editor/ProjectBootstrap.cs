#if UNITY_EDITOR
using System.IO;
using ThreeFronts.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ThreeFronts.EditorTools
{
    [InitializeOnLoad]
    public static class ProjectBootstrap
    {
        public const string MainScene = "Assets/Scenes/Main.unity";

        static ProjectBootstrap()
        {
            EditorApplication.delayCall += EnsureScene;
        }

        public static void EnsureScene()
        {
            if (File.Exists(MainScene)) return;
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("ThreeFrontsApp").AddComponent<GameApp>();
            EditorSceneManager.SaveScene(scene, MainScene);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(MainScene, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("三戦域戦線: Mainシーンを作成しました。");
        }
    }
}
#endif
