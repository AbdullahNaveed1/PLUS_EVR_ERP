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
    [Route("api/bom")]
    [Authorize]
    public class BomController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public BomController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<BomEntry>>> GetAll()
        {
            return await _db.BomEntries
                .OrderByDescending(b => b.Id)
                .ToListAsync();
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<BomEntry>> GetById(int id)
        {
            var item = await _db.BomEntries.FindAsync(id);
            if (item == null) return NotFound();
            return item;
        }

        [HttpPost]
        public async Task<ActionResult<BomEntry>> Create([FromBody] BomEntry input)
        {
            // Validate the referenced material exists
            var materialExists = await _db.RawMaterials.AnyAsync(m => m.Id == input.RawMaterialId);
            if (!materialExists) return BadRequest("Raw material not found.");

            input.Id = 0;
            _db.BomEntries.Add(input);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = input.Id }, input);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] BomEntry input)
        {
            var existing = await _db.BomEntries.FindAsync(id);
            if (existing == null) return NotFound();

            var materialExists = await _db.RawMaterials.AnyAsync(m => m.Id == input.RawMaterialId);
            if (!materialExists) return BadRequest("Raw material not found.");

            existing.ArticleNumber = input.ArticleNumber;
            existing.RawMaterialId = input.RawMaterialId;
            existing.QtyPerDozen = input.QtyPerDozen;

            await _db.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var existing = await _db.BomEntries.FindAsync(id);
            if (existing == null) return NotFound();

            _db.BomEntries.Remove(existing);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}