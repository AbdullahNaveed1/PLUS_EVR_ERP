using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>Admin-only backups: download now, email now, and the nightly email's status.</summary>
    [ApiController]
    [Route("api/backup")]
    [Authorize(Roles = "Admin")]
    public class BackupController : ControllerBase
    {
        private readonly FactoryDbContext _db;
        public BackupController(FactoryDbContext db) { _db = db; }

        [HttpGet("download")]
        public async Task<IActionResult> Download() =>
            File(await BackupBuilder.BuildJsonAsync(_db), "application/json", $"plus-evr-erp-backup-{DateTime.UtcNow:yyyy-MM-dd}.json");

        [HttpPost("email-now")]
        public async Task<IActionResult> EmailNow()
        {
            var error = await BackupEmailService.SendAsync(_db, BackupEmailService.ReadSettings(), User.Identity?.Name ?? "admin");
            return error == null ? Ok(new { message = "Backup emailed." }) : BadRequest(new { message = $"Backup email failed: {error}" });
        }

        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            var settings = BackupEmailService.ReadSettings();
            var last = await _db.AuditLogs.AsNoTracking()
                .Where(a => a.Entity == "Backup")
                .OrderByDescending(a => a.Id)
                .Take(5)
                .Select(a => new { a.At, a.Action, a.User, a.Changes })
                .ToListAsync();
            return Ok(new
            {
                configured = settings.Configured,
                to = settings.To,
                hourPakistan = settings.Hour,
                recent = last
            });
        }
    }
}
