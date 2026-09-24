using System;
using System.Collections.Generic;

namespace ThreeFronts.Core
{
    internal static class DeterministicRandom
    {
        public static uint Seed(int seed)
        {
            var value = unchecked((uint)seed);
            return value == 0 ? 0x9E3779B9u : value;
        }

        public static uint Next(ref uint state)
        {
            var x = state;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            state = x;
            return x;
        }

        public static int Range(ref uint state, int maxExclusive)
        {
            if (maxExclusive <= 0) throw new ArgumentOutOfRangeException(nameof(maxExclusive));
            return (int)(Next(ref state) % (uint)maxExclusive);
        }

        public static void Shuffle<T>(ref uint state, IList<T> items)
        {
            for (var i = items.Count - 1; i > 0; i--)
            {
                var j = Range(ref state, i + 1);
                var temp = items[i];
                items[i] = items[j];
                items[j] = temp;
            }
        }
    }
}
