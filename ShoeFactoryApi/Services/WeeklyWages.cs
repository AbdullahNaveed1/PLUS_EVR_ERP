using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Piece-rate (thekka) wages per week, Saturday to Friday, paid on Saturday.
    /// Earned = dozens made × the worker's rate for that article / size. Final = earned − advances
    /// taken that week + whatever carried from earlier weeks (owed to the worker, or advance to recover).
    /// Production and advances before the start date were settled outside the app and are ignored.
    /// </summary>
    public static class WeeklyWages
    {
        // Everything before this day was already settled by hand (WAGES_START_DATE overrides it)
        public static DateOnly StartDate =>
            DateOnly.TryParse(Environment.GetEnvironmentVariable("WAGES_START_DATE"), out var d) ? d : new DateOnly(2026, 11, 13);

        private const int MaxWeeksBack = 52;

        public static DateOnly WeekStartOf(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek - (int)DayOfWeek.Saturday + 7) % 7));

        private static string Norm(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", "");

        // Most specific rate: article + size, then article, then size, then the general rate
        public static WageRate? RateFor(IReadOnlyList<WageRate> rates, string article, string? size)
        {
            var a = Norm(article);
            var s = Norm(size);
            bool Any(string? v) => string.IsNullOrWhiteSpace(v);
            return rates.FirstOrDefault(r => !Any(r.ArticleNumber) && Norm(r.ArticleNumber) == a && !Any(r.Size) && s.Length > 0 && Norm(r.Size) == s)
                ?? rates.FirstOrDefault(r => !Any(r.ArticleNumber) && Norm(r.ArticleNumber) == a && Any(r.Size))
                ?? rates.FirstOrDefault(r => Any(r.ArticleNumber) && !Any(r.Size) && s.Length > 0 && Norm(r.Size) == s)
                ?? rates.FirstOrDefault(r => Any(r.ArticleNumber) && Any(r.Size));
        }

        public sealed record Line(string Article, string Size, decimal Dozens, decimal Rate, decimal Amount);
        public sealed record Advance(int Id, DateOnly Date, decimal Amount, string Notes);
        public sealed record Week(DateOnly WeekStart, DateOnly WeekEnd, List<Line> Lines, decimal Dozens, decimal Earned,
            List<Advance> Advances, decimal AdvanceTotal, List<string> Warnings);

        /// <summary>Earnings and advances of one worker for the week starting on the given Saturday.</summary>
        public static async Task<Week> ComputeWeek(FactoryDbContext db, int workerId, DateOnly weekStart)
        {
            var weekEnd = weekStart.AddDays(6);
            var from = weekStart < StartDate ? StartDate : weekStart;
            var rates = await db.WageRates.AsNoTracking().Where(r => r.WorkerId == workerId).ToListAsync();

            var lines = new Dictionary<(string, string, decimal), (decimal dozens, decimal amount)>();
            var warnings = new List<string>();
            if (from <= weekEnd)
            {
                var start = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var end = weekEnd.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var records = await db.ProductionRecords.AsNoTracking()
                    .Where(p => p.Date >= start && p.Date < end)
                    .OrderBy(p => p.Date).ThenBy(p => p.Id)
                    .ToListAsync();

                foreach (var record in records)
                {
                    var sizes = ReadSizes(record.SizesJson);
                    var parts = sizes.Count > 0
                        ? sizes.Select(s => (Size: s.Size, Dozens: s.Dozens + s.Pairs / 12m)).ToList()
                        : new List<(string Size, decimal Dozens)> { (string.Empty, record.Dozens + record.Pairs / 12m) };

                    // Saved without sizes while this worker has a size-specific rate for the article: paid at the general rate
                    if (sizes.Count == 0 && rates.Any(r => !string.IsNullOrWhiteSpace(r.Size) &&
                            (string.IsNullOrWhiteSpace(r.ArticleNumber) || Norm(r.ArticleNumber) == Norm(record.ArticleNumber))))
                    {
                        warnings.Add($"Article {record.ArticleNumber} on {DateOnly.FromDateTime(record.Date):dd-MM-yyyy}: " +
                                     $"{record.Dozens + record.Pairs / 12m:0.##} dozen saved without sizes, paid at the normal rate. Add sizes to that production if some were a special size.");
                    }

                    foreach (var (size, dozens) in parts)
                    {
                        if (dozens <= 0) continue;
                        var rate = RateFor(rates, record.ArticleNumber, size);
                        if (rate == null)
                        {
                            warnings.Add($"No rate for article {record.ArticleNumber}{(size.Length > 0 ? $" size {size}" : "")}: {dozens:0.##} dozen not paid. Add a rate.");
                            continue;
                        }
                        var key = (record.ArticleNumber.Trim(), size.Trim(), rate.RatePerDozen);
                        var current = lines.GetValueOrDefault(key);
                        lines[key] = (current.dozens + dozens, current.amount + dozens * rate.RatePerDozen);
                    }
                }
            }

            var advStart = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var advEnd = weekEnd.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var advances = from > weekEnd
                ? new List<Advance>()
                : (await db.WagePayments.AsNoTracking()
                    .Where(p => p.WorkerId == workerId && p.Kind != WagePaymentKinds.Settlement && p.PaymentDate >= advStart && p.PaymentDate < advEnd)
                    .OrderBy(p => p.PaymentDate).ToListAsync())
                    .Select(p => new Advance(p.Id, DateOnly.FromDateTime(p.PaymentDate), p.Amount, p.Notes)).ToList();

            var lineList = lines
                .Select(kv => new Line(kv.Key.Item1, kv.Key.Item2, decimal.Round(kv.Value.dozens, 4), kv.Key.Item3, decimal.Round(kv.Value.amount, 2)))
                .OrderBy(l => l.Article).ThenBy(l => l.Size).ToList();

            return new Week(weekStart, weekEnd, lineList, lineList.Sum(l => l.Dozens), lineList.Sum(l => l.Amount),
                advances, advances.Sum(a => a.Amount), warnings);
        }

        /// <summary>
        /// What carries into a week: the last settlement's carry-out, plus the net of any later weeks
        /// that were never settled (so nothing earned or advanced is lost if a Saturday was skipped).
        /// </summary>
        public static async Task<decimal> CarryIn(FactoryDbContext db, int workerId, DateOnly weekStart)
        {
            var last = await db.WeeklySettlements.AsNoTracking()
                .Where(s => s.WorkerId == workerId && s.WeekStart < weekStart)
                .OrderByDescending(s => s.WeekStart).FirstOrDefaultAsync();

            var carry = last?.CarryOut ?? 0;
            var week = last != null ? last.WeekStart.AddDays(7) : WeekStartOf(StartDate);
            for (var i = 0; week < weekStart && i < MaxWeeksBack; week = week.AddDays(7), i++)
            {
                var w = await ComputeWeek(db, workerId, week);
                carry += w.Earned - w.AdvanceTotal;
            }
            return carry;
        }

        private static List<ProductionSize> ReadSizes(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<ProductionSize>();
            try { return JsonSerializer.Deserialize<List<ProductionSize>>(json) ?? new List<ProductionSize>(); }
            catch (JsonException) { return new List<ProductionSize>(); }
        }
    }
}
