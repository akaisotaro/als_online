using UnityEngine;

namespace ThreeFronts.UI
{
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        private Rect _last;
        private RectTransform _rect;

        private void Awake()
        {
            _rect = (RectTransform)transform;
            Apply();
        }

        private void Update()
        {
            if (_last != Screen.safeArea) Apply();
        }

        private void Apply()
        {
            _last = Screen.safeArea;
            var min = _last.position;
            var max = _last.position + _last.size;
            min.x /= Screen.width;
            min.y /= Screen.height;
            max.x /= Screen.width;
            max.y /= Screen.height;
            _rect.anchorMin = min;
            _rect.anchorMax = max;
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;
        }
    }
}
