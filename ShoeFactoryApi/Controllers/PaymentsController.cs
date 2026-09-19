using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
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

            // Safety: PostgreSQL DateTime columns require UTC Kind
            if (payment.Date.Kind != DateTimeKind.Utc)
            {
                payment.Date = DateTime.SpecifyKind(payment.Date, DateTimeKind.Utc);
            }

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            return Ok(payment);
        }

        // PUT: api/payments/5
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

        // DELETE: api/payments/5
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