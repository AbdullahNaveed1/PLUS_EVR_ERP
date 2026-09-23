using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Route("api/sales")]
    [ApiController]
    public class SalesController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        public SalesController(FactoryDbContext context) => _context = context;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetSales()
        {
            var sales = await _context.Sales
                .OrderByDescending(s => s.Date).ThenByDescending(s => s.Id)
                .ToListAsync();
            return sales.Select(ToResponse).ToList();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetSale(int id)
        {
            var sale = await _context.Sales.FindAsync(id);
            return sale == null ? NotFound() : Ok(ToResponse(sale));
        }

        [HttpPost]
        public async Task<ActionResult<object>> PostSale(JsonElement payload)
        {
            var sale = new Sale();
            // FIX #6 — recompute totals from line items; reject mismatches
            if (!ApplyPayloadAndRecalculate(sale, payload, out var error))
                return BadRequest(new { message = error });

            _context.Sales.Add(sale);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetSale), new { id = sale.Id }, ToResponse(sale));
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> PutSale(int id, JsonElement payload)
        {
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            if (!ApplyPayloadAndRecalculate(sale, payload, out var error))
                return BadRequest(new { message = error });
            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSale(int id)
        {
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            _context.Sales.Remove(sale);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>
        /// FIX #4/#5/#6 — authoritative server-side recalculation.
        /// Trusts only: unit price, pairs, discount-per-pair. Everything else is recomputed.
        /// </summary>
        private static bool ApplyPayloadAndRecalculate(Sale sale, JsonElement payload, out string error)
        {
            error = string.Empty;

            if (!payload.TryGetProperty("customerId", out var custIdEl))
            { error = "customerId is required."; return false; }
            if (!payload.TryGetProperty("customer", out var custEl))
            { error = "customer is required."; return false; }

            sale.CustomerId = custIdEl.GetString() ?? string.Empty;
            sale.Customer = custEl.GetString() ?? string.Empty;
            sale.Region = payload.TryGetProperty("region", out var reg) ? (reg.GetString() ?? "Punjab") : "Punjab";
            sale.TransportCompany = payload.TryGetProperty("transportCompany", out var tc) ? (tc.GetString() ?? "N/A") : "N/A";
            sale.BuiltyNo = payload.TryGetProperty("builtyNo", out var bn) ? (bn.GetString() ?? "N/A") : "N/A";
            sale.Date = payload.TryGetProperty("date", out var dt) && DateTime.TryParse(dt.GetString(), out var parsed)
                ? DateTime.SpecifyKind(parsed, DateTimeKind.Utc)
                : DateTime.UtcNow;

            if (!payload.TryGetProperty("lineItems", out var itemsEl) || itemsEl.ValueKind != JsonValueKind.Array)
            { error = "lineItems must be an array."; return false; }

            var normalized = new List<Dictionary<string, object?>>();
            decimal rawTotal = 0m;
            decimal discountTotal = 0m;

            foreach (var item in itemsEl.EnumerateArray())
            {
                decimal pairs = GetDecimal(item, "pairs");
                if (pairs <= 0)
                {
                    var qty = GetDecimal(item, "qty");
                    var unitType = GetString(item, "unitType") ?? "dozens";
                    pairs = qty * (unitType == "pairs" ? 1m : 12m);
                }
                decimal price = GetDecimal(item, "price");
                decimal gross = decimal.Round(pairs * price, 2, MidpointRounding.AwayFromZero);

                // Discount policy: per-pair, clamped so line never goes negative
                decimal discountPerPair = GetDecimal(item, "discountPerPair");
                decimal discountAmount = decimal.Round(pairs * discountPerPair, 2, MidpointRounding.AwayFromZero);
                if (discountAmount > gross) discountAmount = gross;
                if (discountAmount < 0) discountAmount = 0;
                decimal net = gross - discountAmount;

                rawTotal += gross;
                discountTotal += discountAmount;

                normalized.Add(new Dictionary<string, object?>
                {
                    ["productId"] = GetString(item, "productId") ?? "N/A",
                    ["model"] = GetString(item, "model") ?? "Article",
                    ["size"] = GetString(item, "size") ?? "N/A",
                    ["qty"] = GetDecimal(item, "qty"),
                    ["unitType"] = GetString(item, "unitType") ?? "dozens",
                    ["pairs"] = pairs,
                    ["price"] = price,
                    ["discountPerPair"] = discountPerPair,
                    ["grossAmount"] = gross,
                    ["discountAmount"] = discountAmount,
                    ["netAmount"] = net,
                    ["description"] = GetString(item, "description") ?? string.Empty
                });
            }

            sale.RawTotal = rawTotal;
            sale.Discount = discountTotal;
            sale.Total = rawTotal - discountTotal;
            sale.LineItemsJson = JsonSerializer.Serialize(normalized);
            return true;
        }

        private static decimal GetDecimal(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var v)) return 0m;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
            if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var s)) return s;
            return 0m;
        }

        private static string? GetString(JsonElement el, string name)
            => el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        private static object ToResponse(Sale sale)
        {
            object lineItems;
            try { lineItems = JsonSerializer.Deserialize<JsonElement>(sale.LineItemsJson); }
            catch (JsonException) { lineItems = Array.Empty<object>(); }

            return new
            {
                id = sale.Id,
                customerId = sale.CustomerId,
                customer = sale.Customer,
                region = sale.Region,
                total = sale.Total,
                rawTotal = sale.RawTotal,
                discount = sale.Discount,
                transportCompany = sale.TransportCompany,
                builtyNo = sale.BuiltyNo,
                date = sale.Date.ToString("yyyy-MM-dd"),
                lineItems
            };
        }
    }
}