namespace EasyCargo3D.Models
{
    public class Container
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Type { get; set; } = "20ft";
        public double Length { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public double MaxWeight { get; set; }
    }
}
