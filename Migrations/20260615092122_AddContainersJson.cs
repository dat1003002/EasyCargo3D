using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EasyCargo3D.Migrations
{
    /// <inheritdoc />
    public partial class AddContainersJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContainersJson",
                table: "Plans",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContainersJson",
                table: "Plans");
        }
    }
}
