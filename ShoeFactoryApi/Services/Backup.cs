using System.IO.Compression;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>Full copy of the business data as JSON, used by the download button and the nightly email.</summary>
    public static class BackupBuilder
    {
        public static async Task<byte[]> BuildJsonAsync(FactoryDbContext db)
        {
            var snapshot = new
            {
                ExportedAt = DateTime.UtcNow,
                Products = await db.Products.AsNoTracking().ToListAsync(),
                Articles = await db.Articles.AsNoTracking().ToListAsync(),
                ProductPriceHistories = await db.ProductPriceHistories.AsNoTracking().ToListAsync(),
                Customers = await db.Customers.AsNoTracking().ToListAsync(),
                Sales = await db.Sales.AsNoTracking().ToListAsync(),
                Expenses = await db.Expenses.AsNoTracking().ToListAsync(),
                Payments = await db.Payments.AsNoTracking().ToListAsync(),
                Workers = await db.Workers.AsNoTracking().ToListAsync(),
                WagePayments = await db.WagePayments.AsNoTracking().ToListAsync(),
                RawMaterials = await db.RawMaterials.AsNoTracking().ToListAsync(),
                // SizesJson is hidden from normal API output, so the backup lists it explicitly
                ProductionRecords = (await db.ProductionRecords.AsNoTracking().ToListAsync())
                    .Select(p => new { p.Id, p.Date, p.ArticleNumber, p.Dozens, p.Pairs, p.Notes, p.CreatedAt, p.SizesJson }),
                BomEntries = await db.BomEntries.AsNoTracking().ToListAsync(),
                MaterialEntries = await db.MaterialEntries.AsNoTracking().ToListAsync(),
                MaterialCounts = await db.MaterialCounts.AsNoTracking().ToListAsync(),
                Suppliers = await db.Suppliers.AsNoTracking().ToListAsync(),
                SupplierPayments = await db.SupplierPayments.AsNoTracking().ToListAsync(),
                SalesReturns = await db.SalesReturns.AsNoTracking().ToListAsync(),
                // Logins only, never password hashes
                Users = await db.Users.AsNoTracking().Select(u => new { u.Id, u.Username, u.Role, u.AllowedTabs }).ToListAsync(),
                AuditLogs = await db.AuditLogs.AsNoTracking().OrderBy(a => a.Id).ToListAsync()
            };
            return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    /// <summary>
    /// Emails a zipped backup every night. Configured with environment variables on Railway:
    /// BACKUP_EMAIL_TO, SMTP_USER, SMTP_PASSWORD (a Gmail app password), and optionally
    /// SMTP_HOST (smtp.gmail.com), SMTP_PORT (587), SMTP_SSL (true), BACKUP_HOUR (2 = 2 AM Pakistan time).
    /// Every attempt is written to the audit log.
    /// </summary>
    public class BackupEmailService : BackgroundService
    {
        private static readonly TimeSpan PakistanOffset = TimeSpan.FromHours(5);
        private readonly IServiceScopeFactory _scopes;
        private readonly ILogger<BackupEmailService> _logger;

        public BackupEmailService(IServiceScopeFactory scopes, ILogger<BackupEmailService> logger)
        {
            _scopes = scopes;
            _logger = logger;
        }

        public sealed record Settings(string? To, string Host, int Port, bool Ssl, string? User, string? Password, int Hour)
        {
            public bool Configured => !string.IsNullOrWhiteSpace(To) && !string.IsNullOrWhiteSpace(User) && !string.IsNullOrWhiteSpace(Password);
        }

        public static Settings ReadSettings()
        {
            string? Env(string name) => Environment.GetEnvironmentVariable(name)?.Trim();
            return new Settings(
                Env("BACKUP_EMAIL_TO"),
                Env("SMTP_HOST") is { Length: > 0 } host ? host : "smtp.gmail.com",
                int.TryParse(Env("SMTP_PORT"), out var port) ? port : 587,
                !string.Equals(Env("SMTP_SSL"), "false", StringComparison.OrdinalIgnoreCase),
                Env("SMTP_USER"),
                Env("SMTP_PASSWORD")?.Replace(" ", ""), // Gmail shows app passwords in groups of four
                int.TryParse(Env("BACKUP_HOUR"), out var hour) && hour is >= 0 and <= 23 ? hour : 2);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var settings = ReadSettings();
            if (!settings.Configured)
            {
                _logger.LogWarning("Nightly backup email is off: set BACKUP_EMAIL_TO, SMTP_USER and SMTP_PASSWORD to turn it on.");
                return;
            }

            while (!stoppingToken.IsCancellationRequested)
            {
                var delay = UntilNextRun(DateTimeOffset.UtcNow, settings.Hour);
                _logger.LogInformation("Next backup email in {Delay}.", delay);
                try { await Task.Delay(delay, stoppingToken); }
                catch (TaskCanceledException) { return; }

                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                await SendAsync(db, settings, "system", stoppingToken);
            }
        }

        // Time until the next run at `hour` o'clock Pakistan time (UTC+5, no daylight saving)
        public static TimeSpan UntilNextRun(DateTimeOffset nowUtc, int hour)
        {
            var nowPk = nowUtc.ToOffset(PakistanOffset);
            var next = new DateTimeOffset(nowPk.Year, nowPk.Month, nowPk.Day, hour, 0, 0, PakistanOffset);
            if (next <= nowPk) next = next.AddDays(1);
            return next - nowPk;
        }

        /// <summary>Builds, zips and emails a backup; returns an error message or null on success.</summary>
        public static async Task<string?> SendAsync(FactoryDbContext db, Settings settings, string user, CancellationToken cancellationToken = default)
        {
            if (!settings.Configured) return "Backup email is not set up yet (BACKUP_EMAIL_TO, SMTP_USER, SMTP_PASSWORD).";

            string? error = null;
            long size = 0;
            try
            {
                var json = await BackupBuilder.BuildJsonAsync(db);
                using var zipped = new MemoryStream();
                await using (var gzip = new GZipStream(zipped, CompressionLevel.SmallestSize, leaveOpen: true))
                    await gzip.WriteAsync(json, cancellationToken);
                size = zipped.Length;
                zipped.Position = 0;

                var day = DateTimeOffset.UtcNow.ToOffset(PakistanOffset).ToString("yyyy-MM-dd");
                using var message = new MailMessage(settings.User!, settings.To!)
                {
                    Subject = $"PLUS EVR ERP backup {day}",
                    Body = $"Attached is the full PLUS EVR ERP backup for {day} ({size / 1024.0:0.#} KB zipped, {json.Length / 1024.0:0.#} KB of data).\n\n" +
                           "Keep these emails: each one is a complete copy of the business data. To open it, unzip the .gz file (7-Zip or WinRAR) to get the .json file."
                };
                message.Attachments.Add(new Attachment(zipped, $"plus-evr-erp-backup-{day}.json.gz", "application/gzip"));

                using var smtp = new SmtpClient(settings.Host, settings.Port)
                {
                    EnableSsl = settings.Ssl,
                    Credentials = new NetworkCredential(settings.User, settings.Password),
                    Timeout = 60_000
                };
                await smtp.SendMailAsync(message, cancellationToken);
            }
            catch (Exception ex)
            {
                error = ex.InnerException?.Message ?? ex.Message;
            }

            db.AuditLogs.Add(new AuditLog
            {
                User = user,
                Action = error == null ? "backup_emailed" : "backup_failed",
                Entity = "Backup",
                Changes = JsonSerializer.Serialize(new { to = settings.To, sizeKb = Math.Round(size / 1024.0, 1), error })
            });
            await db.SaveChangesAsync(cancellationToken);
            return error;
        }
    }
}
