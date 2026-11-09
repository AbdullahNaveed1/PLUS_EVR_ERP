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

        // GET api/bom/recipes: every article's recipe, grouped
        [HttpGet("recipes")]
        public async Task<IActionResult> Recipes()
        {
            var lines = await _db.BomEntries.AsNoTracking().OrderBy(b => b.ArticleNumber).ThenBy(b => b.Id).ToListAsync();
            return Ok(lines
                .GroupBy(b => b.ArticleNumber.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g => new { articleNumber = g.Key, lines = g.Select(b => new { b.RawMaterialId, b.QtyPerDozen }) }));
        }

        // PUT api/bom/recipes/{article}: replaces that article's whole recipe; an empty list removes it.
        // Only production saved from now on uses the new recipe.
        [HttpPut("recipes/{article}")]
        public async Task<IActionResult> SaveRecipe(string article, [FromBody] List<RecipeLineInput> lines)
        {
            article = article.Trim();
            if (article.Length == 0) return BadRequest(new { message = "Article number is required." });
            lines ??= new List<RecipeLineInput>();
            if (lines.Any(l => l.QtyPerDozen <= 0)) return BadRequest(new { message = "Every amount per dozen must be more than 0." });
            if (lines.GroupBy(l => l.RawMaterialId).Any(g => g.Count() > 1)) return BadRequest(new { message = "A material is listed twice." });
            var ids = lines.Select(l => l.RawMaterialId).ToList();
            if (await _db.RawMaterials.CountAsync(r => ids.Contains(r.Id)) != ids.Count)
                return BadRequest(new { message = "Pick every material from the Raw Materials list." });

            var key = article.ToLower();
            var existing = await _db.BomEntries.Where(b => b.ArticleNumber.Trim().ToLower() == key).ToListAsync();
            _db.BomEntries.RemoveRange(existing);
            _db.BomEntries.AddRange(lines.Select(l => new BomEntry { ArticleNumber = article, RawMaterialId = l.RawMaterialId, QtyPerDozen = l.QtyPerDozen }));
            await _db.SaveChangesAsync();
            return NoContent();
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

    public class RecipeLineInput
    {
        public int RawMaterialId { get; set; }
        public decimal QtyPerDozen { get; set; }
    }
}