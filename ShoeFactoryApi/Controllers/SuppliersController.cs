using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>
    /// Suppliers and their khata. Purchases are Material Entry "received" rows linked to the supplier
    /// (their Amount is what is owed); payments lower it. Balance = opening + purchases − payments.
    /// </summary>
    [ApiController]
    [Route("api/suppliers")]
    [Authorize]
    public class SuppliersController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public SuppliersController(FactoryDbContext db) { _db = db; }

        // Live purchases that count towards a khata
        private IQueryable<MaterialEntry> Purchases => _db.MaterialEntries
            .Where(e => e.SupplierId != null && !e.Voided && e.Kind == MaterialEntryKinds.Received);

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var suppliers = await _db.Suppliers.AsNoTracking().OrderBy(s => s.Name).ToListAsync();
            var purchased = await Purchases.GroupBy(e => e.SupplierId!.Value)
                .Select(g => new { id = g.Key, total = g.Sum(e => e.Amount ?? 0), count = g.Count() }).ToListAsync();
            var paid = await _db.SupplierPayments.GroupBy(p => p.SupplierId)
                .Select(g => new { id = g.Key, total = g.Sum(p => p.Amount) }).ToListAsync();

            return Ok(suppliers.Select(s =>
            {
                var bought = purchased.FirstOrDefault(p => p.id == s.Id);
                var payments = paid.FirstOrDefault(p => p.id == s.Id)?.total ?? 0;
                return new
                {
                    s.Id, s.Name, s.Phone, s.Address, s.OpeningBalance, s.Notes,
                    purchases = bought?.total ?? 0,
                    purchaseCount = bought?.count ?? 0,
                    paid = payments,
                    balance = s.OpeningBalance + (bought?.total ?? 0) - payments
                };
            }));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] SupplierInput input)
        {
            var supplier = new Supplier();
            var error = await Apply(supplier, input);
            if (error != null) return BadRequest(new { message = error });
            _db.Suppliers.Add(supplier);
            await _db.SaveChangesAsync();
            return Ok(supplier);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SupplierInput input)
        {
            var supplier = await _db.Suppliers.FindAsync(id);
            if (supplier == null) return NotFound();
            var error = await Apply(supplier, input);
            if (error != null) return BadRequest(new { message = error });
            await _db.SaveChangesAsync();
            return Ok(supplier);
        }

        // Only a supplier with no purchases or payments can be removed, so no khata history is lost
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var supplier = await _db.Suppliers.FindAsync(id);
            if (supplier == null) return NotFound();
            if (await _db.MaterialEntries.AnyAsync(e => e.SupplierId == id) || await _db.SupplierPayments.AnyAsync(p => p.SupplierId == id))
                return BadRequest(new { message = "This supplier has purchases or payments, so it can't be deleted." });
            _db.Suppliers.Remove(supplier);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // Date-wise khata: opening, every purchase and payment, running balance
        [HttpGet("{id:int}/ledger")]
        public async Task<IActionResult> Ledger(int id)
        {
            var supplier = await _db.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
            if (supplier == null) return NotFound();

            var purchases = await Purchases.Where(e => e.SupplierId == id).AsNoTracking().ToListAsync();
            var payments = await _db.SupplierPayments.Where(p => p.SupplierId == id).AsNoTracking().ToListAsync();

            var rows = purchases.Select(e => new LedgerRow(e.Date, e.CreatedAt, "purchase", e.Id.ToString(),
                    $"{e.Material} {e.Quantity:0.####} {e.Unit}" + (e.BillNo != null ? $" · Bill {e.BillNo}" : ""), e.Amount ?? 0, 0))
                .Concat(payments.Select(p => new LedgerRow(p.Date, p.CreatedAt, "payment", p.Id.ToString(),
                    string.IsNullOrWhiteSpace(p.Notes) ? "Payment" : $"Payment · {p.Notes}", 0, p.Amount)))
                .OrderBy(r => r.Date).ThenBy(r => r.CreatedAt)
                .ToList();

            var balance = supplier.OpeningBalance;
            var entries = rows.Select(r =>
            {
                balance += r.Purchase - r.Payment;
                return new { date = r.Date, kind = r.Kind, id = r.Id, detail = r.Detail, purchase = r.Purchase, payment = r.Payment, balance };
            }).ToList();

            return Ok(new
            {
                supplier,
                openingBalance = supplier.OpeningBalance,
                entries,
                totalPurchases = rows.Sum(r => r.Purchase),
                totalPaid = rows.Sum(r => r.Payment),
                balance
            });
        }

        [HttpPost("{id:int}/payments")]
        public async Task<IActionResult> AddPayment(int id, [FromBody] SupplierPaymentInput input)
        {
            if (!await _db.Suppliers.AnyAsync(s => s.Id == id)) return NotFound();
            if (input.Date == null) return BadRequest(new { message = "Pick the payment date." });
            if (!(input.Amount > 0)) return BadRequest(new { message = "Amount must be more than 0." });

            var payment = new SupplierPayment
            {
                SupplierId = id,
                Date = input.Date.Value,
                Amount = input.Amount!.Value,
                Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim()
            };
            _db.SupplierPayments.Add(payment);
            await _db.SaveChangesAsync();
            return Ok(payment);
        }

        // Admin only, for mistaken or duplicate payments; recorded in the audit log
        [Authorize(Roles = "Admin")]
        [HttpDelete("payments/{paymentId:int}")]
        public async Task<IActionResult> DeletePayment(int paymentId)
        {
            var payment = await _db.SupplierPayments.FindAsync(paymentId);
            if (payment == null) return NotFound();
            _db.SupplierPayments.Remove(payment);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private async Task<string?> Apply(Supplier supplier, SupplierInput input)
        {
            var name = input.Name?.Trim() ?? string.Empty;
            if (name.Length == 0) return "Enter the supplier name.";
            if (await _db.Suppliers.AnyAsync(s => s.Id != supplier.Id && s.Name.ToLower() == name.ToLower()))
                return $"A supplier called '{name}' already exists.";

            supplier.Name = name;
            supplier.Phone = Clean(input.Phone);
            supplier.Address = Clean(input.Address);
            supplier.Notes = Clean(input.Notes);
            supplier.OpeningBalance = input.OpeningBalance ?? 0;
            return null;
        }

        private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        private sealed record LedgerRow(DateOnly Date, DateTime CreatedAt, string Kind, string Id, string Detail, decimal Purchase, decimal Payment);
    }

    public class SupplierInput
    {
        public string? Name { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public decimal? OpeningBalance { get; set; }
        public string? Notes { get; set; }
    }

    public class SupplierPaymentInput
    {
        public DateOnly? Date { get; set; }
        public decimal? Amount { get; set; }
        public string? Notes { get; set; }
    }
}
