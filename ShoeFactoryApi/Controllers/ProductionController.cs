using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [ApiController]
    [Route("api/production")]
    [Authorize]
    public class ProductionController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public ProductionController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<ProductionRecord>>> GetAll()
        {
            return await _db.ProductionRecords
                .OrderByDescending(p => p.Date)
                .ThenByDescending(p => p.Id)
                .ToListAsync();
        }

        // GET api/production/wages?startDate=2026-01-01&endDate=2026-01-07
        // Returns computed wages for machine man and safai/packing based on total dozens produced.
        [HttpGet("wages")]
        public async Task<ActionResult> GetWages([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            // Normalize to UTC dates. If not provided, default to last 7 days.
            var start = startDate?.Date ?? DateTime.UtcNow.Date.AddDays(-7);
            var end = (endDate?.Date ?? DateTime.UtcNow.Date);
            if (end < start) return BadRequest("endDate must be >= startDate");

            var records = await _db.ProductionRecords
                .Where(p => p.Date >= start && p.Date <= end)
                .ToListAsync();

            // Convert pairs -> dozens (12 pairs = 1 dozen), and add explicit dozens field.
            var totalDozens = records.Sum(r => r.Dozens + (r.Pairs / 12m));

            var perArticle = records
                .GroupBy(r => r.ArticleNumber)
                .Select(g => new { Article = g.Key, Dozens = g.Sum(r => r.Dozens + (r.Pairs / 12m)) })
                .OrderByDescending(x => x.Dozens)
                .ToList();

            const decimal MachineRate = 38m; // per dozen for machine man (Cheema)
            const decimal SafaiRate = 50m;   // per dozen for safai & packing

            var machine = decimal.Round(totalDozens * MachineRate, 2);
            var safai = decimal.Round(totalDozens * SafaiRate, 2);
            var totalLabor = machine + safai;

            return Ok(new {
                Start = start,
                End = end,
                TotalDozens = decimal.Round(totalDozens, 4),
                Machine = machine,
                Safai = safai,
                TotalLabor = totalLabor,
                PerArticle = perArticle
            });
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<ProductionRecord>> GetById(int id)
        {
            var item = await _db.ProductionRecords.FindAsync(id);
            if (item == null) return NotFound();
            return item;
        }

        [HttpPost]
        public async Task<ActionResult<ProductionRecord>> Create([FromBody] ProductionRecord input)
        {
            input.Id = 0;
            input.CreatedAt = DateTime.UtcNow;
            if (input.Date == default) input.Date = DateTime.UtcNow.Date;

            // Normalize: store date at midnight UTC to avoid duplicate-day issues
            input.Date = DateTime.SpecifyKind(input.Date.Date, DateTimeKind.Utc);

            _db.ProductionRecords.Add(input);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = input.Id }, input);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] ProductionRecord input)
        {
            var existing = await _db.ProductionRecords.FindAsync(id);
            if (existing == null) return NotFound();

            existing.Date = DateTime.SpecifyKind(input.Date.Date, DateTimeKind.Utc);
            existing.ArticleNumber = input.ArticleNumber;
            existing.Dozens = input.Dozens;
            existing.Pairs = input.Pairs;
            existing.Notes = input.Notes;

            await _db.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var existing = await _db.ProductionRecords.FindAsync(id);
            if (existing == null) return NotFound();

            _db.ProductionRecords.Remove(existing);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}