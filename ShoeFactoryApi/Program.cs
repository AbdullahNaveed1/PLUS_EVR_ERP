using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;
using Npgsql;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;
using ShoeFactoryApi.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Services
builder.Services.AddHttpContextAccessor();
builder.Services.AddControllers(options => options.Filters.Add<ShoeFactoryApi.Auth.AccessFilter>())
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.ReferenceHandler =
            System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

// 2. PostgreSQL connection
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Database connection string is not configured.");

if (connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
    connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
{
    var databaseUri = new Uri(connectionString);
    var credentials = databaseUri.UserInfo.Split(':', 2);
    connectionString = new NpgsqlConnectionStringBuilder
    {
        Host = databaseUri.Host,
        Port = databaseUri.Port > 0 ? databaseUri.Port : 5432,
        Database = databaseUri.AbsolutePath.TrimStart('/'),
        Username = Uri.UnescapeDataString(credentials[0]),
        Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : string.Empty,
        SslMode = SslMode.Require,
        TrustServerCertificate = true
    }.ConnectionString;
}

builder.Services.AddDbContext<FactoryDbContext>(options =>
    options.UseNpgsql(connectionString));

// 3. JWT
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT signing key is not configured. Set the Jwt__Key environment variable in Railway.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

// FIX #24 — register the inventory service (was referenced but not registered here)
builder.Services.AddScoped<IInventoryService, InventoryService>();

// Nightly backup email; stays off until BACKUP_EMAIL_TO / SMTP_USER / SMTP_PASSWORD are set
builder.Services.AddHostedService<BackupEmailService>();
// Every Sunday: restores a fresh backup into a temporary schema and checks nothing is missing; emails on failure
builder.Services.AddHostedService<RestoreTestService>();

var app = builder.Build();

// FIX #16 + #17 — Migrate instead of EnsureCreated; seed admin only once
// NOTE: This block also applies any new migrations on startup, including the
// three new tables (RawMaterials, ProductionRecords, BomEntries).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
    db.Database.Migrate();   // NOT EnsureCreated()

    // One-time user reset: when RESET_ADMIN_PASSWORD is set, delete every existing login and
    // recreate only the Ali and Abdullah admin accounts with that password.
    // Remove the variable after the first successful deploy, or every restart will reset users again.
    var resetPassword = Environment.GetEnvironmentVariable("RESET_ADMIN_PASSWORD");
    if (!string.IsNullOrWhiteSpace(resetPassword))
    {
        db.Users.RemoveRange(db.Users);
        foreach (var name in new[] { "Ali", "Abdullah" })
        {
            db.Users.Add(new User
            {
                Username = name,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(resetPassword),
                Role = "Admin"
            });
        }
        db.SaveChanges();
    }

    // Seed a default admin only on an empty database, so it never comes back after a reset
    if (!db.Users.Any())
    {
        var initialPassword = Environment.GetEnvironmentVariable("ADMIN_INITIAL_PASSWORD") ?? "ChangeMe_OnFirstLogin!";
        db.Users.Add(new User
        {
            Username = "admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(initialPassword),
            Role = "Admin"
        });
        db.SaveChanges();
    }
}

app.UseCors("AllowAll");
// index.html is checked with the server on every load so an update shows at once;
// the hashed assets/ files it points to can stay cached
var staticFiles = new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    }
};
app.UseDefaultFiles();
app.UseStaticFiles(staticFiles);
app.UseAuthentication();
app.UseAuthorization();

// A save into a closed month is refused with a plain message instead of a server error
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (PeriodClosedException ex) when (!context.Response.HasStarted)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { message = ex.Message, periodClosed = true });
    }
});
app.MapControllers();

// Backups (download, email now, status) are in BackupController, Admin only

app.MapFallbackToFile("index.html", staticFiles);
app.Run();