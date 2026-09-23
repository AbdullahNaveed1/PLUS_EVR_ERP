using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Data
{
    public class FactoryDbContext : DbContext
    {
        public FactoryDbContext(DbContextOptions<FactoryDbContext> options) : base(options) { }

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
        }
    }
}