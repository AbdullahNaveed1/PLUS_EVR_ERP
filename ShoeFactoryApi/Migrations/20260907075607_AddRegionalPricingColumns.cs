using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class AddRegionalPricingColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Price",
                table: "Products",
                newName: "price_sindh");

            migrationBuilder.AddColumn<decimal>(
                name: "price_punjab",
                table: "Products",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "price_punjab",
                table: "Products");

            migrationBuilder.RenameColumn(
                name: "price_sindh",
                table: "Products",
                newName: "Price");
        }
    }
}
