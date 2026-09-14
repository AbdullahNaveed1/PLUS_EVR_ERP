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
            var sales = await _context.Sales.OrderByDescending(sale => sale.Date).ThenByDescending(sale => sale.Id).ToListAsync();
            return sales.Select(ToResponse).ToList();
        }

        [HttpPost]
        public async Task<ActionResult<object>> PostSale(JsonElement payload)
        {
            var sale = FromPayload(payload);
            _context.Sales.Add(sale);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetSale), new { id = sale.Id }, ToResponse(sale));
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> PutSale(int id, JsonElement payload)
        {
            var sale = await _context.Sales.FindAsync(id);
            if (sale == null) return NotFound();
            ApplyPayload(sale, payload);
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

        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetSale(int id)
        {
            var sale = await _context.Sales.FindAsync(id);
            return sale == null ? NotFound() : Ok(ToResponse(sale));
        }

        private static Sale FromPayload(JsonElement payload)
        {
            var sale = new Sale();
            ApplyPayload(sale, payload);
            return sale;
        }

        private static void ApplyPayload(Sale sale, JsonElement payload)
        {
            sale.CustomerId = payload.GetProperty("customerId").GetString() ?? string.Empty;
            sale.Customer = payload.GetProperty("customer").GetString() ?? string.Empty;
            sale.Region = payload.TryGetProperty("region", out var region) ? region.GetString() ?? "Punjab" : "Punjab";
            sale.Total = payload.GetProperty("total").GetDecimal();
            sale.RawTotal = payload.TryGetProperty("rawTotal", out var rawTotal) ? rawTotal.GetDecimal() : sale.Total;
            sale.Discount = payload.TryGetProperty("discount", out var discount) ? discount.GetDecimal() : 0;
            sale.TransportCompany = payload.TryGetProperty("transportCompany", out var transport) ? transport.GetString() ?? "N/A" : "N/A";
            sale.BuiltyNo = payload.TryGetProperty("builtyNo", out var builty) ? builty.GetString() ?? "N/A" : "N/A";
            sale.Date = payload.TryGetProperty("date", out var date) && DateTime.TryParse(date.GetString(), out var parsedDate)
                ? DateTime.SpecifyKind(parsedDate, DateTimeKind.Utc)
                : DateTime.UtcNow;
            sale.LineItemsJson = payload.TryGetProperty("lineItems", out var lineItems) ? lineItems.GetRawText() : "[]";
        }

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
