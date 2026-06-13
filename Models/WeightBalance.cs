namespace EasyCargo3D.Models
{
    public class WeightBalance
    {
        public double CgX         { get; set; }  // trọng tâm theo chiều dài (cm từ đầu)
        public double CgZ         { get; set; }  // trọng tâm theo chiều rộng (cm từ trái)
        public double OffsetXPct  { get; set; }  // % lệch trước-sau so với giữa container
        public double OffsetZPct  { get; set; }  // % lệch trái-phải so với giữa container
        public double FrontWeight { get; set; }  // kg nửa trước
        public double BackWeight  { get; set; }  // kg nửa sau
        public double LeftWeight  { get; set; }  // kg nửa trái
        public double RightWeight { get; set; }  // kg nửa phải
        public double TotalWeight { get; set; }
        public bool   Balanced    { get; set; }  // true nếu lệch < 10% mỗi trục
        // Kg từng góc
        public double FlWeight    { get; set; }  // Front-Left
        public double FrWeight    { get; set; }  // Front-Right
        public double BlWeight    { get; set; }  // Back-Left
        public double BrWeight    { get; set; }  // Back-Right
    }
}
