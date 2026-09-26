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
    [Route("api/rawmaterials")]
    [Authorize]
    public class RawMaterialsController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public RawMaterialsController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<RawMaterial>>> GetAll()
        {
            return await _db.RawMaterials
                .OrderByDescending(m => m.Id)
                .ToListAsync();
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<RawMaterial>> GetById(int id)
        {
            var item = await _db.RawMaterials.FindAsync(id);
            if (item == null) return NotFound();
            return item;
        }

        [HttpPost]
        public async Task<ActionResult<RawMaterial>> Create([FromBody] RawMaterial input)
        {
            input.Id = 0;
            input.DateAdded = DateTime.UtcNow;
            _db.RawMaterials.Add(input);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = input.Id }, input);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] RawMaterial input)
        {
            var existing = await _db.RawMaterials.FindAsync(id);
            if (existing == null) return NotFound();

            existing.Name = input.Name;
            existing.Unit = input.Unit;
            existing.UnitCost = input.UnitCost;
            existing.StockQty = input.StockQty;
            existing.Notes = input.Notes;

            await _db.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var existing = await _db.RawMaterials.FindAsync(id);
            if (existing == null) return NotFound();

            _db.RawMaterials.Remove(existing);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}