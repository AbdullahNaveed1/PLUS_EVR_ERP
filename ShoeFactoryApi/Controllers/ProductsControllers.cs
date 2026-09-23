using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Authorize]
    [Route("api/products")]
    [ApiController]
    public class ProductsController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        public ProductsController(FactoryDbContext context) => _context = context;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
        {
            var products = await _context.Products.ToListAsync();
            foreach (var product in products)
                if (string.IsNullOrWhiteSpace(product.ArticleNumber))
                    product.ArticleNumber = product.Model;
            return products;
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Product>> GetProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            return product == null ? NotFound() : product;
        }

        [HttpGet("{id}/price-history")]
        public async Task<ActionResult<IEnumerable<ProductPriceHistory>>> GetPriceHistory(int id)
        {
            if (!await _context.Products.AnyAsync(p => p.Id == id)) return NotFound();
            return await _context.ProductPriceHistories
                .Where(h => h.ProductId == id)
                .OrderByDescending(h => h.EffectiveFrom)
                .ToListAsync();
        }

        [HttpPost]
        public async Task<ActionResult<Product>> PostProduct(Product product)
        {
            product.ArticleNumber = string.IsNullOrWhiteSpace(product.ArticleNumber) ? product.Model : product.ArticleNumber;

            var article = await _context.Articles.FirstOrDefaultAsync(a => a.ArticleNumber == product.ArticleNumber);
            if (article == null)
            {
                article = new Article { ArticleNumber = product.ArticleNumber };
                _context.Articles.Add(article);
            }
            product.Article = article;
            _context.Products.Add(product);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
        }

        // FIX #23 — targeted field update. Preserves ArticleId, only replaces provided columns.
        [HttpPut("{id}")]
        public async Task<IActionResult> PutProduct(int id, Product product)
        {
            if (id != product.Id) return BadRequest();

            var existing = await _context.Products.FirstOrDefaultAsync(p => p.Id == id);
            if (existing == null) return NotFound();

            // Never let the client null out the parent article linkage
            existing.ArticleNumber = string.IsNullOrWhiteSpace(product.ArticleNumber)
                ? (string.IsNullOrWhiteSpace(existing.ArticleNumber) ? existing.Model : existing.ArticleNumber)
                : product.ArticleNumber;
            existing.Model = product.Model;
            existing.Size = product.Size;
            existing.Color = product.Color;
            existing.Qty = product.Qty;               // live stock, no clamp here — deduction path enforces
            existing.PricePunjab = product.PricePunjab;
            existing.PriceSindh = product.PriceSindh;
            // existing.ArticleId deliberately NOT touched

            if (existing.PricePunjab != product.PricePunjab || existing.PriceSindh != product.PriceSindh)
            {
                _context.ProductPriceHistories.Add(new ProductPriceHistory
                {
                    ProductId = id,
                    PricePunjab = product.PricePunjab,
                    PriceSindh = product.PriceSindh,
                    Reason = "Product price updated"
                });
            }

            try { await _context.SaveChangesAsync(); }
            catch (DbUpdateConcurrencyException)
            {
                if (!await _context.Products.AnyAsync(e => e.Id == id)) return NotFound();
                throw;
            }
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null) return NotFound();

            // Also remove price history rows explicitly (belt-and-braces with cascade config)
            var histories = await _context.ProductPriceHistories.Where(h => h.ProductId == id).ToListAsync();
            if (histories.Count > 0) _context.ProductPriceHistories.RemoveRange(histories);

            _context.Products.Remove(product);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}