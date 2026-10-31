using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [ApiController]
    [Route("api/material-counts")]
    [Authorize]
    public class MaterialCountsController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public MaterialCountsController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<MaterialCount>>> GetAll()
        {
            return await _db.MaterialCounts
                .AsNoTracking()
                .OrderBy(c => c.Date)
                .ThenBy(c => c.Material)
                .ToListAsync();
        }

        // PUT api/material-counts/2026-10-31
        // Saves the day's counts in one go. A material with a blank remainingQty has its count for that day removed.
        [HttpPut("{date}")]
        public async Task<ActionResult<IEnumerable<MaterialCount>>> SaveDay(DateOnly date, [FromBody] List<MaterialCountInput> items)
        {
            if (items == null) return BadRequest(new { message = "No counts sent." });

            var existing = await _db.MaterialCounts.Where(c => c.Date == date).ToListAsync();
            var countedBy = User.Identity?.Name;

            foreach (var item in items)
            {
                var material = item.Material?.Trim();
                if (string.IsNullOrEmpty(material)) return BadRequest(new { message = "Material is required." });
                if (item.RemainingQty < 0) return BadRequest(new { message = $"{material}: remaining quantity cannot be negative." });

                var row = existing.FirstOrDefault(c => string.Equals(c.Material, material, StringComparison.OrdinalIgnoreCase));
                if (item.RemainingQty == null)
                {
                    if (row != null) _db.MaterialCounts.Remove(row);
                    continue;
                }

                var unit = item.Unit?.Trim();
                if (string.IsNullOrEmpty(unit)) return BadRequest(new { message = $"{material}: unit is required." });

                if (row == null)
                {
                    row = new MaterialCount { Id = Guid.NewGuid(), Date = date, Material = material, CreatedAt = DateTime.UtcNow };
                    _db.MaterialCounts.Add(row);
                }
                row.RemainingQty = item.RemainingQty.Value;
                row.Unit = unit;
                row.CountedBy = countedBy;
                row.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return await _db.MaterialCounts.AsNoTracking().Where(c => c.Date == date).OrderBy(c => c.Material).ToListAsync();
        }
    }

    public class MaterialCountInput
    {
        public string? Material { get; set; }
        public decimal? RemainingQty { get; set; }
        public string? Unit { get; set; }
    }
}
