using EasyCargo3D.Models;

namespace EasyCargo3D.Services
{
    public class PackingService
    {
        private static readonly Dictionary<string, Container> ContainerTypes = new()
        {
            ["20ft"]  = new Container { Name = "20ft Standard",  Type = "20ft",  Length = 585,  Width = 235, Height = 228, MaxWeight = 28200 },
            ["40ft"]  = new Container { Name = "40ft Standard",  Type = "40ft",  Length = 1185, Width = 235, Height = 228, MaxWeight = 26750 },
            ["40hc"]  = new Container { Name = "40ft High Cube", Type = "40hc",  Length = 1185, Width = 235, Height = 268, MaxWeight = 26460 },
            ["45hc"]  = new Container { Name = "45ft High Cube", Type = "45hc",  Length = 1351, Width = 235, Height = 269, MaxWeight = 27600 },
            ["truck"] = new Container { Name = "Truck (13.6m)",  Type = "truck", Length = 1360, Width = 240, Height = 270, MaxWeight = 24000 },
        };

        public static List<Container> GetContainerTypes() => ContainerTypes.Values.ToList();

        // ── CALCULATE: xếp với số lượng cố định ──
        public LoadingPlan Calculate(LoadingRequest request)
        {
            var container = ContainerTypes.GetValueOrDefault(request.ContainerType, ContainerTypes["20ft"]);
            var plan = new LoadingPlan { Container = container, CargoItems = request.Items };

            // Gán màu tự động
            var colors = new[] { "#E74C3C","#3498DB","#2ECC71","#F39C12","#9B59B6","#1ABC9C","#E67E22","#34495E","#E91E63","#00BCD4" };
            int ci = 0;
            foreach (var item in request.Items)
                if (string.IsNullOrEmpty(item.Color) || item.Color == "#4A90D9")
                    item.Color = colors[ci++ % colors.Length];

            // Sắp xếp: to + nặng xếp trước (nằm dưới)
            var sortedItems = request.Items
                .OrderByDescending(i => i.Height)
                .ThenByDescending(i => i.Length * i.Width * i.Height)
                .ThenByDescending(i => i.Weight)
                .ToList();

            plan.PackedItems = Pack(container, sortedItems);
            SetStats(plan, container);
            return plan;
        }

        // ── OPTIMIZE: tính số lượng tối ưu từng loại để lấp đầy container ──
        public OptimizeResult Optimize(OptimizeRequest request)
        {
            var container = ContainerTypes.GetValueOrDefault(request.ContainerType, ContainerTypes["20ft"]);
            double containerVol = container.Length * container.Width * container.Height;
            double containerWeight = container.MaxWeight;

            var colors = new[] { "#E74C3C","#3498DB","#2ECC71","#F39C12","#9B59B6","#1ABC9C","#E67E22","#34495E","#E91E63","#00BCD4" };
            int ci = 0;
            foreach (var t in request.ItemTypes)
                if (string.IsNullOrEmpty(t.Color) || t.Color == "#4A90D9")
                    t.Color = colors[ci++ % colors.Length];

            // Tính thể tích và khối lượng từng loại
            var suggestions = new List<ItemSuggestion>();
            double usedVol = 0, usedWeight = 0;

            // Sắp xếp loại: to + nặng trước
            var sorted = request.ItemTypes
                .OrderByDescending(t => t.Height)
                .ThenByDescending(t => t.Length * t.Width * t.Height)
                .ThenByDescending(t => t.Weight)
                .ToList();

            // Thử pack từng bước: tăng dần số lượng đến khi đầy
            var itemsTopack = new List<CargoItem>();
            var countMap = sorted.ToDictionary(t => t.Id, _ => 0);

            bool canAdd = true;
            int safetyLimit = 5000;
            while (canAdd && safetyLimit-- > 0)
            {
                canAdd = false;
                foreach (var type in sorted)
                {
                    double itemVol = type.Length * type.Width * type.Height;
                    double itemW = type.Weight;
                    if (usedVol + itemVol <= containerVol * 0.97 &&
                        usedWeight + itemW <= containerWeight * 0.97)
                    {
                        countMap[type.Id]++;
                        usedVol += itemVol;
                        usedWeight += itemW;
                        canAdd = true;
                    }
                }
            }

            // Build item list với số lượng tối ưu
            foreach (var type in sorted)
            {
                int qty = countMap[type.Id];
                if (qty == 0) continue;
                suggestions.Add(new ItemSuggestion { Item = type, SuggestedQty = qty });
                for (int q = 0; q < qty; q++)
                    itemsTopack.Add(new CargoItem
                    {
                        Id = type.Id, Name = type.Name,
                        Length = type.Length, Width = type.Width, Height = type.Height,
                        Weight = type.Weight, Color = type.Color,
                        Quantity = 1, Stackable = type.Stackable
                    });
            }

            var packed = Pack(container, itemsTopack);
            var plan = new LoadingPlan { Container = container, CargoItems = itemsTopack, PackedItems = packed };
            SetStats(plan, container);

            return new OptimizeResult { Plan = plan, Suggestions = suggestions };
        }

        // ── FILL WOOD: thêm gỗ chèn vào plan đã có sẵn ──
        public LoadingPlan AddWoodDunnage(LoadingPlan plan)
        {
            // Loại bỏ gỗ cũ nếu có (để chạy lại)
            plan.PackedItems = plan.PackedItems.Where(p => !p.Item.IsWood).ToList();

            var container = plan.Container;

            // Fallback nếu MaxWeight không được gửi từ client hoặc = 0
            if (container.MaxWeight <= 0 && ContainerTypes.TryGetValue(container.Type ?? "", out var ct))
                container.MaxWeight = ct.MaxWeight;
            if (container.MaxWeight <= 0)
                container.MaxWeight = 30000; // fallback an toàn

            double cargoWeight = plan.PackedItems.Sum(p => p.Item.Weight);
            double remaining   = container.MaxWeight - cargoWeight;
            if (remaining > 0)
            {
                var woodItems = FillWithWoodDunnage(container, plan.PackedItems, remaining);
                plan.PackedItems.AddRange(woodItems);
                plan.WoodWeight = Math.Round(woodItems.Sum(w => w.Item.Weight), 1);
                plan.WoodCount  = woodItems.Count;
            }

            // Cập nhật lại stats bao gồm gỗ
            double cv = container.Length * container.Width * container.Height;
            double uv = plan.PackedItems.Where(p => !p.Item.IsWood).Sum(p => p.Item.Length * p.Item.Width * p.Item.Height);
            plan.TotalWeight       = plan.PackedItems.Sum(p => p.Item.Weight);
            plan.TotalVolume       = Math.Round(uv / 1_000_000, 2);
            plan.VolumeUtilization = cv > 0 ? Math.Round(uv / cv * 100, 1) : 0;
            plan.WeightUtilization = container.MaxWeight > 0 ? Math.Round(plan.TotalWeight / container.MaxWeight * 100, 1) : 0;
            plan.WeightBalance     = CalcWeightBalance(plan);
            return plan;
        }

        // ── AUTO PACK: tự động tính số container tối thiểu, xếp đầy từng cái ──
        // Mục tiêu: tối đa hóa sử dụng không gian mỗi container trước khi qua cái tiếp theo
        public MultiContainerResult PackAuto(MultiContainerRequest request)
        {
            var container = ContainerTypes.GetValueOrDefault(request.ContainerType, ContainerTypes["40hc"]);
            double maxWeight = request.MaxWeightPerContainer > 0 ? request.MaxWeightPerContainer : container.MaxWeight;

            var palette = new[] { "#E74C3C","#3498DB","#2ECC71","#F39C12","#9B59B6","#1ABC9C","#E67E22","#34495E","#E91E63","#00BCD4" };
            int ci = 0;
            foreach (var item in request.Items)
                if (string.IsNullOrEmpty(item.Color) || item.Color == "#4A90D9")
                    item.Color = palette[ci++ % palette.Length];

            // Expand từng pallet thành item riêng
            var expanded = new List<CargoItem>();
            foreach (var item in request.Items)
                for (int q = 0; q < item.Quantity; q++)
                    expanded.Add(new CargoItem
                    {
                        Id = item.Id, Name = item.Name,
                        Length = item.Length, Width = item.Width, Height = item.Height,
                        Weight = item.Weight, Color = item.Color,
                        Quantity = 1, Stackable = item.Stackable
                    });

            int totalUnits = expanded.Count;

            // Sắp giảm dần theo thể tích (to nhất xếp trước → lấp đầy tốt hơn)
            // Ưu tiên thể tích vì mục tiêu là tối đa hóa không gian
            var sorted = expanded
                .OrderByDescending(i => i.Length * i.Width * i.Height)
                .ThenByDescending(i => i.Weight)
                .ToList();

            var plans       = new List<LoadingPlan>();
            var remaining   = new List<CargoItem>(sorted);
            int safetyLimit = 500;

            while (remaining.Count > 0 && safetyLimit-- > 0)
            {
                // Xếp đầy 1 container — dùng Extreme Points toàn bộ (không chia góc)
                // để tối đa hóa không gian, có kiểm soát tổng trọng lượng
                var (packed, leftover) = PackFullGreedy(container, remaining, maxWeight);

                if (packed.Count == 0) break; // không xếp được gì thêm

                var planContainer = new Container
                {
                    Name      = $"{container.Name} #{plans.Count + 1}",
                    Type      = container.Type,
                    Length    = container.Length, Width = container.Width, Height = container.Height,
                    MaxWeight = maxWeight
                };
                var plan = new LoadingPlan
                {
                    Container   = planContainer,
                    PackedItems = packed,
                    CargoItems  = packed.Select(p => p.Item).ToList()
                };
                SetStats(plan, planContainer);
                plans.Add(plan);
                remaining = leftover;
            }

            return new MultiContainerResult
            {
                Plans           = plans,
                TotalItemUnits  = totalUnits,
                PackedItemUnits = totalUnits - remaining.Count,
                UnpackedItems   = remaining
            };
        }

        // Xếp đầy 1 container với phân bổ tải đều 4 góc (Trước/Sau × Trái/Phải)
        // Chiến lược:
        // Xếp 1 container với 3 mục tiêu:
        //   1. Lấp đầy tối đa (Extreme Points)
        //   2. Cân bằng tải 4 góc (chọn vị trí giúp góc nhẹ nhất)
        //   3. Brick pattern: tầng trên lệch nửa chiều dài so với tầng dưới
        //      → mỗi pallet gác lên 2 pallet → khóa lẫn nhau, chống đổ khi rung lắc
        private static (List<PackedItem> packed, List<CargoItem> leftover) PackFullGreedy(
            Container container, List<CargoItem> items, double maxWeight)
        {
            var packed      = new List<PackedItem>();
            var leftover    = new List<CargoItem>();
            double usedWeight = 0;

            double midX = container.Length / 2.0;
            double midZ = container.Width  / 2.0;
            var zoneWeight = new double[4]; // FL, FR, BL, BR
            var eps = new List<(double x, double y, double z)> { (0, 0, 0) };
            const double tol = 0.01;

            foreach (var item in items)
            {
                if (item.Weight > 0 && usedWeight + item.Weight > maxWeight)
                {
                    leftover.Add(item);
                    continue;
                }

                var orientations = new[]
                {
                    (iL: item.Length, iW: item.Width,  rot: 0),
                    (iL: item.Width,  iW: item.Length, rot: 90),
                };

                double bestScore = double.MaxValue;
                (double px, double py, double pz, double iL, double iW, int rot) best = default;
                bool found = false;

                foreach (var ep in eps)
                {
                    foreach (var (iL, iW, rot) in orientations)
                    {
                        double px = ep.x, py = ep.y, pz = ep.z;
                        if (px + iL > container.Length + tol) continue;
                        if (py + item.Height > container.Height + tol) continue;
                        if (pz + iW > container.Width  + tol) continue;
                        if (Overlaps(packed, px, py, pz, iL, item.Height, iW)) continue;

                        // ── Điểm 1: Cân bằng tải ──
                        double cx = px + iL / 2.0, cz = pz + iW / 2.0;
                        int zone = (cx <= midX ? 0 : 2) + (cz <= midZ ? 0 : 1);
                        var sim = (double[])zoneWeight.Clone();
                        sim[zone] += item.Weight;
                        double fl = sim[0], fr = sim[1], bl = sim[2], br = sim[3];
                        double front = fl + fr, back = bl + br, left = fl + bl, right = fr + br;
                        double tot = front + back;
                        double balanceScore = tot > 0
                            ? (Math.Abs(front - back) + Math.Abs(left - right)) / tot * 1000
                            : 0;

                        // ── Điểm 2: Brick pattern ──
                        // Đếm số item ngay bên dưới mà item này gác lên
                        // ≥ 2 item dưới → brick (gác chéo lên 2 pallet) → ổn định
                        // = 1 item dưới → thẳng cột → kém ổn định
                        // = 0 item dưới (đặt sàn) → không tính
                        double brickScore = 0;
                        if (py > tol)
                        {
                            int supportCount = packed.Count(p =>
                            {
                                double belowTop = p.Y + p.Item.Height;
                                if (Math.Abs(belowTop - py) > tol) return false;
                                double pItemL = (p.RotationY == 90) ? p.Item.Width : p.Item.Length;
                                double pItemW = (p.RotationY == 90) ? p.Item.Length : p.Item.Width;
                                bool overlapX = p.X < px + iL - tol && p.X + pItemL > px + tol;
                                bool overlapZ = p.Z < pz + iW - tol && p.Z + pItemW > pz + tol;
                                return overlapX && overlapZ;
                            });
                            // 1 support = xếp thẳng cột → phạt nặng
                            // ≥ 2 support = brick → không phạt
                            if (supportCount == 1) brickScore = 300;
                            else if (supportCount == 0) brickScore = 0; // sàn ok
                        }

                        // ── Điểm 3: Ưu tiên thấp + sát tường (lấp đầy) ──
                        double fillScore = py * 0.5 + px * 0.01 + pz * 0.01;

                        double totalScore = balanceScore + brickScore + fillScore;
                        if (totalScore < bestScore)
                        {
                            bestScore = totalScore;
                            best = (px, py, pz, iL, iW, rot);
                            found = true;
                        }
                    }
                }

                if (found)
                {
                    var (px, py, pz, iL, iW, rot) = best;
                    packed.Add(new PackedItem { Item = item, X = px, Y = py, Z = pz, RotationY = rot });
                    eps.Add((px + iL, py, pz));
                    eps.Add((px, py + item.Height, pz));
                    eps.Add((px, py, pz + iW));
                    usedWeight += item.Weight;
                    double cx = px + iL / 2.0, cz = pz + iW / 2.0;
                    int zone = (cx <= midX ? 0 : 2) + (cz <= midZ ? 0 : 1);
                    zoneWeight[zone] += item.Weight;
                }
                else
                {
                    leftover.Add(item);
                }
            }

            return (packed, leftover);
        }

        // ── MULTI-CONTAINER PACKING (FFD + Extreme Points) ──
        public MultiContainerResult PackMultiple(MultiContainerRequest request)
        {
            var container = ContainerTypes.GetValueOrDefault(request.ContainerType, ContainerTypes["40hc"]);
            double maxWeight = request.MaxWeightPerContainer > 0 ? request.MaxWeightPerContainer : container.MaxWeight;
            int N = request.ContainerCount;

            var palette = new[] { "#E74C3C","#3498DB","#2ECC71","#F39C12","#9B59B6","#1ABC9C","#E67E22","#34495E","#E91E63","#00BCD4" };
            int ci = 0;
            foreach (var item in request.Items)
                if (string.IsNullOrEmpty(item.Color) || item.Color == "#4A90D9")
                    item.Color = palette[ci++ % palette.Length];

            // Expand: mỗi đơn vị thành 1 item riêng
            var expanded = new List<CargoItem>();
            foreach (var item in request.Items)
                for (int q = 0; q < item.Quantity; q++)
                    expanded.Add(new CargoItem
                    {
                        Id = item.Id, Name = item.Name,
                        Length = item.Length, Width = item.Width, Height = item.Height,
                        Weight = item.Weight, Color = item.Color,
                        Quantity = 1, Stackable = item.Stackable
                    });

            int totalUnits = expanded.Count;

            // ── Bước 1: FFD Weight Balance – phân bổ đều tải trọng ──
            // Sắp xếp nặng nhất trước (First Fit Decreasing)
            var sortedByWeight = expanded
                .OrderByDescending(i => i.Weight)
                .ThenByDescending(i => i.Length * i.Width * i.Height)
                .ToList();

            var containerWeights  = new double[N];
            var containerAssigned = Enumerable.Range(0, N).Select(_ => new List<CargoItem>()).ToArray();
            var unassigned = new List<CargoItem>();

            foreach (var item in sortedByWeight)
            {
                // Tìm container ít tải nhất mà còn chứa được
                int bestIdx = -1;
                double minW = double.MaxValue;
                for (int c = 0; c < N; c++)
                {
                    double newW = containerWeights[c] + item.Weight;
                    if ((item.Weight == 0 || newW <= maxWeight) && containerWeights[c] < minW)
                    {
                        bestIdx = c; minW = containerWeights[c];
                    }
                }
                if (bestIdx < 0) { unassigned.Add(item); continue; }
                containerAssigned[bestIdx].Add(item);
                containerWeights[bestIdx] += item.Weight;
            }

            // ── Bước 2: Với mỗi container, xếp không gian bằng Zone-Balanced Packing ──
            var plans = new List<LoadingPlan>();
            var allUnpacked = new List<CargoItem>(unassigned);

            for (int c = 0; c < N; c++)
            {
                if (containerAssigned[c].Count == 0) continue;

                var (packed, spatialUnpacked) = PackZoneBalanced(container, containerAssigned[c], maxWeight);
                allUnpacked.AddRange(spatialUnpacked);

                var planContainer = new Container
                {
                    Name = $"{container.Name} #{c + 1}",
                    Type = container.Type,
                    Length = container.Length, Width = container.Width, Height = container.Height,
                    MaxWeight = maxWeight
                };
                var plan = new LoadingPlan
                {
                    Container = planContainer,
                    PackedItems = packed,
                    CargoItems  = packed.Select(p => p.Item).ToList()
                };
                SetStats(plan, planContainer);
                plans.Add(plan);
            }

            return new MultiContainerResult
            {
                Plans          = plans,
                TotalItemUnits = totalUnits,
                PackedItemUnits= totalUnits - allUnpacked.Count,
                UnpackedItems  = allUnpacked
            };
        }

        // ── Zone-Balanced Packing: chia 4 vùng, phân bổ đều tải trọng ──
        // Chia container thành 4 quadrant (Front-Left, Front-Right, Back-Left, Back-Right)
        // Gán item vào quadrant ít tải nhất → xếp từng quadrant riêng
        private static (List<PackedItem> packed, List<CargoItem> unpacked) PackZoneBalanced(
            Container container, List<CargoItem> items, double maxWeight)
        {
            double halfL = container.Length / 2.0;
            double halfW = container.Width  / 2.0;

            // 4 vùng: [0]=FL, [1]=FR, [2]=BL, [3]=BR
            var zones = new[]
            {
                new Zone(0,      0, halfL, halfW),   // Front-Left
                new Zone(0,   halfW, halfL, halfW),  // Front-Right
                new Zone(halfL,  0, halfL, halfW),   // Back-Left
                new Zone(halfL, halfW, halfL, halfW) // Back-Right
            };

            // Sắp nặng nhất trước
            var sorted = items.OrderByDescending(i => i.Weight)
                              .ThenByDescending(i => i.Length * i.Width * i.Height)
                              .ToList();

            // Phân bổ vào vùng ít tải nhất (cân bằng tải 4 góc)
            foreach (var item in sorted)
            {
                var best = zones.OrderBy(z => z.Weight).First();
                best.Items.Add(item);
                best.Weight += item.Weight;
            }

            // Xếp từng vùng bằng Extreme Points trong không gian riêng
            var allPacked   = new List<PackedItem>();
            var allUnpacked = new List<CargoItem>();

            foreach (var zone in zones)
            {
                if (zone.Items.Count == 0) continue;

                // Sắp trong vùng: cao → nặng
                var zoneItems = zone.Items
                    .OrderByDescending(i => i.Height)
                    .ThenByDescending(i => i.Weight)
                    .ToList();

                // Tạo sub-container cho vùng này
                var sub = new Container
                {
                    Length = zone.L, Width = zone.W,
                    Height = container.Height, MaxWeight = maxWeight / 4
                };

                var (packed, unpacked) = PackExtremePoints(sub, zoneItems);

                // Dịch chuyển tọa độ về vị trí thực trong container
                foreach (var pi in packed)
                {
                    pi.X += zone.X;
                    pi.Z += zone.Z;
                    allPacked.Add(pi);
                }
                allUnpacked.AddRange(unpacked);
            }

            // Thử xếp unpacked vào không gian tổng (bất kỳ vị trí còn trống)
            if (allUnpacked.Count > 0)
            {
                var (extra, stillUnpacked) = PackExtremePoints(container, allUnpacked);
                // Chỉ giữ những cái không overlap với packed cũ
                foreach (var pi in extra)
                {
                    var iL = pi.RotationY == 90 ? pi.Item.Width : pi.Item.Length;
                    var iW = pi.RotationY == 90 ? pi.Item.Length : pi.Item.Width;
                    if (!Overlaps(allPacked, pi.X, pi.Y, pi.Z, iL, pi.Item.Height, iW))
                        allPacked.Add(pi);
                    else
                        stillUnpacked.Add(pi.Item);
                }
                allUnpacked = stillUnpacked;
            }

            return (allPacked, allUnpacked);
        }

        private class Zone
        {
            public double X, Z, L, W, Weight;
            public List<CargoItem> Items = new();
            public Zone(double x, double z, double l, double w) { X=x; Z=z; L=l; W=w; }
        }

        // ── Extreme Points packing – tốt hơn nhiều so với guillotine ──
        private static (List<PackedItem> packed, List<CargoItem> unpacked) PackExtremePoints(
            Container container, List<CargoItem> items)
        {
            var packed   = new List<PackedItem>();
            var unpacked = new List<CargoItem>();

            // Extreme points: tập hợp các vị trí có thể đặt item
            // Khởi đầu: góc (0,0,0)
            var eps = new List<(double x, double y, double z)> { (0, 0, 0) };

            foreach (var item in items)
            {
                bool placed = false;

                // Thử cả 2 chiều ngang (xoay hoặc không)
                var orientations = new[]
                {
                    (iL: item.Length, iW: item.Width,  rot: 0),
                    (iL: item.Width,  iW: item.Length, rot: 90),
                };

                // Sắp extreme points: Y thấp nhất → Z nhỏ nhất → X nhỏ nhất (đặt xuống đáy trước)
                var candidates = eps.OrderBy(p => p.y).ThenBy(p => p.z).ThenBy(p => p.x).ToList();

                foreach (var (px, py, pz) in candidates)
                {
                    if (placed) break;
                    foreach (var (iL, iW, rot) in orientations)
                    {
                        if (px + iL > container.Length + 0.01) continue;
                        if (py + item.Height > container.Height + 0.01) continue;
                        if (pz + iW > container.Width + 0.01) continue;

                        if (!Overlaps(packed, px, py, pz, iL, item.Height, iW))
                        {
                            packed.Add(new PackedItem
                            {
                                Item = item, X = px, Y = py, Z = pz, RotationY = rot
                            });

                            // Tạo 3 extreme points mới tại mặt ngoài của item vừa đặt
                            eps.Add((px + iL, py, pz));
                            eps.Add((px, py + item.Height, pz));
                            eps.Add((px, py, pz + iW));

                            placed = true;
                            break;
                        }
                    }
                }

                if (!placed) unpacked.Add(item);
            }

            return (packed, unpacked);
        }

        // ── Cân bằng trọng lượng: trọng tâm nằm giữa theo cả X (trước-sau) và Z (trái-phải) ──
        private static List<CargoItem> BalanceWeightOrder(List<CargoItem> items)
        {
            // Nhóm theo chiều cao → lớp to xuống đáy trước
            var byHeight = items
                .GroupBy(i => Math.Round(i.Height / 5.0) * 5)
                .OrderByDescending(g => g.Key);

            var result = new List<CargoItem>();
            foreach (var group in byHeight)
            {
                var sorted = group.OrderByDescending(i => i.Weight).ToList();
                int count = sorted.Count;

                // Chia thành 4 góc để Extreme Points xếp xen kẽ:
                // Vị trí xếp: front-left, front-right, back-left, back-right
                // Luân phiên nặng ở giữa, nhẹ ra ngoài dọc theo X
                // Cách: đặt theo thứ tự xen kẽ giữa→đầu→giữa→cuối...
                // → Extreme Points (sắp theo x nhỏ trước) sẽ xen kẽ nặng nhẹ dọc container
                var interleaved = new List<CargoItem>(count);
                int lo = 0, hi = count - 1;
                bool pickHi = false; // bắt đầu bằng nặng nhất (index 0)
                while (lo <= hi)
                {
                    interleaved.Add(pickHi ? sorted[hi--] : sorted[lo++]);
                    pickHi = !pickHi;
                }

                // Xen kẽ thêm lần nữa theo Z (trái-phải):
                // Tách thành 2 nửa: nửa đầu đặt trái (Z nhỏ), nửa sau đặt phải (Z lớn)
                // → xen kẽ từng cặp: [trái, phải, trái, phải...]
                var zBalanced = new List<CargoItem>(count);
                var half1 = interleaved.Where((_, i) => i % 2 == 0).ToList();
                var half2 = interleaved.Where((_, i) => i % 2 == 1).ToList();
                int n1 = half1.Count, n2 = half2.Count, i1 = 0, i2 = 0;
                bool takeLeft = true;
                while (i1 < n1 || i2 < n2)
                {
                    if (takeLeft && i1 < n1)       zBalanced.Add(half1[i1++]);
                    else if (!takeLeft && i2 < n2) zBalanced.Add(half2[i2++]);
                    else if (i1 < n1)              zBalanced.Add(half1[i1++]);
                    else                           zBalanced.Add(half2[i2++]);
                    takeLeft = !takeLeft;
                }

                result.AddRange(zBalanced);
            }
            return result;
        }

        // ── Sau khi xếp xong, kiểm tra và báo cân bằng trọng tâm ──
        public static WeightBalance CalcWeightBalance(LoadingPlan plan)
        {
            var pi = plan.PackedItems;
            if (!pi.Any()) return new WeightBalance();
            double L = plan.Container.Length, W = plan.Container.Width;
            double totalW = pi.Sum(p => p.Item.Weight);
            if (totalW == 0) return new WeightBalance { Balanced = true };

            // Trọng tâm lý tưởng: giữa container
            double idealX = L / 2, idealZ = W / 2;

            // Tính tâm đúng khi pallet bị xoay 90° (hoán đổi Length ↔ Width theo trục X/Z)
            static double CX(PackedItem p) => p.X + ((p.RotationY == 90) ? p.Item.Width  : p.Item.Length) / 2.0;
            static double CZ(PackedItem p) => p.Z + ((p.RotationY == 90) ? p.Item.Length : p.Item.Width ) / 2.0;

            double cgX = pi.Sum(p => CX(p) * p.Item.Weight) / totalW;
            double cgZ = pi.Sum(p => CZ(p) * p.Item.Weight) / totalW;

            double frontWeight = pi.Where(p => CX(p) <  L / 2).Sum(p => p.Item.Weight);
            double backWeight  = pi.Where(p => CX(p) >= L / 2).Sum(p => p.Item.Weight);
            double leftWeight  = pi.Where(p => CZ(p) <  W / 2).Sum(p => p.Item.Weight);
            double rightWeight = pi.Where(p => CZ(p) >= W / 2).Sum(p => p.Item.Weight);
            // Kg 4 góc
            double flWeight = pi.Where(p => CX(p) <  L/2 && CZ(p) <  W/2).Sum(p => p.Item.Weight);
            double frWeight = pi.Where(p => CX(p) <  L/2 && CZ(p) >= W/2).Sum(p => p.Item.Weight);
            double blWeight = pi.Where(p => CX(p) >= L/2 && CZ(p) <  W/2).Sum(p => p.Item.Weight);
            double brWeight = pi.Where(p => CX(p) >= L/2 && CZ(p) >= W/2).Sum(p => p.Item.Weight);

            double offsetXPct = totalW > 0 ? Math.Round((cgX - idealX) / L * 100, 1) : 0;
            double offsetZPct = totalW > 0 ? Math.Round((cgZ - idealZ) / W * 100, 1) : 0;

            return new WeightBalance
            {
                CgX          = Math.Round(cgX, 1),
                CgZ          = Math.Round(cgZ, 1),
                OffsetXPct   = offsetXPct,   // + = lệch về sau (back), - = lệch về trước (front)
                OffsetZPct   = offsetZPct,   // + = lệch phải, - = lệch trái
                FrontWeight  = Math.Round(frontWeight, 1),
                BackWeight   = Math.Round(backWeight, 1),
                LeftWeight   = Math.Round(leftWeight, 1),
                RightWeight  = Math.Round(rightWeight, 1),
                TotalWeight  = Math.Round(totalW, 1),
                FlWeight     = Math.Round(flWeight, 1),
                FrWeight     = Math.Round(frWeight, 1),
                BlWeight     = Math.Round(blWeight, 1),
                BrWeight     = Math.Round(brWeight, 1),
                Balanced     = Math.Abs(offsetXPct) <= 10 && Math.Abs(offsetZPct) <= 10
            };
        }

        private static bool Overlaps(List<PackedItem> packed,
            double x, double y, double z, double l, double h, double w)
        {
            const double eps = 0.01;
            foreach (var p in packed)
            {
                double pL = p.RotationY == 90 ? p.Item.Width : p.Item.Length;
                double pW = p.RotationY == 90 ? p.Item.Length : p.Item.Width;
                if (x + l - eps > p.X && x < p.X + pL - eps &&
                    y + h - eps > p.Y && y < p.Y + p.Item.Height - eps &&
                    z + w - eps > p.Z && z < p.Z + pW - eps)
                    return true;
            }
            return false;
        }

        // ── CORE PACKING ENGINE ──
        private static List<PackedItem> Pack(Container container, List<CargoItem> items)
        {
            var packed = new List<PackedItem>();
            var spaces = new List<Space> { new(0, 0, 0, container.Length, container.Height, container.Width) };

            foreach (var item in items)
            {
                for (int q = 0; q < item.Quantity; q++)
                {
                    var (bestSpace, rotated) = FindBestSpace(spaces, item);
                    if (bestSpace == null) continue;

                    double iL = rotated ? item.Width  : item.Length;
                    double iW = rotated ? item.Length : item.Width;

                    packed.Add(new PackedItem
                    {
                        Item = item, X = bestSpace.X, Y = bestSpace.Y, Z = bestSpace.Z,
                        RotationY = rotated ? 90 : 0
                    });

                    spaces.Remove(bestSpace);
                    // Chia 3 không gian còn lại
                    if (bestSpace.W - iL > 1)
                        spaces.Add(new(bestSpace.X + iL, bestSpace.Y, bestSpace.Z, bestSpace.W - iL, bestSpace.H, bestSpace.D));
                    if (bestSpace.H - item.Height > 1)
                        spaces.Add(new(bestSpace.X, bestSpace.Y + item.Height, bestSpace.Z, iL, bestSpace.H - item.Height, iW));
                    if (bestSpace.D - iW > 1)
                        spaces.Add(new(bestSpace.X, bestSpace.Y, bestSpace.Z + iW, iL, item.Height, bestSpace.D - iW));
                }
            }
            return packed;
        }

        private static (Space? space, bool rotated) FindBestSpace(List<Space> spaces, CargoItem item)
        {
            foreach (var s in spaces.OrderBy(s => s.Y).ThenBy(s => s.Z).ThenBy(s => s.X))
            {
                if (s.W >= item.Length && s.H >= item.Height && s.D >= item.Width)
                    return (s, false);
                if (s.W >= item.Width && s.H >= item.Height && s.D >= item.Length)
                    return (s, true);
            }
            return (null, false);
        }

        private static void SetStats(LoadingPlan plan, Container container)
        {
            double cv = container.Length * container.Width * container.Height;
            double uv = plan.PackedItems.Where(p => !p.Item.IsWood).Sum(p => p.Item.Length * p.Item.Width * p.Item.Height);
            plan.TotalVolume = Math.Round(uv / 1_000_000, 2);
            plan.TotalWeight = plan.PackedItems.Sum(p => p.Item.Weight);
            plan.VolumeUtilization  = cv > 0 ? Math.Round(uv / cv * 100, 1) : 0;
            plan.WeightUtilization  = container.MaxWeight > 0 ? Math.Round(plan.TotalWeight / container.MaxWeight * 100, 1) : 0;
            plan.WeightBalance      = CalcWeightBalance(plan);
        }

        // Lấp khoảng hở giữa các pallet bằng gỗ chèn vừa khít
        // Thuật toán:
        //   1. Nén tọa độ: thu thập tất cả ranh giới X và Z từ các pallet đã xếp
        //   2. Với mỗi ô lưới (xCell × zCell) tại từng tầng Y:
        //      - Nếu ô đó trống (không có pallet nào) → tạo 1 khối gỗ lấp đầy ô đó
        // Lấp TẤT CẢ khoảng trống trong container bằng gỗ chèn:
        //   - Khoảng hở giữa pallet
        //   - Cuối container (sau pallet cuối cùng)
        //   - Bên cạnh (giữa pallet và tường)
        //   - Trên đỉnh pallet (khoảng trống lên đến trần)
        // Chỉ dừng khi hết chỗ hoặc hết tải cho phép
        private static List<PackedItem> FillWithWoodDunnage(
            Container container, List<PackedItem> existing, double maxWoodWeight)
        {
            const double DENSITY = 0.0006; // kg/cm³ (gỗ thông)
            const double MIN_GAP = 3.0;    // bỏ qua khoảng hở < 3cm
            const double tol     = 0.5;

            var wood      = new List<PackedItem>();
            double usedWt = 0;
            if (!existing.Any()) return wood;

            static (double L, double W) Dims(PackedItem p) =>
                p.RotationY == 90 ? (p.Item.Width, p.Item.Length) : (p.Item.Length, p.Item.Width);

            // Tập hợp tất cả mặt phẳng Y cần xét:
            //   - Y=0 (sàn container)
            //   - Đỉnh mỗi tầng pallet (p.Y + p.Item.Height) → để lấp phần trên
            var yPlanes = new SortedSet<double> { 0 };
            foreach (var p in existing)
            {
                yPlanes.Add(p.Y);
                yPlanes.Add(p.Y + p.Item.Height);
            }

            // Tất cả item đã có (pallet + gỗ sẽ được thêm dần)
            var allItems = existing.ToList();

            foreach (double yFloor in yPlanes)
            {
                // Bỏ qua nếu Y vượt trần
                if (yFloor >= container.Height - MIN_GAP) continue;

                // Không gian từ yFloor lên trần
                double maxFillH = container.Height - yFloor;
                if (maxFillH < MIN_GAP) continue;

                // Tập hợp ranh giới X và Z từ TẤT CẢ item có đáy hoặc đỉnh tại/gần yFloor
                // + tất cả item tồn tại ở tầng này (để nén tọa độ đúng)
                var xs = new SortedSet<double> { 0, container.Length };
                var zs = new SortedSet<double> { 0, container.Width  };

                foreach (var p in allItems)
                {
                    var (pL, pW) = Dims(p);
                    // Item chồng qua tầng yFloor: p.Y < yFloor+tol && p.Y+p.Item.Height > yFloor-tol
                    if (p.Y < yFloor + tol && p.Y + p.Item.Height > yFloor - tol)
                    {
                        xs.Add(p.X); xs.Add(p.X + pL);
                        zs.Add(p.Z); zs.Add(p.Z + pW);
                    }
                }

                var xList = xs.ToList();
                var zList = zs.ToList();

                for (int ix = 0; ix < xList.Count - 1; ix++)
                {
                    double x0 = xList[ix], x1 = xList[ix + 1];
                    double cellL = x1 - x0;
                    if (cellL < MIN_GAP) continue;

                    for (int iz = 0; iz < zList.Count - 1; iz++)
                    {
                        double z0 = zList[iz], z1 = zList[iz + 1];
                        double cellW = z1 - z0;
                        if (cellW < MIN_GAP) continue;

                        // Tính chiều cao gỗ có thể đặt tại ô này:
                        // = khoảng thẳng đứng từ yFloor đến đáy item tiếp theo bên trên (hoặc đến trần)
                        double ceilH = maxFillH;
                        foreach (var p in allItems)
                        {
                            var (pL, pW) = Dims(p);
                            bool overX = p.X < x1 - tol && p.X + pL > x0 + tol;
                            bool overZ = p.Z < z1 - tol && p.Z + pW > z0 + tol;
                            if (!overX || !overZ) continue;
                            // Item nằm bên trên yFloor
                            double gap = p.Y - yFloor;
                            if (gap > tol && gap < ceilH) ceilH = gap;
                        }

                        double fillH = Math.Min(ceilH, maxFillH);
                        if (fillH < MIN_GAP) continue;

                        // Kiểm tra ô này đã bị chiếm chưa (có item nào đặt chính xác ở đây)
                        if (Overlaps(allItems, x0, yFloor, z0, cellL, fillH, cellW)) continue;

                        // Phải có chỗ đỡ bên dưới (sàn hoặc mặt trên của item)
                        bool hasSupport = yFloor < tol ||
                            allItems.Any(p =>
                            {
                                var (pL, pW) = Dims(p);
                                if (Math.Abs(p.Y + p.Item.Height - yFloor) > tol) return false;
                                bool ox = p.X < x1 - tol && p.X + pL > x0 + tol;
                                bool oz = p.Z < z1 - tol && p.Z + pW > z0 + tol;
                                return ox && oz;
                            });
                        if (!hasSupport) continue;

                        double woodKg = cellL * cellW * fillH * DENSITY;
                        if (usedWt + woodKg > maxWoodWeight) continue;

                        var woodItem = new CargoItem
                        {
                            Name   = "Gỗ chèn",
                            Length = cellL, Width = cellW, Height = fillH,
                            Weight = Math.Round(woodKg, 2),
                            Color  = "#8B5E3C",
                            IsWood = true
                        };
                        var wp = new PackedItem { Item = woodItem, X = x0, Y = yFloor, Z = z0 };
                        wood.Add(wp);
                        allItems.Add(wp); // cập nhật ngay để ô kề không bị đặt chồng
                        usedWt += woodKg;
                    }
                }
            }

            return wood;
        }
    }

    public class Space
    {
        public double X, Y, Z, W, H, D;
        public Space(double x, double y, double z, double w, double h, double d)
        { X=x; Y=y; Z=z; W=w; H=h; D=d; }
    }
}
