using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>
    /// Month closing. An Admin closes a month once its books are checked; after that nothing dated in it can be
    /// added, changed or removed (enforced on every save in FactoryDbContext) until an Admin reopens it with a reason.
    /// </summary>
    [ApiController]
    [Route("api/periods")]
    [Authorize]
    public class PeriodsController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public PeriodsController(FactoryDbContext db) { _db = db; }

        // Everyone can read the list so forms can warn before saving into a closed month
        [HttpGet]
        public async Task<IActionResult> Closed() =>
            Ok(await _db.ClosedPeriods.AsNoTracking().OrderByDescending(p => p.Month)
                .Select(p => new { month = p.Month.ToString("yyyy-MM"), p.ClosedAt, p.ClosedBy }).ToListAsync());

        // POST api/periods/close { "month": "2026-10" }
        [Authorize(Roles = "Admin")]
        [HttpPost("close")]
        public async Task<IActionResult> Close([FromBody] PeriodInput input)
        {
            if (!TryMonth(input.Month, out var month)) return BadRequest(new { message = "Pick a month." });
            var thisMonth = FactoryDbContext.MonthOf(DateTime.UtcNow);
            if (month >= thisMonth) return BadRequest(new { message = "Only a month that has ended can be closed." });
            if (await _db.ClosedPeriods.AnyAsync(p => p.Month == month)) return BadRequest(new { message = $"{month:MMMM yyyy} is already closed." });

            _db.ClosedPeriods.Add(new ClosedPeriod { Month = month, ClosedBy = User.Identity?.Name ?? "admin" });
            await _db.SaveChangesAsync();
            return Ok(new { message = $"{month:MMMM yyyy} is closed." });
        }

        // POST api/periods/reopen { "month": "2026-10", "reason": "..." }
        [Authorize(Roles = "Admin")]
        [HttpPost("reopen")]
        public async Task<IActionResult> Reopen([FromBody] PeriodInput input)
        {
            if (!TryMonth(input.Month, out var month)) return BadRequest(new { message = "Pick a month." });
            var reason = input.Reason?.Trim();
            if (string.IsNullOrEmpty(reason)) return BadRequest(new { message = "Give a reason for reopening the month." });
            var period = await _db.ClosedPeriods.FindAsync(month);
            if (period == null) return BadRequest(new { message = $"{month:MMMM yyyy} is not closed." });

            _db.ClosedPeriods.Remove(period);
            // The removal itself is audited; this row adds why
            _db.AuditLogs.Add(new AuditLog
            {
                User = User.Identity?.Name ?? "admin",
                Action = "period_reopened",
                Entity = "ClosedPeriod",
                EntityId = month.ToString("yyyy-MM"),
                Changes = JsonSerializer.Serialize(new { month = month.ToString("yyyy-MM"), reason })
            });
            await _db.SaveChangesAsync();
            return Ok(new { message = $"{month:MMMM yyyy} is open again." });
        }

        private static bool TryMonth(string? text, out DateOnly month)
        {
            month = default;
            if (!DateOnly.TryParseExact($"{text?.Trim()}-01", "yyyy-MM-dd", out var day)) return false;
            month = day;
            return true;
        }
    }

    public class PeriodInput
    {
        public string? Month { get; set; }
        public string? Reason { get; set; }
    }
}
