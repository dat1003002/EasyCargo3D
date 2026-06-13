using EasyCargo3D.Models;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<ContainerType> ContainerTypes { get; set; }
        public DbSet<PalletType>    PalletTypes    { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<ContainerType>(e =>
            {
                e.HasIndex(x => x.Code).IsUnique();
                e.Property(x => x.Length).HasPrecision(10, 2);
                e.Property(x => x.Width).HasPrecision(10, 2);
                e.Property(x => x.Height).HasPrecision(10, 2);
                e.Property(x => x.MaxWeight).HasPrecision(10, 2);
            });

            // Seed dữ liệu mặc định
            modelBuilder.Entity<ContainerType>().HasData(
                new ContainerType { Id = 1, Code = "20ft",  Name = "20ft Standard",  Length = 585,  Width = 235, Height = 228, MaxWeight = 28200, Icon = "&#x1F6A2;", SortOrder = 1 },
                new ContainerType { Id = 2, Code = "40ft",  Name = "40ft Standard",  Length = 1185, Width = 235, Height = 228, MaxWeight = 26750, Icon = "&#x1F6A2;", SortOrder = 2 },
                new ContainerType { Id = 3, Code = "40hc",  Name = "40ft High Cube", Length = 1185, Width = 235, Height = 268, MaxWeight = 26460, Icon = "&#x1F4E6;", SortOrder = 3 },
                new ContainerType { Id = 4, Code = "45hc",  Name = "45ft High Cube", Length = 1351, Width = 235, Height = 269, MaxWeight = 27600, Icon = "&#x1F4E6;", SortOrder = 4 },
                new ContainerType { Id = 5, Code = "truck", Name = "Truck 13.6m",    Length = 1360, Width = 240, Height = 270, MaxWeight = 24000, Icon = "&#x1F69B;", SortOrder = 5 }
            );

            modelBuilder.Entity<PalletType>(e =>
            {
                e.HasIndex(x => x.Code).IsUnique();
                e.Property(x => x.Length).HasPrecision(10, 2);
                e.Property(x => x.Width).HasPrecision(10, 2);
                e.Property(x => x.Height).HasPrecision(10, 2);
                e.Property(x => x.Weight).HasPrecision(10, 2);
            });

            modelBuilder.Entity<PalletType>().HasData(
                new PalletType { Id = 1, Code = "euro",   Name = "Euro Pallet 120x80",   Length = 120, Width = 80,  Height = 144, Weight = 500, Color = "#F39C12", SortOrder = 1 },
                new PalletType { Id = 2, Code = "amer",   Name = "American Pallet 120x100", Length = 120, Width = 100, Height = 144, Weight = 600, Color = "#3498DB", SortOrder = 2 },
                new PalletType { Id = 3, Code = "half",   Name = "Half Pallet 60x80",    Length = 60,  Width = 80,  Height = 100, Weight = 250, Color = "#2ECC71", SortOrder = 3 },
                new PalletType { Id = 4, Code = "ind",    Name = "Industrial 120x120",   Length = 120, Width = 120, Height = 150, Weight = 700, Color = "#E74C3C", SortOrder = 4 },
                new PalletType { Id = 5, Code = "custom", Name = "Custom Box",           Length = 52,  Width = 40,  Height = 86,  Weight = 0,   Color = "#9B59B6", SortOrder = 5 }
            );
        }
    }
}
