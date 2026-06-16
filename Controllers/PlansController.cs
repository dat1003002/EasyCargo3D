using System.Security.Claims;
using System.Text.Json;
using EasyCargo3D.Data;
using EasyCargo3D.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Controllers
{
    [Authorize]
    public class PlansController : Controller
    {
        private readonly AppDbContext _db;
        public PlansController(AppDbContext db) { _db = db; }

        private int CurrentUserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
        private bool IsAdmin => User.IsInRole(Roles.Admin);
        private bool CanManage => User.IsInRole(Roles.Admin) || User.IsInRole(Roles.Manager);

        private async Task<List<int>> MyWorkshopIdsAsync()
            => await _db.UserWorkshops.Where(uw => uw.UserId == CurrentUserId).Select(uw => uw.WorkshopId).ToListAsync();

        public async Task<IActionResult> Index()
        {
            var q = _db.Plans.Include(p => p.Workshop).Include(p => p.CreatedBy).Include(p => p.Assignee).AsQueryable();
            if (!IsAdmin)
            {
                int uid = CurrentUserId;
                q = q.Where(p => _db.UserWorkshops.Any(uw => uw.UserId == uid && uw.WorkshopId == p.WorkshopId) || p.AssigneeId == uid);
            }
            var plans = await q.OrderByDescending(p => p.UpdatedAt).ToListAsync();

            // dữ liệu cho dropdown giao việc
            ViewBag.CanManage = CanManage;
            ViewBag.IsAdmin = IsAdmin;
            ViewBag.CurrentUserId = CurrentUserId;
            ViewBag.Executors = await _db.Users
                .Where(u => u.IsActive && (u.Role == Roles.Executor || u.Role == Roles.Manager))
                .OrderBy(u => u.FullName).ToListAsync();
            return View(plans);
        }

        // Danh sách kế hoạch (JSON) cho panel bên trái. scope = active | done | all
        [HttpGet]
        public async Task<IActionResult> ListJson(string scope = "active")
        {
            var q = _db.Plans.Include(p => p.Workshop).Include(p => p.CreatedBy).Include(p => p.Assignee).AsQueryable();
            if (!IsAdmin)
            {
                int uid = CurrentUserId;
                q = q.Where(p => _db.UserWorkshops.Any(uw => uw.UserId == uid && uw.WorkshopId == p.WorkshopId) || p.AssigneeId == uid);
            }
            if (scope == "active") q = q.Where(p => p.Status != PlanStatus.Done);
            else if (scope == "done") q = q.Where(p => p.Status == PlanStatus.Done);

            // Tải về rồi map trong bộ nhớ (tránh lỗi dịch LINQ)
            var rows = await q.OrderByDescending(p => p.UpdatedAt).Take(100).ToListAsync();
            string NameOf(AppUser? u) => u == null ? "" : (string.IsNullOrEmpty(u.FullName) ? u.Username : u.FullName);
            var list = rows.Select(p => new {
                p.Id, p.Name, p.ContainerType, p.Status,
                workshop  = p.Workshop?.Name ?? "",
                creator   = NameOf(p.CreatedBy),
                assignee  = p.AssigneeId == null ? null : NameOf(p.Assignee),
                updatedAt = p.UpdatedAt
            }).ToList();
            return Json(list);
        }

        // Dữ liệu cho hộp thoại "Lưu kế hoạch" trên màn hình 3D
        [HttpGet]
        public async Task<IActionResult> SaveMeta()
        {
            var workshops = IsAdmin
                ? await _db.Workshops.OrderBy(w => w.Name).Select(w => new { w.Id, w.Name }).ToListAsync()
                : await _db.UserWorkshops.Where(uw => uw.UserId == CurrentUserId)
                    .Select(uw => new { uw.Workshop!.Id, uw.Workshop.Name }).ToListAsync();
            var executors = await _db.Users
                .Where(u => u.IsActive && (u.Role == Roles.Executor || u.Role == Roles.Manager))
                .OrderBy(u => u.FullName)
                .Select(u => new { u.Id, Name = string.IsNullOrEmpty(u.FullName) ? u.Username : u.FullName })
                .ToListAsync();
            return Json(new { canSave = CanManage, workshops, executors });
        }

        // Lưu kế hoạch mới (từ màn hình 3D) — chỉ Quản lý/Admin
        [HttpPost]
        [Authorize(Roles = Roles.Admin + "," + Roles.Manager)]
        public async Task<IActionResult> Save([FromBody] SavePlanDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Thiếu tên kế hoạch");
            // kiểm tra quyền theo xưởng (Manager chỉ lưu cho xưởng của mình)
            if (!IsAdmin)
            {
                var mine = await MyWorkshopIdsAsync();
                if (!mine.Contains(dto.WorkshopId)) return Forbid();
            }
            var plan = new PlanEntity
            {
                Name = dto.Name.Trim(),
                ContainerType = dto.ContainerType ?? "",
                WorkshopId = dto.WorkshopId,
                CreatedById = CurrentUserId,
                AssigneeId = dto.AssigneeId,
                Status = PlanStatus.New,
                DataJson = dto.DataJson ?? "",
                ContainersJson = JsonSerializer.Serialize(BuildFromData(dto.DataJson ?? "")),
                Note = dto.Note ?? "",
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            };
            _db.Plans.Add(plan);
            await _db.SaveChangesAsync();
            return Json(new { ok = true, id = plan.Id });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = Roles.Admin + "," + Roles.Manager)]
        public async Task<IActionResult> Assign(int id, int? assigneeId)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            p.AssigneeId = assigneeId;
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return RedirectToAction("Index");
        }

        // Cập nhật trạng thái — Admin/Manager hoặc chính người được giao
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateStatus(int id, string status)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            bool allowed = CanManage || p.AssigneeId == CurrentUserId;
            if (!allowed) return Forbid();
            if (status == PlanStatus.New || status == PlanStatus.InProgress || status == PlanStatus.Done)
            {
                p.Status = status;
                p.UpdatedAt = DateTime.Now;
                await _db.SaveChangesAsync();
            }
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = Roles.Admin + "," + Roles.Manager)]
        public async Task<IActionResult> Delete(int id)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p != null) { _db.Plans.Remove(p); await _db.SaveChangesAsync(); }
            return RedirectToAction("Index");
        }

        // Lấy JSON dữ liệu kế hoạch để mở lại trong 3D
        [HttpGet]
        public async Task<IActionResult> Data(int id)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            if (!IsAdmin)
            {
                var mine = await MyWorkshopIdsAsync();
                if (!mine.Contains(p.WorkshopId) && p.AssigneeId != CurrentUserId) return Forbid();
            }
            return Content(p.DataJson, "application/json");
        }

        // ===== Quản lý từng CONTAINER trong kế hoạch =====
        public class ContainerInfo
        {
            public string name { get; set; } = "";
            public bool done { get; set; }
            public bool doing { get; set; }
            public List<int> loadedPallets { get; set; } = new(); // chỉ số pallet đã xác nhận "đã lên"
            public List<string> photos { get; set; } = new();      // ảnh chụp thực tế của container
        }

        private List<ContainerInfo> BuildFromData(string dataJson)
        {
            var list = new List<ContainerInfo>();
            try
            {
                using var doc = JsonDocument.Parse(dataJson);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Array)
                {
                    int i = 1;
                    foreach (var pl in root.EnumerateArray())
                    {
                        // tên riêng mặc định "Container N" (loại container hiển thị riêng ở dưới)
                        list.Add(new ContainerInfo { name = $"Container {i}", done = false });
                        i++;
                    }
                }
                else if (root.ValueKind == JsonValueKind.Object)
                {
                    list.Add(new ContainerInfo { name = "Container 1", done = false });
                }
            }
            catch { }
            return list;
        }

        private List<ContainerInfo> GetContainersOf(PlanEntity p)
        {
            if (!string.IsNullOrWhiteSpace(p.ContainersJson))
            {
                try { return JsonSerializer.Deserialize<List<ContainerInfo>>(p.ContainersJson) ?? new(); } catch { }
            }
            var built = BuildFromData(p.DataJson);
            p.ContainersJson = JsonSerializer.Serialize(built);
            return built;
        }

        private bool CanExecute(PlanEntity p) => CanManage || p.AssigneeId == CurrentUserId;

        [HttpGet]
        public async Task<IActionResult> Containers(int id)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            var items = GetContainersOf(p);
            if (string.IsNullOrWhiteSpace(p.ContainersJson)) { p.ContainersJson = JsonSerializer.Serialize(items); await _db.SaveChangesAsync(); }
            return Json(new { items, canRename = CanManage, canExecute = CanExecute(p), planStatus = p.Status });
        }

        [HttpPost]
        [Authorize(Roles = Roles.Admin + "," + Roles.Manager)]
        public async Task<IActionResult> RenameContainer(int id, int idx, string name)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            var items = GetContainersOf(p);
            if (idx < 0 || idx >= items.Count) return BadRequest();
            items[idx].name = (name ?? "").Trim();
            p.ContainersJson = JsonSerializer.Serialize(items);
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return Json(new { ok = true });
        }

        // Bắt đầu làm 1 container (sau khi xem mô phỏng) → chuyển "đang thực hiện"
        // Chỉ cho 1 container "đang thực hiện" tại 1 thời điểm; container trước phải xong.
        [HttpPost]
        public async Task<IActionResult> StartContainer(int id, int idx)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            if (!CanExecute(p)) return Forbid();
            var items = GetContainersOf(p);
            if (idx < 0 || idx >= items.Count) return BadRequest();
            if (items[idx].done) return Json(new { ok = true });
            if (items.Where((x, i) => i != idx).Any(x => x.doing))
                return Json(new { ok = false, msg = "Đang có container thực hiện dở — hãy hoàn thành trước." });

            items[idx].doing = true;
            p.ContainersJson = JsonSerializer.Serialize(items);
            p.Status = PlanStatus.InProgress;
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return Json(new { ok = true });
        }

        // Upload ảnh thực tế của 1 container (base64) → lưu file + ghi vào DB
        public class PhotoDto { public int id { get; set; } public int ci { get; set; } public string image { get; set; } = ""; }
        [HttpPost]
        public async Task<IActionResult> UploadPhoto([FromBody] PhotoDto dto, [FromServices] IWebHostEnvironment env)
        {
            var p = await _db.Plans.FindAsync(dto.id);
            if (p == null) return NotFound();
            if (!CanExecute(p)) return Forbid();
            var items = GetContainersOf(p);
            if (dto.ci < 0 || dto.ci >= items.Count) return BadRequest();
            if (string.IsNullOrEmpty(dto.image)) return BadRequest("Thiếu ảnh");

            // tách phần base64 "data:image/jpeg;base64,...."
            var b64 = dto.image;
            int comma = b64.IndexOf(',');
            if (comma >= 0) b64 = b64[(comma + 1)..];
            byte[] bytes;
            try { bytes = Convert.FromBase64String(b64); } catch { return BadRequest("Ảnh không hợp lệ"); }

            var dir = Path.Combine(env.WebRootPath, "uploads");
            Directory.CreateDirectory(dir);
            // tên file chứa plan + container để vẫn phân biệt được, lưu chung 1 thư mục
            var fileName = $"plan{dto.id}_c{dto.ci + 1}_{DateTime.Now:yyyyMMdd_HHmmss_fff}.jpg";
            await System.IO.File.WriteAllBytesAsync(Path.Combine(dir, fileName), bytes);

            var rel = $"/uploads/{fileName}";
            (items[dto.ci].photos ??= new()).Add(rel);
            p.ContainersJson = JsonSerializer.Serialize(items);
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return Json(new { ok = true, url = rel });
        }

        // Lưu xác nhận TỪNG pallet "đã lên" (lưu ngay DB, chống rớt mạng)
        [HttpPost]
        public async Task<IActionResult> SetPalletLoaded(int id, int ci, int idx, bool loaded)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            if (!CanExecute(p)) return Forbid();
            var items = GetContainersOf(p);
            if (ci < 0 || ci >= items.Count) return BadRequest();
            var lp = items[ci].loadedPallets ??= new();
            if (loaded) { if (!lp.Contains(idx)) lp.Add(idx); }
            else lp.Remove(idx);
            p.ContainersJson = JsonSerializer.Serialize(items);
            p.Status = PlanStatus.InProgress;
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return Json(new { ok = true, count = lp.Count });
        }

        // Đánh dấu 1 container đã xếp xong — bắt buộc xếp tuần tự (container trước phải xong)
        [HttpPost]
        public async Task<IActionResult> SetContainerDone(int id, int idx)
        {
            var p = await _db.Plans.FindAsync(id);
            if (p == null) return NotFound();
            if (!CanExecute(p)) return Forbid();
            var items = GetContainersOf(p);
            if (idx < 0 || idx >= items.Count) return BadRequest();

            items[idx].done = true;
            items[idx].doing = false;
            p.ContainersJson = JsonSerializer.Serialize(items);
            p.Status = items.All(x => x.done) ? PlanStatus.Done : PlanStatus.InProgress;
            p.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync();
            return Json(new { ok = true, planStatus = p.Status });
        }

        public class SavePlanDto
        {
            public string Name { get; set; } = "";
            public string? ContainerType { get; set; }
            public int WorkshopId { get; set; }
            public int? AssigneeId { get; set; }
            public string? DataJson { get; set; }
            public string? Note { get; set; }
        }
    }
}
