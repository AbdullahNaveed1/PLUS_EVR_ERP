using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Proves a backup can be loaded back: builds the same JSON backup that is emailed, loads every table of it
    /// into a temporary schema shaped like the real tables, and checks row counts and money / stock totals
    /// against the live data read in the same snapshot. The temporary schema is always dropped afterwards.
    /// </summary>
    public static class RestoreTest
    {
        private const string Schema = "restore_test";

        // Backups leave out password hashes, so logins are only counted
        private static readonly HashSet<string> CountOnly = new() { "Users" };

        // Totals compared between the live data and the restored copy
        private static readonly (string Table, string Column)[] Totals =
        {
            ("Sales", "Total"), ("Payments", "Amount"), ("Expenses", "Amount"), ("WagePayments", "Amount"),
            ("SupplierPayments", "Amount"), ("SalesReturns", "Total"), ("Products", "Qty"), ("MaterialEntries", "Quantity")
        };

        public sealed record Result(bool Passed, string Summary, List<string> Problems);

        public static async Task<Result> RunAsync(FactoryDbContext db, CancellationToken ct = default)
        {
            var problems = new List<string>();
            var conn = (NpgsqlConnection)db.Database.GetDbConnection();
            var openedHere = conn.State != ConnectionState.Open;
            if (openedHere) await conn.OpenAsync(ct);
            try
            {
                // 1. Backup and live figures from one snapshot, so they must match exactly
                byte[] json;
                var liveCounts = new Dictionary<string, long>();
                var liveTotals = new Dictionary<string, decimal>();
                await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct))
                {
                    var dbTx = (NpgsqlTransaction)tx.GetDbTransaction();
                    json = await BackupBuilder.BuildJsonAsync(db, ct);
                    using var names = JsonDocument.Parse(json);
                    foreach (var table in Tables(names.RootElement).Select(t => t.Name))
                    {
                        if (!await TableExists(conn, dbTx, "public", table, ct)) { problems.Add($"{table}: in the backup but not in the database."); continue; }
                        liveCounts[table] = Convert.ToInt64(await Scalar(conn, dbTx, $"SELECT count(*) FROM public.\"{table}\"", ct));
                    }
                    // A table the backup leaves out entirely would be lost
                    await using (var cmd = new NpgsqlCommand("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'", conn, dbTx))
                    await using (var reader = await cmd.ExecuteReaderAsync(ct))
                        while (await reader.ReadAsync(ct))
                        {
                            var table = reader.GetString(0);
                            if (table != "__EFMigrationsHistory" && !names.RootElement.TryGetProperty(table, out _)) problems.Add($"Table {table} is not in the backup.");
                        }
                    foreach (var (table, column) in Totals.Where(t => liveCounts.ContainsKey(t.Table)))
                        liveTotals[$"{table}.{column}"] = Convert.ToDecimal(await Scalar(conn, dbTx, $"SELECT COALESCE(SUM(\"{column}\"), 0) FROM public.\"{table}\"", ct));
                    await tx.CommitAsync(ct);
                }

                // 2. Load every table of the backup into the temporary schema
                using var doc = JsonDocument.Parse(json);
                await Exec(conn, $"DROP SCHEMA IF EXISTS {Schema} CASCADE; CREATE SCHEMA {Schema};", ct);
                long rows = 0;
                var tables = 0;
                try
                {
                    foreach (var (table, items) in Tables(doc.RootElement))
                    {
                        if (!liveCounts.TryGetValue(table, out var live)) continue;
                        tables++;
                        var inBackup = items.GetArrayLength();
                        if (inBackup != live) problems.Add($"{table}: backup has {inBackup} rows, database has {live}.");
                        if (CountOnly.Contains(table)) continue;

                        try
                        {
                            var restored = await Restore(conn, table, items, problems, ct);
                            rows += restored;
                            if (restored != inBackup) problems.Add($"{table}: {inBackup} rows in the backup but {restored} loaded back.");
                        }
                        catch (PostgresException ex)
                        {
                            problems.Add($"{table}: could not be loaded back ({ex.MessageText}).");
                        }
                    }

                    // 3. Money and stock totals of the restored copy match the live data
                    foreach (var (key, live) in liveTotals)
                    {
                        var (table, column) = (key.Split('.')[0], key.Split('.')[1]);
                        if (!await TableExists(conn, null, Schema, table, ct)) continue;
                        var restored = Convert.ToDecimal(await Scalar(conn, null, $"SELECT COALESCE(SUM(\"{column}\"), 0) FROM {Schema}.\"{table}\"", ct));
                        if (restored != live) problems.Add($"{table}: {column} adds up to {restored} restored but {live} live.");
                    }
                }
                finally
                {
                    await Exec(conn, $"DROP SCHEMA IF EXISTS {Schema} CASCADE;", ct);
                }

                var summary = problems.Count == 0
                    ? $"Passed: {tables} tables and {rows:N0} rows loaded back from a {json.Length / 1024.0:0.#} KB backup; counts and totals match."
                    : $"Failed: {problems.Count} problem(s) in {tables} tables.";
                return new Result(problems.Count == 0, summary, problems);
            }
            finally
            {
                if (openedHere) await conn.CloseAsync();
            }
        }

        /// <summary>Runs the test, writes the result to the audit log and emails the backup address if it failed.</summary>
        public static async Task<Result> RunAndRecordAsync(FactoryDbContext db, string user, CancellationToken ct = default)
        {
            Result result;
            try { result = await RunAsync(db, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                result = new Result(false, "Failed: the restore test stopped with an error.", new List<string> { ex.InnerException?.Message ?? ex.Message });
            }

            string? emailError = null;
            if (!result.Passed)
            {
                emailError = await BackupEmailService.SendNoticeAsync(BackupEmailService.ReadSettings(),
                    "PLUS EVR ERP: backup restore test FAILED",
                    $"The weekly backup restore test failed.\n\n{result.Summary}\n\n- {string.Join("\n- ", result.Problems.Take(30))}\n\n" +
                    "Your data is still in the database; this means a backup may not load back completely. Ask the developer to look at it.", ct);
            }

            db.AuditLogs.Add(new AuditLog
            {
                User = user,
                Action = result.Passed ? "restore_test_passed" : "restore_test_failed",
                Entity = "Backup",
                Changes = JsonSerializer.Serialize(new { result.Summary, problems = result.Problems.Take(30), emailError })
            });
            await db.SaveChangesAsync(ct);
            return result;
        }

        private static IEnumerable<(string Name, JsonElement Items)> Tables(JsonElement root) =>
            root.EnumerateObject().Where(p => p.Value.ValueKind == JsonValueKind.Array).Select(p => (p.Name, p.Value));

        // Copies the table's shape (columns, types, NOT NULL) and loads the backup rows into it by column name
        private static async Task<long> Restore(NpgsqlConnection conn, string table, JsonElement items, List<string> problems, CancellationToken ct)
        {
            var name = table.Replace("\"", "\"\"");
            await Exec(conn, $"CREATE TABLE {Schema}.\"{name}\" (LIKE public.\"{name}\" INCLUDING DEFAULTS);", ct);

            // A column the backup leaves out would come back empty
            if (items.GetArrayLength() > 0)
            {
                var columns = new List<string>();
                await using (var cmd = new NpgsqlCommand(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = @s AND table_name = @t ORDER BY ordinal_position", conn))
                {
                    cmd.Parameters.AddWithValue("s", Schema);
                    cmd.Parameters.AddWithValue("t", table);
                    await using var reader = await cmd.ExecuteReaderAsync(ct);
                    while (await reader.ReadAsync(ct)) columns.Add(reader.GetString(0));
                }
                var first = items[0];
                foreach (var column in columns.Where(c => !first.TryGetProperty(c, out _)))
                    problems.Add($"{table}.{column} is not in the backup.");
            }

            await using var insert = new NpgsqlCommand(
                $"INSERT INTO {Schema}.\"{name}\" SELECT * FROM jsonb_populate_recordset(NULL::{Schema}.\"{name}\", @rows)", conn) { CommandTimeout = 300 };
            insert.Parameters.Add(new NpgsqlParameter("rows", NpgsqlDbType.Jsonb) { Value = items.GetRawText() });
            return await insert.ExecuteNonQueryAsync(ct);
        }

        private static async Task<bool> TableExists(NpgsqlConnection conn, NpgsqlTransaction? tx, string schema, string table, CancellationToken ct)
        {
            await using var cmd = new NpgsqlCommand("SELECT to_regclass(@name) IS NOT NULL", conn, tx);
            cmd.Parameters.AddWithValue("name", $"{schema}.\"{table}\"");
            return (bool)(await cmd.ExecuteScalarAsync(ct))!;
        }

        private static async Task<object?> Scalar(NpgsqlConnection conn, NpgsqlTransaction? tx, string sql, CancellationToken ct)
        {
            await using var cmd = new NpgsqlCommand(sql, conn, tx);
            return await cmd.ExecuteScalarAsync(ct);
        }

        private static async Task Exec(NpgsqlConnection conn, string sql, CancellationToken ct)
        {
            await using var cmd = new NpgsqlCommand(sql, conn);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    /// <summary>Runs the restore test two minutes after every start (so each deploy is checked) and every Sunday at 3 AM Pakistan time.</summary>
    public class RestoreTestService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopes;
        private readonly ILogger<RestoreTestService> _logger;

        public RestoreTestService(IServiceScopeFactory scopes, ILogger<RestoreTestService> logger)
        {
            _scopes = scopes;
            _logger = logger;
        }

        public static TimeSpan UntilNextRun(DateTimeOffset nowUtc)
        {
            var nowPk = nowUtc.ToOffset(TimeSpan.FromHours(5));
            var next = new DateTimeOffset(nowPk.Year, nowPk.Month, nowPk.Day, 3, 0, 0, nowPk.Offset);
            next = next.AddDays(((int)DayOfWeek.Sunday - (int)nowPk.DayOfWeek + 7) % 7);
            if (next <= nowPk) next = next.AddDays(7);
            return next - nowPk;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var delay = TimeSpan.FromMinutes(2);
            while (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Next backup restore test in {Delay}.", delay);
                try { await Task.Delay(delay, stoppingToken); }
                catch (TaskCanceledException) { return; }

                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
                var result = await RestoreTest.RunAndRecordAsync(db, "system", stoppingToken);
                _logger.LogInformation("Backup restore test: {Summary}", result.Summary);
                delay = UntilNextRun(DateTimeOffset.UtcNow);
            }
        }
    }
}
