using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>
    /// Returns against a bill. Each returned line is priced at the bill's rate less its discount per pair,
    /// the pairs go back into stock, and the total comes off the customer's balance (the app's ledger
    /// subtracts returns). A line can never be returned more times than it was billed.
    /// </summary>
    [ApiController]
    [Route("api/sales-returns")]
    [Authorize]
    public class SalesReturnsController : ControllerBase
    {
        private static readonly JsonSerializerOptions Camel = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        private readonly FactoryDbContext _db;
        public SalesReturnsController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? saleId)
        {
            var query = _db.SalesReturns.AsNoTracking();
            if (saleId.HasValue) query = query.Where(r => r.SaleId == saleId.Value);
            var rows = await query.OrderByDescending(r => r.Date).ThenByDescending(r => r.Id).ToListAsync();
            return Ok(rows.Select(ToResponse));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] SalesReturnInput input)
        {
            var sale = await _db.Sales.FindAsync(input.SaleId);
            if (sale == null) return BadRequest(new { message = "Bill not found." });
            if (input.Date == null) return BadRequest(new { message = "Pick the return date." });
            var wanted = (input.Items ?? new List<ReturnItemInput>()).Where(i => i.Pairs > 0).ToList();
            if (wanted.Count == 0) return BadRequest(new { message = "Enter how many pairs came back for at least one item." });
            if (wanted.Any(i => i.Pairs != Math.Floor(i.Pairs))) return BadRequest(new { message = "Returned pairs must be whole numbers." });

            var billLines = BillLines(sale.LineItemsJson);
            var alreadyReturned = await ReturnedPairsByLine(sale.Id);
            var items = new List<ReturnLine>();
            foreach (var want in wanted.GroupBy(i => i.LineIndex))
            {
                if (want.Key < 0 || want.Key >= billLines.Count) return BadRequest(new { message = "That item is not on this bill." });
                var line = billLines[want.Key];
                var pairs = want.Sum(i => i.Pairs);
                var left = line.Pairs - alreadyReturned.GetValueOrDefault(want.Key);
                if (pairs > left)
                    return BadRequest(new { message = $"{line.Model} (size {line.Size}): only {left:0.##} pairs can still be returned." });

                var rate = Math.Max(0, line.Price - line.DiscountPerPair);
                items.Add(line with { LineIndex = want.Key, Pairs = pairs, Amount = decimal.Round(pairs * rate, 2, MidpointRounding.AwayFromZero) });
            }

            var salesReturn = new SalesReturn
            {
                SaleId = sale.Id,
                CustomerId = sale.CustomerId,
                Customer = sale.Customer,
                Date = input.Date.Value,
                ItemsJson = JsonSerializer.Serialize(items, Camel),
                Total = items.Sum(i => i.Amount),
                Reason = string.IsNullOrWhiteSpace(input.Reason) ? null : input.Reason.Trim()
            };
            await MoveStock(items, back: true);
            _db.SalesReturns.Add(salesReturn);
            await _db.SaveChangesAsync();
            return Ok(ToResponse(salesReturn));
        }

        // Admin only: undoes a mistaken return; the pairs leave stock again
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var salesReturn = await _db.SalesReturns.FindAsync(id);
            if (salesReturn == null) return NotFound();
            await MoveStock(ReadItems(salesReturn.ItemsJson), back: false);
            _db.SalesReturns.Remove(salesReturn);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private async Task MoveStock(IEnumerable<ReturnLine> items, bool back)
        {
            foreach (var item in items)
            {
                if (!int.TryParse(item.ProductId, out var productId)) continue;
                var product = await _db.Products.FindAsync(productId);
                if (product == null) continue;
                var pairs = (int)decimal.Round(item.Pairs, MidpointRounding.AwayFromZero);
                product.Qty += back ? pairs : -pairs;
            }
        }

        private async Task<Dictionary<int, decimal>> ReturnedPairsByLine(int saleId)
        {
            var returns = await _db.SalesReturns.AsNoTracking().Where(r => r.SaleId == saleId).ToListAsync();
            return returns.SelectMany(r => ReadItems(r.ItemsJson))
                .GroupBy(i => i.LineIndex)
                .ToDictionary(g => g.Key, g => g.Sum(i => i.Pairs));
        }

        // Bill lines as saved by SalesController (productId, model, size, pairs, price, discountPerPair)
        private static List<ReturnLine> BillLines(string json)
        {
            try
            {
                var items = JsonSerializer.Deserialize<JsonElement>(json);
                if (items.ValueKind != JsonValueKind.Array) return new List<ReturnLine>();
                return items.EnumerateArray().Select((item, index) => new ReturnLine(
                    index,
                    Text(item, "productId") ?? "N/A",
                    Text(item, "model") ?? "Article",
                    Text(item, "size") ?? "N/A",
                    Number(item, "pairs"),
                    Number(item, "price"),
                    Number(item, "discountPerPair"),
                    0)).ToList();
            }
            catch (JsonException) { return new List<ReturnLine>(); }
        }

        private static List<ReturnLine> ReadItems(string json)
        {
            try { return JsonSerializer.Deserialize<List<ReturnLine>>(json, Camel) ?? new List<ReturnLine>(); }
            catch (JsonException) { return new List<ReturnLine>(); }
        }

        private static string? Text(JsonElement el, string name) =>
            el.TryGetProperty(name, out var v) ? v.ValueKind switch
            {
                JsonValueKind.String => v.GetString(),
                JsonValueKind.Number => v.GetRawText(),
                _ => null
            } : null;

        private static decimal Number(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var v)) return 0;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
            return v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var s) ? s : 0;
        }

        private static object ToResponse(SalesReturn r) => new
        {
            r.Id, r.SaleId, r.CustomerId, r.Customer,
            date = r.Date.ToString("yyyy-MM-dd"),
            items = ReadItems(r.ItemsJson),
            r.Total, r.Reason, r.CreatedAt
        };

        public sealed record ReturnLine(int LineIndex, string ProductId, string Model, string Size, decimal Pairs, decimal Price, decimal DiscountPerPair, decimal Amount);
    }

    public class SalesReturnInput
    {
        public int SaleId { get; set; }
        public DateOnly? Date { get; set; }
        public string? Reason { get; set; }
        public List<ReturnItemInput>? Items { get; set; }
    }

    public class ReturnItemInput
    {
        public int LineIndex { get; set; }
        public decimal Pairs { get; set; }
    }
}
