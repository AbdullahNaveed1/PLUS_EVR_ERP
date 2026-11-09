using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Data
{
    public class FactoryDbContext : DbContext
    {
        // Supplies the signed-in username for the audit log; absent at design time and startup
        private readonly IHttpContextAccessor? _httpContextAccessor;

        public FactoryDbContext(DbContextOptions<FactoryDbContext> options) : base(options) { }

        public FactoryDbContext(DbContextOptions<FactoryDbContext> options, IHttpContextAccessor httpContextAccessor)
            : base(options)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public DbSet<Product> Products => Set<Product>();
        public DbSet<Article> Articles => Set<Article>();
        public DbSet<ProductPriceHistory> ProductPriceHistories => Set<ProductPriceHistory>();
        public DbSet<Customer> Customers => Set<Customer>();
        public DbSet<Sale> Sales => Set<Sale>();
        public DbSet<Expense> Expenses => Set<Expense>();
        public DbSet<Payment> Payments => Set<Payment>();
        public DbSet<Worker> Workers => Set<Worker>();
        public DbSet<WagePayment> WagePayments => Set<WagePayment>();
        public DbSet<User> Users => Set<User>();

        // ===== NEW =====
        public DbSet<RawMaterial> RawMaterials => Set<RawMaterial>();
        public DbSet<ProductionRecord> ProductionRecords => Set<ProductionRecord>();
        public DbSet<BomEntry> BomEntries => Set<BomEntry>();
        public DbSet<MaterialEntry> MaterialEntries => Set<MaterialEntry>();
        public DbSet<MaterialCount> MaterialCounts => Set<MaterialCount>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Product -> Article (optional)
            modelBuilder.Entity<Product>()
                .HasOne(p => p.Article)
                .WithMany(a => a.Variants)
                .HasForeignKey(p => p.ArticleId)
                .OnDelete(DeleteBehavior.SetNull);

            // FIX #26 — ProductPriceHistory cascade so DeleteProduct works
            modelBuilder.Entity<ProductPriceHistory>()
                .HasOne(h => h.Product)
                .WithMany()
                .HasForeignKey(h => h.ProductId)
                .OnDelete(DeleteBehavior.Cascade);

            // Worker -> WagePayment cascade
            modelBuilder.Entity<WagePayment>()
                .HasOne(p => p.Worker)
                .WithMany(w => w.WagePayments)
                .HasForeignKey(p => p.WorkerId)
                .OnDelete(DeleteBehavior.Cascade);

            // FIX #27 — jsonb column for line items
            modelBuilder.Entity<Sale>()
                .Property(s => s.LineItemsJson)
                .HasColumnType("jsonb");

            // Money precision
            modelBuilder.Entity<Product>().Property(p => p.PricePunjab).HasPrecision(18, 2);
            modelBuilder.Entity<Product>().Property(p => p.PriceSindh).HasPrecision(18, 2);
            modelBuilder.Entity<Sale>().Property(s => s.Total).HasPrecision(18, 2);
            modelBuilder.Entity<Sale>().Property(s => s.RawTotal).HasPrecision(18, 2);
            modelBuilder.Entity<Sale>().Property(s => s.Discount).HasPrecision(18, 2);
            modelBuilder.Entity<Payment>().Property(p => p.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<Expense>().Property(e => e.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<WagePayment>().Property(p => p.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<Customer>().Property(c => c.Balance).HasPrecision(18, 2);

            // FIX #25 — explicit phone linkage for customers
            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.Phone)
                .IsUnique(false);

            // ===== NEW: Raw Material / Production / BOM configuration =====

            // Cascade delete: removing a raw material removes its BOM entries
            modelBuilder.Entity<BomEntry>()
                .HasOne(b => b.RawMaterial)
                .WithMany()
                .HasForeignKey(b => b.RawMaterialId)
                .OnDelete(DeleteBehavior.Cascade);

            // Decimal precision (PostgreSQL-friendly)
            modelBuilder.Entity<RawMaterial>()
                .Property(m => m.UnitCost).HasPrecision(18, 4);

            modelBuilder.Entity<RawMaterial>()
                .Property(m => m.StockQty).HasPrecision(18, 4);

            modelBuilder.Entity<ProductionRecord>()
                .Property(p => p.Dozens).HasPrecision(18, 4);

            modelBuilder.Entity<ProductionRecord>()
                .Property(p => p.Pairs).HasPrecision(18, 4);

            modelBuilder.Entity<BomEntry>()
                .Property(b => b.QtyPerDozen).HasPrecision(18, 6);

            // Useful index — lookups by article on production and BOM
            modelBuilder.Entity<ProductionRecord>()
                .HasIndex(p => p.ArticleNumber);

            modelBuilder.Entity<BomEntry>()
                .HasIndex(b => b.ArticleNumber);

            // ===== Material Entry (goods receipt) =====
            modelBuilder.Entity<MaterialEntry>().Property(e => e.Quantity).HasPrecision(18, 4);
            modelBuilder.Entity<MaterialEntry>().Property(e => e.Rate).HasPrecision(18, 4);
            modelBuilder.Entity<MaterialEntry>().Property(e => e.Amount).HasPrecision(18, 2);
            modelBuilder.Entity<MaterialEntry>().HasIndex(e => e.Date);
            modelBuilder.Entity<MaterialEntry>().HasIndex(e => e.Material);

            // ===== Daily remaining-material counts: one per material per day =====
            modelBuilder.Entity<MaterialCount>().Property(c => c.RemainingQty).HasPrecision(18, 4);
            modelBuilder.Entity<MaterialCount>().HasIndex(c => new { c.Date, c.Material }).IsUnique();

            // ===== Audit log =====
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.At);
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.Entity);
            modelBuilder.Entity<AuditLog>().HasIndex(a => a.User);
        }

        // ===== Audit: every add / edit / delete saved through this context is recorded =====

        public override int SaveChanges(bool acceptAllChangesOnSuccess)
        {
            var pending = CollectAudit();
            var result = base.SaveChanges(acceptAllChangesOnSuccess);
            if (pending.Count > 0)
            {
                AuditLogs.AddRange(pending.Select(p => p.ToLog()));
                base.SaveChanges(acceptAllChangesOnSuccess);
            }
            return result;
        }

        public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
        {
            var pending = CollectAudit();
            var result = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
            if (pending.Count > 0)
            {
                AuditLogs.AddRange(pending.Select(p => p.ToLog()));
                await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
            }
            return result;
        }

        private string CurrentUser => _httpContextAccessor?.HttpContext?.User?.Identity?.Name ?? "system";

        // Old values are read before saving; new rows get their id and values after saving
        private List<PendingAudit> CollectAudit()
        {
            ChangeTracker.DetectChanges();
            var user = CurrentUser;
            var pending = new List<PendingAudit>();
            foreach (var entry in ChangeTracker.Entries())
            {
                if (entry.Entity is AuditLog) continue;
                switch (entry.State)
                {
                    case EntityState.Added:
                        pending.Add(new PendingAudit(entry, "create", user, null));
                        break;
                    case EntityState.Deleted:
                        pending.Add(new PendingAudit(entry, "delete", user, Serialize(Values(entry, original: true))));
                        break;
                    case EntityState.Modified:
                        var modified = entry.Properties.Where(p => p.IsModified).ToList();
                        // A record attached as "modified" without loading it has no real old values; read them from the database
                        var stored = modified.Count > 0 && modified.All(p => Equals(p.OriginalValue, p.CurrentValue))
                            ? entry.GetDatabaseValues()
                            : null;
                        var changed = modified
                            .Select(p => (Property: p, Old: stored != null ? stored[p.Metadata] : p.OriginalValue))
                            .Where(x => !Equals(x.Old, x.Property.CurrentValue))
                            .ToDictionary(x => x.Property.Metadata.Name, x => (object?)new { old = Mask(x.Property, x.Old), @new = Mask(x.Property, x.Property.CurrentValue) });
                        if (changed.Count > 0) pending.Add(new PendingAudit(entry, "update", user, Serialize(changed)));
                        break;
                }
            }
            return pending;
        }

        private static Dictionary<string, object?> Values(EntityEntry entry, bool original) =>
            entry.Properties.ToDictionary(p => p.Metadata.Name, p => Mask(p, original ? p.OriginalValue : p.CurrentValue));

        // Password hashes are never copied into the log
        private static object? Mask(PropertyEntry property, object? value) =>
            property.Metadata.Name.Contains("Password", StringComparison.OrdinalIgnoreCase) ? "***" : value;

        private static string Serialize(object value) => JsonSerializer.Serialize(value);

        private sealed class PendingAudit
        {
            private readonly EntityEntry _entry;
            private readonly string _action;
            private readonly string _user;
            private readonly string? _changes;
            private readonly string? _keyBefore;

            public PendingAudit(EntityEntry entry, string action, string user, string? changes)
            {
                _entry = entry;
                _action = action;
                _user = user;
                _changes = changes;
                _keyBefore = action == "create" ? null : KeyOf(entry);
            }

            public AuditLog ToLog() => new AuditLog
            {
                At = DateTime.UtcNow,
                User = _user,
                Action = _action,
                Entity = _entry.Metadata.ClrType.Name,
                EntityId = _keyBefore ?? KeyOf(_entry),
                Changes = _changes ?? Serialize(Values(_entry, original: false))
            };

            private static string? KeyOf(EntityEntry entry) =>
                entry.Metadata.FindPrimaryKey() is { } key
                    ? string.Join(",", key.Properties.Select(p => entry.Property(p.Name).CurrentValue))
                    : null;
        }
    }
}