namespace EasyCargo3D.Models
{
    public class MultiContainerRequest
    {
        public string ContainerType { get; set; } = "40hc";       // loại chính (ưu tiên 1)
        public string? SecondaryType { get; set; }                // (cũ) loại phụ — vẫn nhận để tương thích
        public List<string> ContainerTypes { get; set; } = new(); // danh sách loại theo THỨ TỰ ƯU TIÊN
        public List<ContainerOpt> Containers { get; set; } = new(); // mỗi loại + tải trọng tối đa RIÊNG
        public int ContainerCount { get; set; } = 8;
        public double MaxWeightPerContainer { get; set; } = 19000;
        public List<CargoItem> Items { get; set; } = new();
    }

    public class ContainerOpt
    {
        public string Type { get; set; } = "";
        public double MaxWeight { get; set; }   // tải trọng tối đa cho loại này (người dùng nhập)
    }
}
