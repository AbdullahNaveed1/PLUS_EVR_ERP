using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Route("api/payments")]
    [ApiController]
    public class PaymentsController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public PaymentsController(FactoryDbContext context) => _context = context;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Payment>>> GetPayments() => await _context.Payments.OrderByDescending(payment => payment.Date).ThenByDescending(payment => payment.Id).ToListAsync();

        [HttpPost]
        public async Task<ActionResult<Payment>> PostPayment(Payment payment)
        {
            payment.Id = 0;
            payment.Date = DateTime.SpecifyKind(payment.Date, DateTimeKind.Utc);
            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetPayment), new { id = payment.Id }, payment);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<Payment>> GetPayment(int id)
        {
            var payment = await _context.Payments.FindAsync(id);
            return payment == null ? NotFound() : payment;
        }
    }
}
