using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    public class PaymentDateInput
    {
        public DateOnly? Date { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PaymentsController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public PaymentsController(FactoryDbContext context)
        {
            _context = context;
        }

        // GET: api/payments
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Payment>>> GetPayments()
        {
            return await _context.Payments
                .AsNoTracking()
                .OrderBy(p => p.Id)
                .ToListAsync();
        }

        // GET: api/payments/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Payment>> GetPayment(int id)
        {
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null) return NotFound();
            return payment;
        }

        // POST: api/payments
        [HttpPost]
        public async Task<ActionResult<Payment>> CreatePayment([FromBody] Payment payment)
        {
            if (payment == null) return BadRequest("Payment is null.");

            // Force DB auto-generation. Any id sent from the frontend (e.g. Date.now()) is ignored.
            // This prevents int overflow errors that cause HTTP 400 responses.
            payment.Id = 0;

            // The day the cash was received, from the paper (cash is typed in days later)
            if (payment.Date == default) return BadRequest(new { message = "Pick the date the payment was received." });
            payment.Date = DateTime.SpecifyKind(payment.Date, DateTimeKind.Utc);
            if (IsFuture(payment.Date)) return BadRequest(new { message = "The payment date can't be in the future." });
            if (!(payment.Amount > 0)) return BadRequest(new { message = "Amount must be more than 0." });

            // A double-click or a retry sends the same payment again within seconds: keep only the first
            var recent = DateTime.UtcNow.AddMinutes(-2);
            if (await _context.Payments.AnyAsync(p => p.CustomerId == payment.CustomerId && p.Amount == payment.Amount && p.CreatedAt >= recent))
                return Conflict(new { message = $"Rs {payment.Amount:N0} from {payment.Customer} was already saved a moment ago." });
            payment.CreatedAt = DateTime.UtcNow;

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            return Ok(payment);
        }

        // Admin only: puts a payment on the date it was really received. Closed months stay locked (both dates).
        [Authorize(Roles = "Admin")]
        [HttpPost("{id}/date")]
        public async Task<IActionResult> ChangeDate(int id, [FromBody] PaymentDateInput input)
        {
            if (input?.Date == null) return BadRequest(new { message = "Pick the payment date." });
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null) return NotFound();
            var date = input.Date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            if (IsFuture(date)) return BadRequest(new { message = "The payment date can't be in the future." });
            payment.Date = date;
            await _context.SaveChangesAsync();
            return Ok(payment);
        }

        // Pakistan day of a date is after today
        private static bool IsFuture(DateTime utc) =>
            DateOnly.FromDateTime(utc.AddHours(5)) > DateOnly.FromDateTime(DateTime.UtcNow.AddHours(5));

        // PUT: api/payments/5 — Admin only (no screen uses it; staff correct payments by cancelling them)
        [Authorize(Roles = "Admin")]
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdatePayment(int id, [FromBody] Payment payment)
        {
            if (payment == null || id != payment.Id) return BadRequest();

            var existing = await _context.Payments.FindAsync(id);
            if (existing == null) return NotFound();

            existing.CustomerId = payment.CustomerId;
            existing.Customer = payment.Customer;
            existing.Amount = payment.Amount;
            existing.Date = payment.Date.Kind == DateTimeKind.Utc
                ? payment.Date
                : DateTime.SpecifyKind(payment.Date, DateTimeKind.Utc);

            await _context.SaveChangesAsync();
            return Ok(existing);
        }

        // Staff cancel a mistaken payment instead of deleting it; it drops out of the khata
        [HttpPost("{id}/cancel")]
        public async Task<IActionResult> CancelPayment(int id, [FromBody] CancelInput input)
        {
            if (Cancellation.Validate(input) is { } invalid) return BadRequest(new { message = invalid });
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null) return NotFound();
            Cancellation.Apply(payment, User.Identity?.Name, input);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/payments/5 — Admin only, used to remove duplicate or mistaken payments
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePayment(int id)
        {
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null) return NotFound();

            _context.Payments.Remove(payment);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}