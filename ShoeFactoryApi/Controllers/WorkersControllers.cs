using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;

namespace ShoeFactoryApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WorkersController : ControllerBase
    {
        private readonly FactoryDbContext _context;

        public WorkersController(FactoryDbContext context)
        {
            _context = context;
        }

        // DELETE: api/workers/{id}
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteWorker(int id)
        {
            var worker = await _context.Workers
                .Include(w => w.WagePayments)
                .FirstOrDefaultAsync(w => IdEquals(w.Id, id)); // or w.Id == id

            if (worker == null)
            {
                return NotFound(new { message = "Worker not found." });
            }

            // Remove related wage payments first to prevent foreign key errors
            if (worker.WagePayments != null && worker.WagePayments.Any())
            {
                _context.WagePayments.RemoveRange(worker.WagePayments);
            }

            _context.Workers.Remove(worker);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Worker and associated wage records deleted successfully." });
        }

        private bool IdEquals(int workerId, int targetId) => workerId == targetId;
    }
}