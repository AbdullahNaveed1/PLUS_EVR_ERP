using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ShoeFactoryApi.Services
{
    public sealed class DailyDatabaseBackupService : BackgroundService
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<DailyDatabaseBackupService> _logger;

        public DailyDatabaseBackupService(IConfiguration configuration, ILogger<DailyDatabaseBackupService> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("DailyDatabaseBackupService initialized.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var now = DateTime.Now;
                    var backupTimeStr = _configuration["Backup:Time"];
                    var backupTime = TimeSpan.TryParse(backupTimeStr, out var configuredTime)
                        ? configuredTime
                        : new TimeSpan(2, 0, 0); // Default 2:00 AM daily

                    var nextRun = now.Date.Add(backupTime);
                    if (nextRun <= now)
                    {
                        nextRun = nextRun.AddDays(1);
                    }

                    var delay = nextRun - now;
                    _logger.LogInformation("Next database backup scheduled for {NextRun} (in {DelayHours:F1} hours)", nextRun, delay.TotalHours);

                    await Task.Delay(delay, stoppingToken);

                    if (!stoppingToken.IsCancellationRequested)
                    {
                        await CreateBackupAsync(stoppingToken);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred in the backup scheduling loop.");
                    await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
                }
            }
        }

        private async Task CreateBackupAsync(CancellationToken cancellationToken)
        {
            // Fallback chain: Railway DATABASE_URL -> appsettings DefaultConnection
            var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
                ?? _configuration.GetConnectionString("DefaultConnection");

            if (string.IsNullOrEmpty(connectionString))
            {
                _logger.LogError("Backup failed: Connection string (DATABASE_URL / DefaultConnection) is null or empty.");
                return;
            }

            // Defaults to mounted Railway volume path /app/backups
            var backupDirectory = _configuration["Backup:Directory"] ?? "/app/backups";
            var pgDumpPath = _configuration["Backup:PgDumpPath"] ?? "pg_dump";

            try
            {
                Directory.CreateDirectory(backupDirectory);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create backup directory at {BackupDirectory}", backupDirectory);
                return;
            }

            var fileName = $"ShoeFactoryDb-{DateTime.UtcNow:yyyy-MM-dd_HH-mm-ss}.dump";
            var outputPath = Path.GetFullPath(Path.Combine(backupDirectory, fileName));

            _logger.LogInformation("Starting pg_dump backup to {OutputPath}...", outputPath);

            var startInfo = new ProcessStartInfo
            {
                FileName = pgDumpPath,
                Arguments = $"--format=custom --file=\"{outputPath}\" \"{connectionString}\"",
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using var process = Process.Start(startInfo);
                if (process == null)
                {
                    _logger.LogError("Could not start pg_dump process. Ensure postgresql-client is installed in Dockerfile.");
                    return;
                }

                var stdErrTask = process.StandardError.ReadToEndAsync(cancellationToken);
                var stdOutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);

                await process.WaitForExitAsync(cancellationToken);

                var stdErr = await stdErrTask;
                var stdOut = await stdOutTask;

                if (process.ExitCode == 0)
                {
                    _logger.LogInformation("Daily database backup successfully created at {BackupPath}", outputPath);
                    CleanupOldBackups(backupDirectory, retentionDays: 7);
                }
                else
                {
                    _logger.LogError("pg_dump failed with exit code {ExitCode}. Error: {Error} | Output: {Output}",
                        process.ExitCode, stdErr, stdOut);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception occurred while executing pg_dump subprocess.");
            }
        }

        private void CleanupOldBackups(string directory, int retentionDays)
        {
            try
            {
                var cutoff = DateTime.UtcNow.AddDays(-retentionDays);
                var files = Directory.GetFiles(directory, "ShoeFactoryDb-*.dump");
                foreach (var file in files)
                {
                    var fi = new FileInfo(file);
                    if (fi.CreationTimeUtc < cutoff)
                    {
                        fi.Delete();
                        _logger.LogInformation("Purged old backup file: {FileName}", fi.Name);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup old backup files in {Directory}", directory);
            }
        }
    }
}