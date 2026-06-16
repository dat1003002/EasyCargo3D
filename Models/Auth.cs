namespace EasyCargo3D.Models
{
    // Vai trò hệ thống
    public static class Roles
    {
        public const string Admin    = "Admin";     // toàn quyền + quản lý user/xưởng
        public const string Manager  = "Manager";   // thêm/sửa/xóa kế hoạch
        public const string Executor = "Executor";  // thực hiện + cập nhật trạng thái
        public const string Viewer   = "Viewer";    // chỉ xem
        public static readonly string[] All = { Admin, Manager, Executor, Viewer };

        public static string Label(string r) => r switch
        {
            Admin    => "Quản trị (Admin)",
            Manager  => "Quản lý",
            Executor => "Người thực hiện",
            Viewer   => "Chỉ xem",
            _        => r
        };
    }

    public class AppUser
    {
        public int Id { get; set; }
        public string Username { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string FullName { get; set; } = "";
        public string Role { get; set; } = Roles.Viewer;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public List<UserWorkshop> UserWorkshops { get; set; } = new();
    }

    public class Workshop  // Xưởng
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Code { get; set; } = "";
        public List<UserWorkshop> UserWorkshops { get; set; } = new();
    }

    // Quan hệ N-N: 1 user thuộc 1 hoặc nhiều xưởng
    public class UserWorkshop
    {
        public int UserId { get; set; }
        public AppUser? User { get; set; }
        public int WorkshopId { get; set; }
        public Workshop? Workshop { get; set; }
    }
}
