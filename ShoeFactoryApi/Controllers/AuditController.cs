using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>Read-only view of the audit log for Admins. There is no way to edit or delete it.</summary>
    [ApiController]
    [Route("api/audit")]
    [Authorize(Roles = "Admin")]
    public class AuditController : ControllerBase
    {
        private const int MaxPageSize = 200;
        private readonly FactoryDbContext _db;
        public AuditController(FactoryDbContext db) { _db = db; }

        // GET api/audit?from=2026-11-01&to=2026-11-09&user=Ali&entity=Sale&action=delete&page=1&pageSize=50
        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
            [FromQuery] string? user, [FromQuery] string? entity, [FromQuery] string? action,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

            var query = _db.AuditLogs.AsNoTracking();
            // Dates are the factory's day in UTC, inclusive at both ends
            if (from.HasValue) query = query.Where(a => a.At >= from.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            if (to.HasValue) query = query.Where(a => a.At < to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
            if (!string.IsNullOrWhiteSpace(user)) query = query.Where(a => a.User == user);
            if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(a => a.Entity == entity);
            if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(a => a.At).ThenByDescending(a => a.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync();
            return Ok(new { total, page, pageSize, items });
        }

        // Values for the filter dropdowns
        [HttpGet("filters")]
        public async Task<IActionResult> Filters() => Ok(new
        {
            users = await _db.AuditLogs.Select(a => a.User).Distinct().OrderBy(u => u).ToListAsync(),
            entities = await _db.AuditLogs.Select(a => a.Entity).Distinct().OrderBy(e => e).ToListAsync()
        });
    }
}
