using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>Piece-rate rates, the weekly wage sheet (Saturday to Friday) and Saturday settlement.</summary>
    [ApiController]
    [Route("api/wages/weekly")]
    [Authorize]
    public class WeeklyWagesController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public WeeklyWagesController(FactoryDbContext db) { _db = db; }

        [HttpGet("rates")]
        public async Task<IActionResult> Rates() =>
            Ok(await _db.WageRates.AsNoTracking().OrderBy(r => r.WorkerId).ThenBy(r => r.ArticleNumber).ThenBy(r => r.Size).ToListAsync());

        // Replaces all of one worker's rates; an empty list stops piece-rate wages for them
        [HttpPut("rates/{workerId:int}")]
        public async Task<IActionResult> SaveRates(int workerId, [FromBody] List<RateInput> input)
        {
            if (!await _db.Workers.AnyAsync(w => w.Id == workerId)) return NotFound(new { message = "Worker not found." });
            input ??= new List<RateInput>();
            if (input.Any(r => r.RatePerDozen <= 0)) return BadRequest(new { message = "Every rate must be more than 0." });
            static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
            var rows = input.Select(r => new WageRate { WorkerId = workerId, ArticleNumber = Clean(r.ArticleNumber), Size = Clean(r.Size), RatePerDozen = r.RatePerDozen }).ToList();
            if (rows.GroupBy(r => ((r.ArticleNumber ?? "").ToLower(), (r.Size ?? "").ToLower())).Any(g => g.Count() > 1))
                return BadRequest(new { message = "The same article and size is listed twice." });

            _db.WageRates.RemoveRange(await _db.WageRates.Where(r => r.WorkerId == workerId).ToListAsync());
            _db.WageRates.AddRange(rows);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/wages/weekly?weekStart=2026-11-08 (any day; snapped to the Saturday the week starts on)
        [HttpGet]
        public async Task<IActionResult> Week([FromQuery] DateOnly? weekStart)
        {
            var start = WeeklyWages.WeekStartOf(weekStart ?? DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5)));
            var workerIds = await _db.WageRates.Select(r => r.WorkerId).Distinct().ToListAsync();
            var workers = await _db.Workers.AsNoTracking().Where(w => workerIds.Contains(w.Id)).OrderBy(w => w.Name).ToListAsync();

            var result = new List<object>();
            foreach (var worker in workers)
            {
                var week = await WeeklyWages.ComputeWeek(_db, worker.Id, start);
                var settlement = await _db.WeeklySettlements.AsNoTracking().FirstOrDefaultAsync(s => s.WorkerId == worker.Id && s.WeekStart == start);
                var carryIn = settlement?.CarryIn ?? await WeeklyWages.CarryIn(_db, worker.Id, start);
                // A settled week always shows the figures it was paid on, even if rates or production changed later
                var warnings = week.Warnings.ToList();
                if (settlement != null && (settlement.Earned != week.Earned || settlement.Advances != week.AdvanceTotal))
                    warnings.Insert(0, $"Production, advances or rates changed after this week was settled (now works out to Rs {week.Earned - week.AdvanceTotal + carryIn:0.##}). Totals below are as settled; undo and settle again to use the new figures.");
                result.Add(new
                {
                    worker = new { worker.Id, worker.Name, worker.Role },
                    week.Lines,
                    week.Dozens,
                    earned = settlement?.Earned ?? week.Earned,
                    week.Advances,
                    advanceTotal = settlement?.Advances ?? week.AdvanceTotal,
                    carryIn,
                    final = settlement?.Final ?? week.Earned - week.AdvanceTotal + carryIn,
                    warnings,
                    settlement
                });
            }

            return Ok(new
            {
                weekStart = start.ToString("yyyy-MM-dd"),
                weekEnd = start.AddDays(6).ToString("yyyy-MM-dd"),
                payday = start.AddDays(7).ToString("yyyy-MM-dd"),
                startDate = WeeklyWages.StartDate.ToString("yyyy-MM-dd"),
                workers = result
            });
        }

        // Pays the week (by default the full final amount) and closes it. What isn't paid carries to next week.
        [HttpPost("settle")]
        public async Task<IActionResult> Settle([FromBody] SettleInput input)
        {
            var worker = await _db.Workers.FindAsync(input.WorkerId);
            if (worker == null) return NotFound(new { message = "Worker not found." });
            var start = WeeklyWages.WeekStartOf(input.WeekStart);
            if (await _db.WeeklySettlements.AnyAsync(s => s.WorkerId == worker.Id && s.WeekStart == start))
                return BadRequest(new { message = $"{worker.Name}'s week is already settled." });
            if (await _db.WeeklySettlements.AnyAsync(s => s.WorkerId == worker.Id && s.WeekStart > start))
                return BadRequest(new { message = "A later week is already settled. Undo that first." });

            var week = await WeeklyWages.ComputeWeek(_db, worker.Id, start);
            var carryIn = await WeeklyWages.CarryIn(_db, worker.Id, start);
            var final = week.Earned - week.AdvanceTotal + carryIn;
            var paid = input.Amount ?? Math.Max(0, final);
            if (paid < 0) return BadRequest(new { message = "Amount paid can't be negative." });

            await using var tx = await _db.Database.BeginTransactionAsync();
            WagePayment? payment = null;
            if (paid > 0)
            {
                payment = new WagePayment
                {
                    WorkerId = worker.Id,
                    Amount = paid,
                    // Paid on the Saturday after the week (or today if settling late)
                    PaymentDate = DateTime.SpecifyKind(start.AddDays(7).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc),
                    Kind = WagePaymentKinds.Settlement,
                    Notes = $"Weekly settlement {start:dd-MM-yyyy} to {start.AddDays(6):dd-MM-yyyy}"
                };
                _db.WagePayments.Add(payment);
                await _db.SaveChangesAsync();
            }

            var settlement = new WeeklySettlement
            {
                WorkerId = worker.Id,
                WeekStart = start,
                Earned = week.Earned,
                Advances = week.AdvanceTotal,
                CarryIn = carryIn,
                Final = final,
                Paid = paid,
                CarryOut = final - paid,
                WagePaymentId = payment?.Id
            };
            _db.WeeklySettlements.Add(settlement);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
            return Ok(settlement);
        }

        // Admin only: reopens a settled week (its payment is removed); only the latest week can be undone
        [Authorize(Roles = "Admin")]
        [HttpDelete("settle/{id:int}")]
        public async Task<IActionResult> Undo(int id)
        {
            var settlement = await _db.WeeklySettlements.FindAsync(id);
            if (settlement == null) return NotFound();
            if (await _db.WeeklySettlements.AnyAsync(s => s.WorkerId == settlement.WorkerId && s.WeekStart > settlement.WeekStart))
                return BadRequest(new { message = "Undo the later week first." });

            if (settlement.WagePaymentId.HasValue && await _db.WagePayments.FindAsync(settlement.WagePaymentId.Value) is { } payment)
                _db.WagePayments.Remove(payment);
            _db.WeeklySettlements.Remove(settlement);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }

    public class RateInput
    {
        public string? ArticleNumber { get; set; }
        public string? Size { get; set; }
        public decimal RatePerDozen { get; set; }
    }

    public class SettleInput
    {
        public int WorkerId { get; set; }
        public DateOnly WeekStart { get; set; }
        public decimal? Amount { get; set; }
    }
}
