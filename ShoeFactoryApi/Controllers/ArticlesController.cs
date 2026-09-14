using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Authorize]
    [Route("api/articles")]
    [ApiController]
    public class ArticlesController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public ArticlesController(FactoryDbContext context) => _context = context;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Article>>> GetArticles()
        {
            var ungroupedProducts = await _context.Products
                .Where(product => product.ArticleId == null)
                .ToListAsync();

            foreach (var group in ungroupedProducts.GroupBy(product => string.IsNullOrWhiteSpace(product.ArticleNumber) ? product.Model : product.ArticleNumber))
            {
                var article = await _context.Articles.FirstOrDefaultAsync(item => item.ArticleNumber == group.Key);
                if (article == null)
                {
                    article = new Article { ArticleNumber = group.Key };
                    _context.Articles.Add(article);
                }

                foreach (var product in group)
                    product.Article = article;
            }

            if (ungroupedProducts.Count > 0)
                await _context.SaveChangesAsync();

            return await _context.Articles.Include(article => article.Variants).OrderBy(article => article.ArticleNumber).ToListAsync();
        }

        [HttpPost]
        public async Task<ActionResult<Article>> PostArticle(Article article)
        {
            if (string.IsNullOrWhiteSpace(article.ArticleNumber)) return BadRequest("Article number is required.");
            if (await _context.Articles.AnyAsync(item => item.ArticleNumber == article.ArticleNumber)) return Conflict("Article number already exists.");
            article.Id = 0;
            _context.Articles.Add(article);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetArticles), new { id = article.Id }, article);
        }
    }
}