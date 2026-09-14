using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Data
{
    public class FactoryDbContext : DbContext
    {
        public FactoryDbContext(DbContextOptions<FactoryDbContext> options) : base(options) { }

        public DbSet<Product> Products { get; set; }
        public DbSet<Article> Articles { get; set; }
        public DbSet<Customer> Customers { get; set; }
        public DbSet<Expense> Expenses { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<ProductPriceHistory> ProductPriceHistories { get; set; }
        public DbSet<Worker> Workers { get; set; }
        public DbSet<WagePayment> WagePayments { get; set; }
        public DbSet<Sale> Sales { get; set; }
        public DbSet<Payment> Payments { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Article>()
                .HasIndex(article => article.ArticleNumber)
                .IsUnique();

            modelBuilder.Entity<Product>()
                .HasOne(product => product.Article)
                .WithMany(article => article.Variants)
                .HasForeignKey(product => product.ArticleId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<ProductPriceHistory>()
                .HasOne(history => history.Product)
                .WithMany()
                .HasForeignKey(history => history.ProductId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<WagePayment>()
                .HasOne(payment => payment.Worker)
                .WithMany(worker => worker.WagePayments)
                .HasForeignKey(payment => payment.WorkerId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}