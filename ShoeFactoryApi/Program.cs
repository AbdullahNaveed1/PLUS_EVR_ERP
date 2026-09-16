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

// 1. Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Safety net: if any model ever has a circular navigation property
        // (like Worker <-> WagePayment), don't let it crash serialization with a 500.
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddHostedService<DailyDatabaseBackupService>();

// 2. Configure PostgreSQL Database Connection (Safe Port Parsing & Railway Priority)
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

// 3. Configure JWT Authentication
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

// 4. Configure CORS
builder.Services.AddCors(options =>
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

// Automatically provision database tables and ensure admin credentials are correct on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FactoryDbContext>();
    db.Database.EnsureCreated();

    // TEMPORARY FIX: Force reset admin password to "Password123!" using correct BCrypt hashing
    var adminUser = db.Users.FirstOrDefault(u => u.Username == "admin");
    if (adminUser != null)
    {
        adminUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password123!");
        db.SaveChanges();
    }
}

// 5. Configure the HTTP request pipeline
app.UseCors("AllowAll");

// --- CRITICAL FOR FRONTEND BUNDLING & STATIC FILES ---
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// JSON Export Endpoint for Backup Portability
app.MapGet("/api/backup/download", async (FactoryDbContext db) =>
{
    var snapshot = new
    {
        ExportedAt = DateTime.UtcNow,
        Products = await db.Products.AsNoTracking().ToListAsync(),
        Customers = await db.Customers.AsNoTracking().ToListAsync(),
        Sales = await db.Sales.AsNoTracking().ToListAsync(),
        Expenses = await db.Expenses.AsNoTracking().ToListAsync(),
        Payments = await db.Payments.AsNoTracking().ToListAsync()
    };

    var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
    var bytes = Encoding.UTF8.GetBytes(json);
    
    return Results.File(bytes, "application/json", $"plus-evr-erp-backup-{DateTime.UtcNow:yyyy-MM-dd}.json");
});

// Fallback route for React SPA single-page routing
app.MapFallbackToFile("index.html");

app.Run();
