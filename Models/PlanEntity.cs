namespace EasyCargo3D.Models
{
    // Kế hoạch xếp hàng được LƯU vào DB (kèm người tạo, người thực hiện, xưởng, trạng thái)
    public class PlanEntity
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string ContainerType { get; set; } = "";

        public int WorkshopId { get; set; }
        public Workshop? Workshop { get; set; }

        public int CreatedById { get; set; }
        public AppUser? CreatedBy { get; set; }

        public int? AssigneeId { get; set; }      // người thực hiện
        public AppUser? Assignee { get; set; }

        public string Status { get; set; } = PlanStatus.New;  // New / InProgress / Done
        public string DataJson { get; set; } = "";            // dữ liệu kế hoạch (JSON)
        public string ContainersJson { get; set; } = "";      // [{name, done}] trạng thái từng container
        public string Note { get; set; } = "";

        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }

    public static class PlanStatus
    {
        public const string New        = "New";
        public const string InProgress = "InProgress";
        public const string Done       = "Done";

        public static string Label(string s) => s switch
        {
            New        => "Mới tạo",
            InProgress => "Đang thực hiện",
            Done       => "Hoàn thành",
            _          => s
        };
    }
}
