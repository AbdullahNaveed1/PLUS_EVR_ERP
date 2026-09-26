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