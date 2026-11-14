using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class AddPieceRateWages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "WagePayments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "advance");

            migrationBuilder.CreateTable(
                name: "WageRates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    WorkerId = table.Column<int>(type: "integer", nullable: false),
                    ArticleNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Size = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    RatePerDozen = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WageRates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WeeklySettlements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    WorkerId = table.Column<int>(type: "integer", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Earned = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Advances = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CarryIn = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Final = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Paid = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CarryOut = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    WagePaymentId = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeeklySettlements", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WageRates_WorkerId",
                table: "WageRates",
                column: "WorkerId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklySettlements_WorkerId_WeekStart",
                table: "WeeklySettlements",
                columns: new[] { "WorkerId", "WeekStart" },
                unique: true);

            // Set up the two piece-rate workers with the rates agreed on 13-11-2026 (only if they have none yet):
            // Cheema (machine man): article 512 size 7/10 = Rs 55 / dozen, everything else = Rs 38 / dozen
            // Nomi (safai): everything = Rs 50 / dozen
            migrationBuilder.Sql(@"
                INSERT INTO ""Workers"" (""Name"", ""Phone"", ""Role"", ""IsActive"", ""CreatedAt"")
                SELECT 'Cheema', '', 'Machine Man', true, now()
                WHERE NOT EXISTS (SELECT 1 FROM ""Workers"" WHERE lower(trim(""Name"")) = 'cheema');

                INSERT INTO ""Workers"" (""Name"", ""Phone"", ""Role"", ""IsActive"", ""CreatedAt"")
                SELECT 'Nomi', '', 'Safai', true, now()
                WHERE NOT EXISTS (SELECT 1 FROM ""Workers"" WHERE lower(trim(""Name"")) = 'nomi');

                INSERT INTO ""WageRates"" (""WorkerId"", ""ArticleNumber"", ""Size"", ""RatePerDozen"", ""CreatedAt"")
                SELECT w.""Id"", r.article, r.size, r.rate, now()
                FROM (SELECT ""Id"" FROM ""Workers"" WHERE lower(trim(""Name"")) = 'cheema' ORDER BY ""Id"" LIMIT 1) w
                CROSS JOIN (VALUES ('512', '7/10', 55.0), (NULL, NULL, 38.0)) AS r(article, size, rate)
                WHERE NOT EXISTS (SELECT 1 FROM ""WageRates"" x WHERE x.""WorkerId"" = w.""Id"");

                INSERT INTO ""WageRates"" (""WorkerId"", ""ArticleNumber"", ""Size"", ""RatePerDozen"", ""CreatedAt"")
                SELECT w.""Id"", NULL, NULL, 50.0, now()
                FROM (SELECT ""Id"" FROM ""Workers"" WHERE lower(trim(""Name"")) = 'nomi' ORDER BY ""Id"" LIMIT 1) w
                WHERE NOT EXISTS (SELECT 1 FROM ""WageRates"" x WHERE x.""WorkerId"" = w.""Id"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WageRates");

            migrationBuilder.DropTable(
                name: "WeeklySettlements");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "WagePayments");
        }
    }
}
