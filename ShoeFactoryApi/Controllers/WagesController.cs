using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    public class ProductionWageRequest
    {
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }

    [Authorize]
    [Route("api/wages")]
    [ApiController]
    public class WagesController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public WagesController(FactoryDbContext context) => _context = context;

        [HttpGet("production")]
        public async Task<ActionResult<object>> GetProductionWages([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
        {
            var start = DateTime.SpecifyKind((startDate ?? DateTime.UtcNow.Date.AddDays(-6)).Date, DateTimeKind.Utc);
            var end = DateTime.SpecifyKind((endDate ?? DateTime.UtcNow.Date).Date, DateTimeKind.Utc);

            if (end < start)
            {
                return BadRequest(new { message = "End date must be on or after the start date." });
            }

            var records = await _context.ProductionRecords
                .Where(p => p.Date >= start && p.Date <= end)
                .ToListAsync();

            var totalDozens = records.Sum(p => p.Dozens + (p.Pairs / 12m));
            var machineAmount = Math.Round(totalDozens * 38m, 2);
            var safaiAmount = Math.Round(totalDozens * 50m, 2);
            var totalLabor = Math.Round(machineAmount + safaiAmount, 2);

            return Ok(new
            {
                startDate = start,
                endDate = end,
                totalDozens = Math.Round(totalDozens, 4),
                machineAmount,
                safaiAmount,
                totalLabor,
                perArticle = records
                    .GroupBy(p => p.ArticleNumber)
                    .Select(g => new
                    {
                        article = g.Key,
                        dozens = Math.Round(g.Sum(p => p.Dozens + (p.Pairs / 12m)), 4)
                    })
                    .OrderByDescending(x => x.dozens)
                    .ToList()
            });
        }

        [HttpPost("production/report")]
        public async Task<ActionResult<object>> SaveProductionWageReport([FromBody] ProductionWageRequest request)
        {
            if (request.StartDate == default || request.EndDate == default)
            {
                return BadRequest(new { message = "Both startDate and endDate are required." });
            }

            var start = DateTime.SpecifyKind(request.StartDate.Date, DateTimeKind.Utc);
            var end = DateTime.SpecifyKind(request.EndDate.Date, DateTimeKind.Utc);
            if (end < start)
            {
                return BadRequest(new { message = "End date must be on or after the start date." });
            }

            var records = await _context.ProductionRecords
                .Where(p => p.Date >= start && p.Date <= end)
                .ToListAsync();

            var totalDozens = records.Sum(p => p.Dozens + (p.Pairs / 12m));
            var machineAmount = Math.Round(totalDozens * 38m, 2);
            var safaiAmount = Math.Round(totalDozens * 50m, 2);
            var totalLabor = Math.Round(machineAmount + safaiAmount, 2);

            var machineWorker = await _context.Workers.FirstOrDefaultAsync(w => w.Name.ToLower() == "cheema");
            if (machineWorker == null)
            {
                machineWorker = new Worker
                {
                    Name = "Cheema",
                    Phone = "",
                    Role = "Machine Man",
                    IsActive = true
                };
                _context.Workers.Add(machineWorker);
                await _context.SaveChangesAsync();
            }

            var safaiWorker = await _context.Workers.FirstOrDefaultAsync(w => w.Name.ToLower() == "safai & packing" || w.Role.ToLower() == "safai & packing");
            if (safaiWorker == null)
            {
                safaiWorker = new Worker
                {
                    Name = "Safai & Packing",
                    Phone = "",
                    Role = "Safai & Packing",
                    IsActive = true
                };
                _context.Workers.Add(safaiWorker);
                await _context.SaveChangesAsync();
            }

            // Idempotency: refuse to create duplicate wage payments for the same range
            var rangeLabel = $"({start:yyyy-MM-dd} to {end:yyyy-MM-dd})";
            var alreadySaved = await _context.WagePayments.AnyAsync(w =>
                w.Notes != null && w.Notes.Contains(rangeLabel));
            if (alreadySaved)
            {
                return Conflict(new { message = "Wages for this date range have already been saved to the payroll ledger." });
            }

            var machinePayment = new WagePayment
            {
                WorkerId = machineWorker.Id,
                Amount = machineAmount,
                PaymentDate = end,
                Notes = $"Production wages for {start:yyyy-MM-dd} to {end:yyyy-MM-dd} (Machine Man)"
            };

            var safaiPayment = new WagePayment
            {
                WorkerId = safaiWorker.Id,
                Amount = safaiAmount,
                PaymentDate = end,
                Notes = $"Production wages for {start:yyyy-MM-dd} to {end:yyyy-MM-dd} (Safai & Packing)"
            };

            _context.WagePayments.AddRange(machinePayment, safaiPayment);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                startDate = start,
                endDate = end,
                totalDozens = Math.Round(totalDozens, 4),
                machineAmount,
                safaiAmount,
                totalLabor,
                perArticle = records
                    .GroupBy(p => p.ArticleNumber)
                    .Select(g => new
                    {
                        article = g.Key,
                        dozens = Math.Round(g.Sum(p => p.Dozens + (p.Pairs / 12m)), 4)
                    })
                    .OrderByDescending(x => x.dozens)
                    .ToList(),
                machineWorkerId = machineWorker.Id,
                safaiWorkerId = safaiWorker.Id,
                saved = true,
                createdPayments = new[]
                {
                    new { workerId = machineWorker.Id, workerName = machineWorker.Name, amount = machineAmount },
                    new { workerId = safaiWorker.Id, workerName = safaiWorker.Name, amount = safaiAmount }
                }
            });
        }

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

        // DELETE: api/wages/workers/{id}
        [Authorize(Roles = "Admin")]
        [HttpDelete("workers/{id}")]
        public async Task<IActionResult> DeleteWorker(int id)
        {
            var worker = await _context.Workers
                .Include(w => w.WagePayments)
                .FirstOrDefaultAsync(w => w.Id == id);

            if (worker == null) return NotFound(new { message = "Worker not found." });

            // Remove associated wage payments first to prevent foreign key constraint exceptions
            if (worker.WagePayments != null && worker.WagePayments.Any())
            {
                _context.WagePayments.RemoveRange(worker.WagePayments);
            }

            _context.Workers.Remove(worker);
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

        // DELETE: api/wages/payments/{id}
        [Authorize(Roles = "Admin")]
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