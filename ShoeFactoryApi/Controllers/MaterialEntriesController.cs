using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [ApiController]
    [Route("api/material-entries")]
    [Authorize]
    public class MaterialEntriesController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public MaterialEntriesController(FactoryDbContext db) { _db = db; }

        // GET api/material-entries?includeVoided=true
        [HttpGet]
        public async Task<ActionResult<IEnumerable<MaterialEntry>>> GetAll([FromQuery] bool includeVoided = false)
        {
            var query = _db.MaterialEntries.AsNoTracking();
            if (!includeVoided) query = query.Where(e => !e.Voided);

            return await query
                .OrderByDescending(e => e.Date)
                .ThenByDescending(e => e.CreatedAt)
                .ToListAsync();
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<MaterialEntry>> GetById(Guid id)
        {
            var entry = await _db.MaterialEntries.FindAsync(id);
            return entry == null ? NotFound() : entry;
        }

        [HttpPost]
        public async Task<ActionResult<MaterialEntry>> Create([FromBody] MaterialEntryInput input)
        {
            var entry = new MaterialEntry { Id = Guid.NewGuid(), CreatedAt = DateTime.UtcNow };
            if (!Apply(entry, input, out var error)) return BadRequest(new { message = error });

            _db.MaterialEntries.Add(entry);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = entry.Id }, entry);
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult<MaterialEntry>> Update(Guid id, [FromBody] MaterialEntryInput input)
        {
            var entry = await _db.MaterialEntries.FindAsync(id);
            if (entry == null) return NotFound();
            if (!Apply(entry, input, out var error)) return BadRequest(new { message = error });

            await _db.SaveChangesAsync();
            return Ok(entry);
        }

        // Soft delete — keeps the row so it can be restored
        [HttpPost("{id:guid}/void")]
        public Task<ActionResult<MaterialEntry>> Void(Guid id) => SetVoided(id, true);

        [HttpPost("{id:guid}/restore")]
        public Task<ActionResult<MaterialEntry>> Restore(Guid id) => SetVoided(id, false);

        private async Task<ActionResult<MaterialEntry>> SetVoided(Guid id, bool voided)
        {
            var entry = await _db.MaterialEntries.FindAsync(id);
            if (entry == null) return NotFound();

            entry.Voided = voided;
            entry.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return Ok(entry);
        }

        /// <summary>
        /// Validates and copies input onto the entry. Only date, material and quantity are required;
        /// every optional field is trimmed and stored as null when blank.
        /// </summary>
        private static bool Apply(MaterialEntry entry, MaterialEntryInput input, out string error)
        {
            error = string.Empty;

            if (input.Date == null) { error = "Date is required."; return false; }
            var material = input.Material?.Trim();
            if (string.IsNullOrEmpty(material)) { error = "Material is required."; return false; }
            if (input.Quantity == null || input.Quantity <= 0) { error = "Quantity must be greater than 0."; return false; }
            var unit = input.Unit?.Trim();
            if (string.IsNullOrEmpty(unit)) { error = "Unit is required."; return false; }
            if (input.Rate < 0 || input.Amount < 0) { error = "Rate and amount cannot be negative."; return false; }

            entry.Date = input.Date.Value;
            entry.Material = material;
            entry.Quantity = input.Quantity.Value;
            entry.Unit = unit;
            entry.ArticleNo = Clean(input.ArticleNo);
            entry.Size = Clean(input.Size);
            entry.Supplier = Clean(input.Supplier);
            entry.BillNo = Clean(input.BillNo);
            entry.Remarks = Clean(input.Remarks);
            entry.EnteredBy = Clean(input.EnteredBy);
            entry.Rate = input.Rate;
            // Amount is qty × rate whenever a rate is given; otherwise keep any amount typed directly
            entry.Amount = input.Rate.HasValue
                ? decimal.Round(input.Quantity.Value * input.Rate.Value, 2, MidpointRounding.AwayFromZero)
                : input.Amount;
            entry.UpdatedAt = DateTime.UtcNow;
            return true;
        }

        private static string? Clean(string? value)
            => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    public class MaterialEntryInput
    {
        public DateOnly? Date { get; set; }
        public string? Material { get; set; }
        public decimal? Quantity { get; set; }
        public string? Unit { get; set; }
        public string? ArticleNo { get; set; }
        public string? Size { get; set; }
        public string? Supplier { get; set; }
        public string? BillNo { get; set; }
        public decimal? Rate { get; set; }
        public decimal? Amount { get; set; }
        public string? Remarks { get; set; }
        public string? EnteredBy { get; set; }
    }
}
