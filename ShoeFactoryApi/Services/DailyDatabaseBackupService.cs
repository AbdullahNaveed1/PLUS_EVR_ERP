using System.Diagnostics;
using Npgsql;

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
            while (!stoppingToken.IsCancellationRequested)
            {
                var now = DateTime.Now;
                var backupTime = TimeSpan.TryParse(_configuration["Backup:Time"], out var configuredTime)
                    ? configuredTime
                    : new TimeSpan(2, 0, 0);
                var nextRun = now.Date.Add(backupTime);
                if (nextRun <= now) nextRun = nextRun.AddDays(1);

                await Task.Delay(nextRun - now, stoppingToken);
                if (!stoppingToken.IsCancellationRequested)
                    await CreateBackupAsync(stoppingToken);
            }
        }

        private async Task CreateBackupAsync(CancellationToken cancellationToken)
        {
            var connectionString = _configuration.GetConnectionString("DefaultConnection");
            var backupDirectory = _configuration["Backup:Directory"] ?? "Backups";
            var pgDumpPath = _configuration["Backup:PgDumpPath"] ?? "pg_dump";
            Directory.CreateDirectory(backupDirectory);

            var fileName = $"ShoeFactoryDb-{DateTime.Now:yyyy-MM-dd}.dump";
            var outputPath = Path.GetFullPath(Path.Combine(backupDirectory, fileName));
            var startInfo = new ProcessStartInfo
            {
                FileName = pgDumpPath,
                Arguments = $"--format=custom --file=\"{outputPath}\" --dbname=\"{connectionString}\"",
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(startInfo);
            if (process == null)
            {
                _logger.LogError("Could not start pg_dump. Configure Backup:PgDumpPath or add PostgreSQL tools to PATH.");
                return;
            }

            await process.WaitForExitAsync(cancellationToken);
            if (process.ExitCode == 0)
                _logger.LogInformation("Daily database backup created at {BackupPath}", outputPath);
            else
                _logger.LogError("pg_dump failed: {Error}", await process.StandardError.ReadToEndAsync(cancellationToken));
        }
    }
}
