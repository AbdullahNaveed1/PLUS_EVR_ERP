using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class CountNomiAdvanceOf7Nov : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CountInHisab",
                table: "WagePayments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Nomi's Rs 200 advance of 07-11-2026 (before the 9 November start) still comes off the first week
            migrationBuilder.Sql(@"
                UPDATE ""WagePayments"" p SET ""CountInHisab"" = true
                FROM ""Workers"" w
                WHERE w.""Id"" = p.""WorkerId"" AND lower(trim(w.""Name"")) = 'nomi'
                  AND p.""Kind"" = 'advance' AND p.""Amount"" = 200
                  AND ((p.""PaymentDate"" AT TIME ZONE 'UTC') + interval '5 hours')::date = DATE '2026-11-07';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CountInHisab",
                table: "WagePayments");
        }
    }
}
