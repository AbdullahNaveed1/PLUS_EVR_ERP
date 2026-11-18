using System.Collections.Concurrent;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Slows down password guessing: 5 wrong passwords for one username from one address, or 20 from one address
    /// for any usernames, within 15 minutes blocks further tries for the rest of those 15 minutes.
    /// Kept in memory (one server); a restart clears it.
    /// </summary>
    public static class LoginThrottle
    {
        public const int MaxFailuresPerUser = 5;
        public const int MaxFailuresPerAddress = 20;
        public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

        private static readonly ConcurrentDictionary<string, List<DateTime>> Failures = new();

        // Whole minutes until this sign-in may be tried again; 0 when it is not blocked
        public static int MinutesBlocked(string username, string address, DateTime now) =>
            Math.Max(Blocked(UserKey(username, address), MaxFailuresPerUser, now), Blocked(AddressKey(address), MaxFailuresPerAddress, now));

        public static void Failed(string username, string address, DateTime now)
        {
            if (Failures.Count > 10_000) Prune(now);
            Add(UserKey(username, address), now);
            Add(AddressKey(address), now);
        }

        public static void Succeeded(string username, string address) => Failures.TryRemove(UserKey(username, address), out _);

        // Tests only
        public static void Reset() => Failures.Clear();

        private static string UserKey(string username, string address) => $"u:{username.Trim().ToLowerInvariant()}|{address}";
        private static string AddressKey(string address) => $"a:{address}";

        private static int Blocked(string key, int max, DateTime now)
        {
            if (!Failures.TryGetValue(key, out var times)) return 0;
            lock (times)
            {
                times.RemoveAll(t => now - t >= Window);
                if (times.Count < max) return 0;
                var until = times[^max] + Window;
                return Math.Max(1, (int)Math.Ceiling((until - now).TotalMinutes));
            }
        }

        private static void Add(string key, DateTime now)
        {
            var times = Failures.GetOrAdd(key, _ => new List<DateTime>());
            lock (times) times.Add(now);
        }

        private static void Prune(DateTime now)
        {
            foreach (var (key, times) in Failures)
            {
                bool empty;
                lock (times) { times.RemoveAll(t => now - t >= Window); empty = times.Count == 0; }
                if (empty) Failures.TryRemove(key, out _);
            }
        }
    }
}
