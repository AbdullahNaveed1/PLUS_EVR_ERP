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

        public ProductsController(FactoryDbContext context)
        {
            _context = context;
        }

        // GET: api/products
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
        {
            var products = await _context.Products.ToListAsync();
            foreach (var product in products)
            {
                if (string.IsNullOrWhiteSpace(product.ArticleNumber))
                    product.ArticleNumber = product.Model;
            }
            return products;
        }

        // GET: api/products/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Product>> GetProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }
            return product;
        }

        [HttpGet("{id}/price-history")]
        public async Task<ActionResult<IEnumerable<ProductPriceHistory>>> GetPriceHistory(int id)
        {
            if (!await _context.Products.AnyAsync(product => product.Id == id)) return NotFound();
            return await _context.ProductPriceHistories
                .Where(history => history.ProductId == id)
                .OrderByDescending(history => history.EffectiveFrom)
                .ToListAsync();
        }

        // POST: api/products
        [HttpPost]
        public async Task<ActionResult<Product>> PostProduct(Product product)
        {
            product.ArticleNumber = string.IsNullOrWhiteSpace(product.ArticleNumber) ? product.Model : product.ArticleNumber;
            var article = await _context.Articles.FirstOrDefaultAsync(item => item.ArticleNumber == product.ArticleNumber);
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

        // PUT: api/products/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutProduct(int id, Product product)
        {
            if (id != product.Id)
            {
                return BadRequest();
            }

            var existing = await _context.Products.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
            if (existing == null) return NotFound();

            product.ArticleNumber = string.IsNullOrWhiteSpace(product.ArticleNumber) ? (existing.ArticleNumber.Length > 0 ? existing.ArticleNumber : product.Model) : product.ArticleNumber;
            _context.Entry(product).State = EntityState.Modified;

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

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!_context.Products.Any(e => e.Id == id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // DELETE: api/products/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            _context.Products.Remove(product);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}