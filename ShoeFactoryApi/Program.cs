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
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.ReferenceHandler =
            System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddHostedService<DailyDatabaseBackupService>();

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

var app = builder.Build();

// FIX #16 + #17 — Migrate instead of EnsureCreated; seed admin only once
// NOTE: This block also applies any new migrations on startup, including the
// three new tables (RawMaterials, ProductionRecords, BomEntries).
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
    db.Database.Migrate();   // NOT EnsureCreated()

    if (!db.Users.Any(u => u.Username == "admin"))
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
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// FIX #18 — backup now includes every table and requires no auth concerns (keep as-is if intended public)
app.MapGet("/api/backup/download", async (FactoryDbContext db) =>
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

        // ===== NEW =====
        RawMaterials = await db.RawMaterials.AsNoTracking().ToListAsync(),
        ProductionRecords = await db.ProductionRecords.AsNoTracking().ToListAsync(),
        BomEntries = await db.BomEntries.AsNoTracking().ToListAsync()
    };

    var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
    var bytes = Encoding.UTF8.GetBytes(json);
    return Results.File(bytes, "application/json", $"plus-evr-erp-backup-{DateTime.UtcNow:yyyy-MM-dd}.json");
});

app.MapFallbackToFile("index.html");
app.Run();