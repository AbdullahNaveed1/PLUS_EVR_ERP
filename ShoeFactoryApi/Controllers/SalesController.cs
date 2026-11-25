using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    [Authorize]
    [Route("api/sales")]
    [ApiController]
    public class SalesController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        public SalesController(FactoryDbContext context) => _context = context;

        private const int MaxStockAttempts = 5;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetSales()
        {
            // In the order they were entered, latest first, like a queue: editing a bill or changing its date
            // never moves it (the khata orders by bill date on its own)
            var sales = await _context.Sales.OrderByDescending(s => s.Id).ToListAsync();
            return sales.Select(ToResponse).ToList();
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetSale(int id)
        {
            var sale = await _context.Sales.FindAsync(id);
            return sale == null ? NotFound() : Ok(ToResponse(sale));
        }

        // Saving a bill takes its pairs out of finished-goods stock in the same save, for every role.
        // ?skipStock=true is only for importing old bills whose goods already left stock.
        [HttpPost]
        public async Task<ActionResult<object>> PostSale(JsonElement payload, [FromQuery] bool skipStock = false)
        {
            var sale = new Sale();
            // FIX #6 — recompute totals from line items; reject mismatches
            // Only Admins may send a line from Farkhabad; everyone else bills from Saggian
            if (!ApplyPayloadAndRecalculate(sale, payload, User.IsInRole("Admin"), out var error))
                return BadRequest(new { message = error });

            // A double-click or a retry sends the same bill again within seconds: keep only the first
            if (!skipStock)
            {
                var from = sale.Date.AddMinutes(-2);
                var to = sale.Date.AddMinutes(2);
                if (await _context.Sales.AnyAsync(s => s.CustomerId == sale.CustomerId && s.BillNo == sale.BillNo && s.Total == sale.Total && s.Date >= from && s.Date <= to))
                    return Conflict(new { message = $"Bill {sale.BillNo} for {sale.Customer} with this date and total is already saved. Check the bill list before saving it again." });

                // Every line must be an article size from Stock & Pricing, or its pairs never leave stock
                if (await UnlinkedLine(sale) is { } unlinked) return BadRequest(new { message = unlinked });

                // Likely duplicates and stock going below zero are saved only after the user confirms
                var confirmed = payload.TryGetProperty("confirmWarnings", out var c) && c.ValueKind == JsonValueKind.True;
                if (!confirmed && await BillWarnings(sale) is { Count: > 0 } warnings)
                    return Conflict(new { message = "Check this bill before saving:", warnings, needsConfirm = true });
            }

            // Another bill changing the same stock at the same moment: read the stock again and retry,
            // so the user only sees "save again" if it keeps clashing
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    if (!skipStock) await MoveStock(null, PairsByProduct(sale.LineItemsJson));
                    _context.Sales.Add(sale);
                    await _context.SaveChangesAsync();
                    return CreatedAtAction(nameof(GetSale), new { id = sale.Id }, ToResponse(sale));
                }
                catch (DbUpdateConcurrencyException) when (attempt < MaxStockAttempts)
                {
                    _context.ChangeTracker.Clear();
                    sale.Id = 0;
                    await Task.Delay(Random.Shared.Next(20, 120) * attempt);
                }
            }
        }

        // Admin only. Finished-goods stock moves by the difference in pairs per product,
        // saved together with the bill so the two never disagree.
        [Authorize(Roles = "Admin")]
        [HttpPut("{id}")]
        public async Task<IActionResult> PutSale(int id, JsonElement payload)
        {
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            // Returns point at this bill's lines; changing or removing the bill would count their stock twice
            if (await _context.SalesReturns.AnyAsync(r => r.SaleId == id))
                return BadRequest(new { message = "This bill has returns. Delete its returns first, then change the bill." });

            var pairsBefore = PairsByProduct(sale.LineItemsJson);
            if (!ApplyPayloadAndRecalculate(sale, payload, canUseFarkhabad: true, out var error))
                return BadRequest(new { message = error });

            // Bills saved before line items existed have nothing to compare against: leave stock alone
            if (pairsBefore != null) await MoveStock(pairsBefore, PairsByProduct(sale.LineItemsJson));

            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static List<JsonElement> Items(string json)
        {
            try { return JsonSerializer.Deserialize<JsonElement>(json).EnumerateArray().ToList(); }
            catch (Exception) { return new List<JsonElement>(); }
        }

        private async Task<string?> UnlinkedLine(Sale sale)
        {
            var items = Items(sale.LineItemsJson);
            var ids = items.Select(i => int.TryParse(ProductIdOf(i), out var id) ? id : 0).ToList();
            var existing = await _context.Products.Where(p => ids.Contains(p.Id)).Select(p => p.Id).ToListAsync();
            for (var n = 0; n < items.Count; n++)
                if (!existing.Contains(ids[n]))
                    return $"Line {n + 1} ({GetString(items[n], "model")} {GetString(items[n], "size")}) is not an article size from Stock & Pricing. Pick it from the article list.";
            return null;
        }

        // Same bill number for this customer, the same items for this customer within 30 days,
        // or Saggian stock going below zero: each is usually a mistake, so the user confirms first
        private async Task<List<string>> BillWarnings(Sale sale)
        {
            var warnings = new List<string>();
            string Day(DateTime d) => DateOnly.FromDateTime(d.AddHours(5)).ToString("dd-MM-yyyy");
            static string Signature(string json) => string.Join("|", Items(json)
                .Select(i => $"{ProductIdOf(i)}:{GetDecimal(i, "pairs"):0.##}:{GetDecimal(i, "price"):0.##}").OrderBy(x => x));

            var earlier = await _context.Sales.AsNoTracking().Where(s => s.CustomerId == sale.CustomerId).ToListAsync();
            foreach (var same in earlier.Where(s => string.Equals(s.BillNo.Trim(), sale.BillNo.Trim(), StringComparison.OrdinalIgnoreCase)))
                warnings.Add($"Bill {same.BillNo} for {sale.Customer} is already saved ({Day(same.Date)}, Rs {same.Total:N0}).");
            var signature = Signature(sale.LineItemsJson);
            foreach (var same in earlier.Where(s => !string.Equals(s.BillNo.Trim(), sale.BillNo.Trim(), StringComparison.OrdinalIgnoreCase)
                                                    && Math.Abs((s.Date - sale.Date).TotalDays) <= 30 && Signature(s.LineItemsJson) == signature))
                warnings.Add($"A bill with exactly the same items for {sale.Customer} is already saved: bill {same.BillNo}, {Day(same.Date)}, Rs {same.Total:N0}.");

            foreach (var (productId, pairs) in PairsByProduct(sale.LineItemsJson) ?? new Dictionary<int, decimal>())
            {
                var product = await _context.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == productId);
                if (product != null && product.Qty - pairs < 0)
                    warnings.Add($"{product.ArticleNumber} {product.Size}{(string.IsNullOrWhiteSpace(product.Color) ? "" : " " + product.Color)}: Saggian stock is {product.Qty} pairs, this bill takes {pairs:0} (stock would be {product.Qty - pairs:0}). Is its production entered?");
            }
            return warnings;
        }

        // Stock goes down by the pairs billed now and back up by the pairs billed before
        private async Task MoveStock(Dictionary<int, decimal>? before, Dictionary<int, decimal>? after)
        {
            before ??= new Dictionary<int, decimal>();
            after ??= new Dictionary<int, decimal>();
            foreach (var productId in before.Keys.Union(after.Keys))
            {
                var change = after.GetValueOrDefault(productId) - before.GetValueOrDefault(productId);
                var pairs = (int)decimal.Round(change, MidpointRounding.AwayFromZero);
                if (pairs == 0) continue;
                var product = await _context.Products.FindAsync(productId);
                if (product != null) product.Qty -= pairs;
            }
        }

        // Pairs per product id in a bill's saved line items (Saggian lines only: Farkhabad goods are not in our stock);
        // null when they cannot be read
        private static Dictionary<int, decimal>? PairsByProduct(string? lineItemsJson)
        {
            if (string.IsNullOrWhiteSpace(lineItemsJson)) return null;
            JsonElement items;
            try { items = JsonSerializer.Deserialize<JsonElement>(lineItemsJson); }
            catch (JsonException) { return null; }
            if (items.ValueKind != JsonValueKind.Array) return null;

            var map = new Dictionary<int, decimal>();
            foreach (var item in items.EnumerateArray())
            {
                if (!int.TryParse(ProductIdOf(item), out var productId)) continue;
                if (Facilities.IsFarkhabad(GetString(item, "facility"))) continue;
                var pairs = GetDecimal(item, "pairs");
                if (pairs <= 0)
                    pairs = GetDecimal(item, "qty") * (GetString(item, "unitType") == "pairs" ? 1m : 12m);
                map[productId] = map.GetValueOrDefault(productId) + pairs;
            }
            return map;
        }

        // Staff cancel a bill instead of deleting it: it stays on record (who, when, why), its pairs go back into stock
        // and it drops out of the khata and every total
        [HttpPost("{id}/cancel")]
        public async Task<IActionResult> CancelSale(int id, [FromBody] CancelInput input)
        {
            if (Cancellation.Validate(input) is { } invalid) return BadRequest(new { message = invalid });
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            if (await _context.SalesReturns.AnyAsync(r => r.SaleId == id))
                return BadRequest(new { message = "This bill has returns. Delete its returns first, then cancel the bill." });
            await MoveStock(PairsByProduct(sale.LineItemsJson), null);
            Cancellation.Apply(sale, User.Identity?.Name, input);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Admin only: removes the bill for good (the audit log keeps a copy)
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSale(int id)
        {
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            // Returns point at this bill's lines; changing or removing the bill would count their stock twice
            if (await _context.SalesReturns.AnyAsync(r => r.SaleId == id))
                return BadRequest(new { message = "This bill has returns. Delete its returns first, then change the bill." });
            // Deleting a bill puts its pairs back into stock
            await MoveStock(PairsByProduct(sale.LineItemsJson), null);
            _context.Sales.Remove(sale);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        /// <summary>
        /// FIX #4/#5/#6 — authoritative server-side recalculation.
        /// Trusts only: unit price, pairs, discount-per-pair. Everything else is recomputed.
        /// </summary>
        private static bool ApplyPayloadAndRecalculate(Sale sale, JsonElement payload, bool canUseFarkhabad, out string error)
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

            // Bill No is required for new bills; older bills without one may still be edited
            var billNo = GetString(payload, "billNo")?.Trim();
            if (!string.IsNullOrEmpty(billNo)) sale.BillNo = billNo;
            else if (sale.Id == 0) { error = "billNo is required."; return false; }
            // The date on the paper bill (bills are typed in days later): required on new bills, never in the future.
            // Read as UTC whatever the server's own time zone is ("2026-11-20" from the form, or "...Z")
            if (payload.TryGetProperty("date", out var dt) && dt.ValueKind == JsonValueKind.String &&
                DateTime.TryParse(dt.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed))
            {
                var billDate = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
                if (DateOnly.FromDateTime(billDate.AddHours(5)) > DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5)))
                { error = "The bill date can't be in the future."; return false; }
                sale.Date = billDate;
            }
            else if (sale.Id == 0) { error = "Pick the bill date."; return false; }

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
                    ["productId"] = ProductIdOf(item) ?? "N/A",
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
                    ["description"] = GetString(item, "description") ?? string.Empty,
                    ["facility"] = canUseFarkhabad && Facilities.IsFarkhabad(GetString(item, "facility")) ? Facilities.Farkhabad : Facilities.Saggian
                });
            }

            sale.RawTotal = rawTotal;
            sale.Discount = discountTotal;
            sale.Total = rawTotal - discountTotal;
            sale.LineItemsJson = JsonSerializer.Serialize(normalized);
            return true;
        }

        internal static decimal GetDecimal(JsonElement el, string name)
        {
            if (!el.TryGetProperty(name, out var v)) return 0m;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d)) return d;
            if (v.ValueKind == JsonValueKind.String && decimal.TryParse(v.GetString(), out var s)) return s;
            return 0m;
        }

        // Product id sent as text or a number; older bills only carry it as "[Article No: 12]" in the description
        internal static string? ProductIdOf(JsonElement item)
        {
            if (item.TryGetProperty("productId", out var v))
            {
                if (v.ValueKind == JsonValueKind.Number) return v.GetRawText();
                var text = v.ValueKind == JsonValueKind.String ? v.GetString()?.Trim() : null;
                if (!string.IsNullOrEmpty(text) && text != "N/A") return text;
            }
            var match = Regex.Match(GetString(item, "description") ?? string.Empty, @"Article No:\s*([^\]\s]+)", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : null;
        }

        private static string? GetString(JsonElement el, string name)
            => el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        // The bill's day in Pakistan time (older bills were saved with the time they were typed in)
        private static DateOnly BillDay(DateTime date) => DateOnly.FromDateTime(date.AddHours(5));

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
                billNo = sale.BillNo,
                date = BillDay(sale.Date).ToString("yyyy-MM-dd"),
                lineItems
            };
        }
    }
}