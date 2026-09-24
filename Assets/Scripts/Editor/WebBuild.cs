#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ThreeFronts.EditorTools
{
    public static class WebBuild
    {
        private const string Output = "Builds/WebGL";

        [MenuItem("三戦域戦線/WebGLをビルド")]
        public static void Build()
        {
            BuildInternal(false);
        }

        [MenuItem("三戦域戦線/WebGLをビルドして起動")]
        public static void BuildAndRun()
        {
            BuildInternal(true);
        }

        public static void BuildFromCommandLine()
        {
            BuildInternal(false);
        }

        private static void BuildInternal(bool autoRun)
        {
            ProjectBootstrap.EnsureScene();
            PlayerSettings.productName = "三戦域戦線";
            PlayerSettings.companyName = "Independent Prototype";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.runInBackground = true;

            Directory.CreateDirectory(Output);
            var options = autoRun ? BuildOptions.AutoRunPlayer : BuildOptions.None;
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ProjectBootstrap.MainScene },
                locationPathName = Output,
                target = BuildTarget.WebGL,
                options = options
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new BuildFailedException("WebGL build failed: " + report.summary.result);
            File.WriteAllText(Path.Combine(Output, ".nojekyll"), string.Empty);
            Debug.Log("WebGLビルド完了: " + Path.GetFullPath(Output));
        }
    }
}
#endif
