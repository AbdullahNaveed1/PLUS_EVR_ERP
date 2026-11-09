using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>
    /// Profit & loss for a date range (Admin only).
    /// Net sales = bills (after discount) − returns. Cost of goods = pairs sold × the article's recipe
    /// material cost per pair (today's unit costs), less returned pairs. Profit = net sales − cost of
    /// goods − wages paid − expenses. Articles without a recipe are listed because their cost counts as 0.
    /// </summary>
    [ApiController]
    [Route("api/reports")]
    [Authorize(Roles = "Admin")]
    public class ReportsController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public ReportsController(FactoryDbContext db) { _db = db; }

        [HttpGet("profit")]
        public async Task<IActionResult> Profit([FromQuery] DateOnly from, [FromQuery] DateOnly to)
        {
            if (to < from) return BadRequest(new { message = "'To' must be on or after 'From'." });
            var start = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

            var sales = await _db.Sales.AsNoTracking().Where(s => s.Date >= start && s.Date < end).ToListAsync();
            var returns = await _db.SalesReturns.AsNoTracking().Where(r => r.Date >= from && r.Date <= to).ToListAsync();
            var wages = await _db.WagePayments.AsNoTracking().Where(w => w.PaymentDate >= start && w.PaymentDate < end).SumAsync(w => (decimal?)w.Amount) ?? 0;
            var expenses = await _db.Expenses.AsNoTracking().Where(e => e.Date >= start && e.Date < end).ToListAsync();

            // Article of every product, and material cost per pair of every article with a recipe
            var articleOf = await _db.Products.AsNoTracking()
                .ToDictionaryAsync(p => p.Id, p => string.IsNullOrWhiteSpace(p.ArticleNumber) ? p.Model : p.ArticleNumber);
            var unitCost = await _db.RawMaterials.AsNoTracking().ToDictionaryAsync(r => r.Id, r => r.UnitCost);
            var costPerPair = (await _db.BomEntries.AsNoTracking().ToListAsync())
                .GroupBy(b => b.ArticleNumber.Trim().ToLower())
                .ToDictionary(g => g.Key, g => g.Sum(b => b.QtyPerDozen * unitCost.GetValueOrDefault(b.RawMaterialId)) / 12m);

            var missing = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase); // article -> pairs without a recipe
            decimal CostOf(string? productId, decimal pairs)
            {
                var article = int.TryParse(productId, out var id) && articleOf.TryGetValue(id, out var a) ? a : null;
                if (article != null && costPerPair.TryGetValue(article.Trim().ToLower(), out var perPair)) return pairs * perPair;
                var key = article ?? "Unknown article";
                missing[key] = missing.GetValueOrDefault(key) + pairs;
                return 0;
            }

            decimal pairsSold = 0, costSold = 0;
            foreach (var sale in sales)
            {
                foreach (var item in Items(sale.LineItemsJson))
                {
                    var pairs = SalesController.GetDecimal(item, "pairs");
                    pairsSold += pairs;
                    costSold += CostOf(SalesController.ProductIdOf(item), pairs);
                }
            }

            decimal pairsReturned = 0, costReturned = 0;
            foreach (var r in returns)
            {
                foreach (var item in Items(r.ItemsJson))
                {
                    var pairs = SalesController.GetDecimal(item, "pairs");
                    pairsReturned += pairs;
                    // Returned goods without a recipe are already flagged by the sale
                    var productId = SalesController.ProductIdOf(item);
                    var article = int.TryParse(productId, out var id) && articleOf.TryGetValue(id, out var a) ? a : null;
                    if (article != null && costPerPair.TryGetValue(article.Trim().ToLower(), out var perPair)) costReturned += pairs * perPair;
                }
            }

            var grossSales = sales.Sum(s => s.RawTotal > 0 ? s.RawTotal : s.Total);
            var discounts = sales.Sum(s => s.Discount);
            var billed = sales.Sum(s => s.Total);
            var returnsValue = returns.Sum(r => r.Total);
            var netSales = billed - returnsValue;
            var costOfGoods = costSold - costReturned;
            var grossProfit = netSales - costOfGoods;
            var expenseTotal = expenses.Sum(e => e.Amount);
            var netProfit = grossProfit - wages - expenseTotal;

            return Ok(new
            {
                from = from.ToString("yyyy-MM-dd"),
                to = to.ToString("yyyy-MM-dd"),
                bills = sales.Count,
                pairsSold,
                pairsReturned,
                grossSales,
                discounts,
                returns = returnsValue,
                netSales,
                costOfGoods,
                grossProfit,
                wages,
                expenses = expenseTotal,
                expensesByCategory = expenses
                    .GroupBy(e => string.IsNullOrWhiteSpace(e.Category) ? "Other" : e.Category.Trim())
                    .Select(g => new { category = g.Key, amount = g.Sum(e => e.Amount) })
                    .OrderByDescending(x => x.amount),
                netProfit,
                marginPercent = netSales != 0 ? Math.Round(netProfit / netSales * 100, 1) : (decimal?)null,
                withoutRecipe = missing.Select(m => new { article = m.Key, pairs = m.Value }).OrderByDescending(m => m.pairs)
            });
        }

        private static IEnumerable<JsonElement> Items(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return Array.Empty<JsonElement>();
            try
            {
                var root = JsonSerializer.Deserialize<JsonElement>(json);
                return root.ValueKind == JsonValueKind.Array ? root.EnumerateArray().ToList() : Array.Empty<JsonElement>();
            }
            catch (JsonException) { return Array.Empty<JsonElement>(); }
        }
    }
}
