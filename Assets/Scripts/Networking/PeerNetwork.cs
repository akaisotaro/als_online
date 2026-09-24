using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace ThreeFronts.Networking
{
    [Serializable]
    public sealed class PeerEvent
    {
        public string type;
        public string payload;
    }

    [Serializable]
    public sealed class NetEnvelope
    {
        public string type;
        public string payload;
    }

    [Serializable]
    public sealed class GameCommand
    {
        public string kind;
        public int player;
        public string cardId;
        public int theater;
        public bool faceUp;
        public string option;
    }

    public sealed class PeerNetwork : MonoBehaviour
    {
        public event Action Opened;
        public event Action Connected;
        public event Action<string> MessageReceived;
        public event Action<string> ErrorReceived;
        public event Action Closed;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void TF_PeerHost(string roomCode, string target, string callback);
        [DllImport("__Internal")] private static extern void TF_PeerJoin(string roomCode, string target, string callback);
        [DllImport("__Internal")] private static extern void TF_PeerSend(string message);
        [DllImport("__Internal")] private static extern void TF_PeerClose();
#endif

        public void Host(string roomCode)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TF_PeerHost(Normalize(roomCode), gameObject.name, nameof(OnPeerEvent));
#else
            ErrorReceived?.Invoke("オンライン対戦はWebGLビルドで利用できます。");
#endif
        }

        public void Join(string roomCode)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TF_PeerJoin(Normalize(roomCode), gameObject.name, nameof(OnPeerEvent));
#else
            ErrorReceived?.Invoke("オンライン対戦はWebGLビルドで利用できます。");
#endif
        }

        public void Send(string type, string payload)
        {
            var message = JsonUtility.ToJson(new NetEnvelope { type = type, payload = payload });
#if UNITY_WEBGL && !UNITY_EDITOR
            TF_PeerSend(message);
#endif
        }

        public void Close()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TF_PeerClose();
#endif
        }

        public void OnPeerEvent(string json)
        {
            var peerEvent = JsonUtility.FromJson<PeerEvent>(json);
            switch (peerEvent.type)
            {
                case "open": Opened?.Invoke(); break;
                case "connected": Connected?.Invoke(); break;
                case "data": MessageReceived?.Invoke(peerEvent.payload); break;
                case "error": ErrorReceived?.Invoke(peerEvent.payload); break;
                case "closed": Closed?.Invoke(); break;
            }
        }

        private static string Normalize(string code)
        {
            return (code ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", "");
        }

        private void OnDestroy()
        {
            Close();
        }
    }
}
