using EasyCargo3D.Data;
using EasyCargo3D.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Controllers
{
    [Authorize(Roles = Roles.Admin)]
    public class WorkshopsController : Controller
    {
        private readonly AppDbContext _db;
        public WorkshopsController(AppDbContext db) { _db = db; }

        public async Task<IActionResult> Index()
            => View(await _db.Workshops.OrderBy(w => w.Name).ToListAsync());

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Save(int id, string name, string code)
        {
            name = (name ?? "").Trim(); code = (code ?? "").Trim();
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(code))
            { TempData["Err"] = "Nhập đủ tên và mã xưởng."; return RedirectToAction("Index"); }

            if (id == 0)
            {
                if (await _db.Workshops.AnyAsync(w => w.Code == code))
                { TempData["Err"] = "Mã xưởng đã tồn tại."; return RedirectToAction("Index"); }
                _db.Workshops.Add(new Workshop { Name = name, Code = code });
            }
            else
            {
                var w = await _db.Workshops.FindAsync(id);
                if (w != null) { w.Name = name; w.Code = code; }
            }
            await _db.SaveChangesAsync();
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            var w = await _db.Workshops.FindAsync(id);
            if (w != null)
            {
                bool used = await _db.Plans.AnyAsync(p => p.WorkshopId == id);
                if (used) { TempData["Err"] = "Xưởng đang có kế hoạch, không thể xóa."; return RedirectToAction("Index"); }
                _db.Workshops.Remove(w);
                await _db.SaveChangesAsync();
            }
            return RedirectToAction("Index");
        }
    }
}
