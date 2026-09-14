using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
                migrationBuilder.AddColumn<string>(
                    name: "Description",
                    table: "Customers",
                    type: "text",
                    nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
                migrationBuilder.DropColumn(
                    name: "Description",
                    table: "Customers");
        }
    }
}
