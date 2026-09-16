using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Authorize]
    [Route("api/wages")]
    [ApiController]
    public class WagesController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public WagesController(FactoryDbContext context) => _context = context;

        [HttpGet("workers")]
        public async Task<ActionResult<IEnumerable<Worker>>> GetWorkers()
        {
            try
            {
                return await _context.Workers.OrderBy(worker => worker.Name).ToListAsync();
            }
            catch
            {
                return Ok(new List<Worker>());
            }
        }

        [HttpPost("workers")]
        public async Task<ActionResult<Worker>> AddWorker(Worker worker)
        {
            if (string.IsNullOrWhiteSpace(worker.Name)) return BadRequest("Worker name is required.");
            worker.Id = 0;
            _context.Workers.Add(worker);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetWorkers), new { id = worker.Id }, worker);
        }

        [HttpPut("workers/{id}")]
        public async Task<IActionResult> UpdateWorker(int id, Worker worker)
        {
            if (id != worker.Id) return BadRequest();
            if (!await _context.Workers.AnyAsync(item => item.Id == id)) return NotFound();
            _context.Entry(worker).State = EntityState.Modified;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpGet("payments")]
        public async Task<ActionResult<IEnumerable<WagePayment>>> GetPayments()
        {
            try
            {
                return await _context.WagePayments
                    .Include(payment => payment.Worker)
                    .OrderByDescending(payment => payment.PaymentDate)
                    .ToListAsync();
            }
            catch
            {
                return Ok(new List<WagePayment>());
            }
        }

        [HttpPost("payments")]
        public async Task<ActionResult<WagePayment>> AddPayment(WagePayment payment)
        {
            if (payment.WorkerId <= 0 || payment.Amount <= 0) return BadRequest("Worker and a positive amount are required.");
            if (!await _context.Workers.AnyAsync(worker => worker.Id == payment.WorkerId)) return NotFound("Worker not found.");
            payment.Id = 0;
            _context.WagePayments.Add(payment);
            await _context.SaveChangesAsync();
            await _context.Entry(payment).Reference(item => item.Worker).LoadAsync();
            return CreatedAtAction(nameof(GetPayments), new { id = payment.Id }, payment);
        }

        [HttpDelete("payments/{id}")]
        public async Task<IActionResult> DeletePayment(int id)
        {
            var payment = await _context.WagePayments.FindAsync(id);
            if (payment == null) return NotFound();
            _context.WagePayments.Remove(payment);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}