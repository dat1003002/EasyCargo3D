using EasyCargo3D.Data;
using EasyCargo3D.Repositories;
using EasyCargo3D.Services;
using EasyCargo3D.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

// SQL Server
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// DI
builder.Services.AddScoped<IContainerTypeRepository, ContainerTypeRepository>();
builder.Services.AddScoped<IContainerTypeService, ContainerTypeService>();
builder.Services.AddScoped<IPalletTypeRepository, PalletTypeRepository>();
builder.Services.AddScoped<IPalletTypeService, PalletTypeService>();
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();

// Đăng nhập bằng cookie
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.LoginPath = "/Account/Login";
        o.AccessDeniedPath = "/Account/Denied";
        o.ExpireTimeSpan = TimeSpan.FromHours(8);
        o.SlidingExpiration = true;
    });
builder.Services.AddAuthorization();

// Mặc định: mọi trang đều yêu cầu đăng nhập (trừ chỗ có [AllowAnonymous])
builder.Services.AddControllersWithViews(o =>
{
    var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    o.Filters.Add(new AuthorizeFilter(policy));
});

var app = builder.Build();

// Auto migrate + seed khi khởi động
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // Seed xưởng + tài khoản admin mặc định nếu chưa có
    if (!db.Workshops.Any())
        db.Workshops.Add(new Workshop { Name = "Xưởng chính", Code = "MAIN" });
    db.SaveChanges();

    if (!db.Users.Any())
    {
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();
        var admin = new AppUser { Username = "admin", FullName = "Quản trị viên", Role = Roles.Admin, IsActive = true };
        admin.PasswordHash = hasher.HashPassword(admin, "admin123");
        var firstWs = db.Workshops.First();
        admin.UserWorkshops.Add(new UserWorkshop { WorkshopId = firstWs.Id });
        db.Users.Add(admin);
        db.SaveChanges();
    }
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
provider.Mappings[".wasm"] = "application/wasm";
provider.Mappings[".traineddata"] = "application/octet-stream";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = provider });

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
