using EasyCargo3D.Data;
using EasyCargo3D.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Controllers
{
    [Authorize(Roles = Roles.Admin)]
    public class UsersController : Controller
    {
        private readonly AppDbContext _db;
        private readonly IPasswordHasher<AppUser> _hasher;
        public UsersController(AppDbContext db, IPasswordHasher<AppUser> hasher) { _db = db; _hasher = hasher; }

        public async Task<IActionResult> Index()
        {
            var users = await _db.Users
                .Include(u => u.UserWorkshops).ThenInclude(uw => uw.Workshop)
                .OrderBy(u => u.Username).ToListAsync();
            ViewBag.Workshops = await _db.Workshops.OrderBy(w => w.Name).ToListAsync();
            return View(users);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Save(int id, string username, string fullName, string role,
            string? password, bool isActive, int[]? workshopIds)
        {
            username = (username ?? "").Trim();
            if (string.IsNullOrEmpty(username)) { TempData["Err"] = "Nhập tên tài khoản."; return RedirectToAction("Index"); }
            if (!Roles.All.Contains(role)) role = Roles.Viewer;
            workshopIds ??= System.Array.Empty<int>();

            AppUser user;
            if (id == 0)
            {
                if (await _db.Users.AnyAsync(u => u.Username == username))
                { TempData["Err"] = "Tài khoản đã tồn tại."; return RedirectToAction("Index"); }
                if (string.IsNullOrEmpty(password))
                { TempData["Err"] = "Tài khoản mới phải có mật khẩu."; return RedirectToAction("Index"); }
                user = new AppUser { Username = username };
                _db.Users.Add(user);
            }
            else
            {
                user = await _db.Users.Include(u => u.UserWorkshops).FirstAsync(u => u.Id == id);
            }

            user.FullName = (fullName ?? "").Trim();
            user.Role = role;
            user.IsActive = isActive;
            if (!string.IsNullOrEmpty(password))
                user.PasswordHash = _hasher.HashPassword(user, password);

            // cập nhật xưởng
            user.UserWorkshops.Clear();
            foreach (var wid in workshopIds.Distinct())
                user.UserWorkshops.Add(new UserWorkshop { WorkshopId = wid });

            await _db.SaveChangesAsync();
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user != null)
            {
                if (user.Username == "admin") { TempData["Err"] = "Không thể xóa tài khoản admin gốc."; return RedirectToAction("Index"); }
                _db.Users.Remove(user);
                await _db.SaveChangesAsync();
            }
            return RedirectToAction("Index");
        }
    }
}
