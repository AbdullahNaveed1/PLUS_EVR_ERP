using System.Data;
using System.IO.Compression;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Full copy of the database as JSON, used by the download button, the nightly email and the weekly restore
    /// test. Every table in the database is copied with every column, straight from PostgreSQL, so tables or
    /// columns the app's code no longer knows about are included too. Keys are the real column names, so each
    /// table loads back with jsonb_populate_recordset. Password hashes are never included.
    /// </summary>
    public static class BackupBuilder
    {
        public const int FormatVersion = 2;

        public static async Task<byte[]> BuildJsonAsync(FactoryDbContext db, CancellationToken ct = default)
        {
            var conn = (NpgsqlConnection)db.Database.GetDbConnection();
            var openedHere = conn.State != ConnectionState.Open;
            if (openedHere) await conn.OpenAsync(ct);
            try
            {
                // One consistent snapshot of all tables, unless the caller already started a transaction
                var outer = db.Database.CurrentTransaction;
                await using var own = outer == null ? await conn.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct) : null;
                var tx = own ?? (NpgsqlTransaction)outer!.GetDbTransaction();

                var tables = new List<string>();
                await using (var list = new NpgsqlCommand(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' " +
                    "AND table_name <> '__EFMigrationsHistory' ORDER BY table_name", conn, tx))
                await using (var reader = await list.ExecuteReaderAsync(ct))
                    while (await reader.ReadAsync(ct)) tables.Add(reader.GetString(0));

                using var stream = new MemoryStream();
                await using (var writer = new Utf8JsonWriter(stream))
                {
                    writer.WriteStartObject();
                    writer.WriteString("ExportedAt", DateTime.UtcNow);
                    writer.WriteNumber("FormatVersion", FormatVersion);
                    foreach (var table in tables)
                    {
                        var name = table.Replace("\"", "\"\"");
                        // Logins are kept, their password hashes never are
                        var rows = table == "Users" ? "to_jsonb(t) - 'PasswordHash'" : "to_jsonb(t)";
                        await using var cmd = new NpgsqlCommand($"SELECT COALESCE(jsonb_agg({rows}), '[]'::jsonb)::text FROM public.\"{name}\" t", conn, tx)
                        {
                            CommandTimeout = 300
                        };
                        writer.WritePropertyName(table);
                        writer.WriteRawValue((string)(await cmd.ExecuteScalarAsync(ct))!, skipInputValidation: true);
                    }
                    writer.WriteEndObject();
                }

                if (own != null) await own.CommitAsync(ct);
                return stream.ToArray();
            }
            finally
            {
                if (openedHere) await conn.CloseAsync();
            }
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

        /// <summary>Sends a plain message to the backup address (used for restore-test failures); returns an error or null.</summary>
        public static async Task<string?> SendNoticeAsync(Settings settings, string subject, string body, CancellationToken cancellationToken = default)
        {
            if (!settings.Configured) return "Backup email is not set up.";
            try
            {
                using var message = new MailMessage(settings.User!, settings.To!) { Subject = subject, Body = body };
                using var smtp = new SmtpClient(settings.Host, settings.Port)
                {
                    EnableSsl = settings.Ssl,
                    Credentials = new NetworkCredential(settings.User, settings.Password),
                    Timeout = 60_000
                };
                await smtp.SendMailAsync(message, cancellationToken);
                return null;
            }
            catch (Exception ex)
            {
                return ex.InnerException?.Message ?? ex.Message;
            }
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
