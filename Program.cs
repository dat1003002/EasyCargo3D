using EasyCargo3D.Data;
using EasyCargo3D.Repositories;
using EasyCargo3D.Services;
using EasyCargo3D.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// DI
builder.Services.AddScoped<IContainerTypeRepository, ContainerTypeRepository>();
builder.Services.AddScoped<IContainerTypeService, ContainerTypeService>();
builder.Services.AddScoped<IPalletTypeRepository, PalletTypeRepository>();
builder.Services.AddScoped<IPalletTypeService, PalletTypeService>();

builder.Services.AddControllersWithViews();

var app = builder.Build();

// Auto migrate + seed khi khởi động
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
provider.Mappings[".glb"] = "model/gltf-binary";
provider.Mappings[".gltf"] = "model/gltf+json";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = provider });

app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
