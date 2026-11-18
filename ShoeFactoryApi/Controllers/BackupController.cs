using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>Admin-only backups: download now, email now, restore test now, and their status.</summary>
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

        // Runs the weekly restore test now (takes a few seconds)
        [HttpPost("restore-test")]
        public async Task<IActionResult> RestoreTestNow()
        {
            var result = await RestoreTest.RunAndRecordAsync(_db, User.Identity?.Name ?? "admin");
            return Ok(result);
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
            var restoreTest = await _db.AuditLogs.AsNoTracking()
                .Where(a => a.Entity == "Backup" && a.Action.StartsWith("restore_test"))
                .OrderByDescending(a => a.Id)
                .Select(a => new { a.At, a.Action, a.User, a.Changes })
                .FirstOrDefaultAsync();
            return Ok(new
            {
                restoreTest,
                configured = settings.Configured,
                to = settings.To,
                hourPakistan = settings.Hour,
                recent = last
            });
        }
    }
}
