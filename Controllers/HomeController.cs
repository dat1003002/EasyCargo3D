using Microsoft.AspNetCore.Mvc;
using EasyCargo3D.Models;
using EasyCargo3D.Services;

namespace EasyCargo3D.Controllers
{
    public class HomeController : Controller
    {
        private readonly PackingService _packing = new();

        public IActionResult Index()
        {
            ViewBag.Containers = PackingService.GetContainerTypes();
            return View();
        }

        [HttpPost]
        public IActionResult Calculate([FromBody] LoadingRequest request)
        {
            if (request == null || request.Items == null || request.Items.Count == 0)
                return BadRequest("No items provided");

            var plan = _packing.Calculate(request);
            return Json(plan);
        }

        [HttpPost]
        public IActionResult Optimize([FromBody] OptimizeRequest request)
        {
            if (request?.ItemTypes == null || request.ItemTypes.Count == 0)
                return BadRequest("No item types provided");
            return Json(_packing.Optimize(request));
        }

        [HttpPost]
        public IActionResult PackMultiple([FromBody] MultiContainerRequest request)
        {
            if (request?.Items == null || request.Items.Count == 0)
                return BadRequest("No items provided");
            return Json(_packing.PackMultiple(request));
        }

        [HttpPost]
        public IActionResult FillWood([FromBody] LoadingPlan plan)
        {
            if (plan?.PackedItems == null || plan.PackedItems.Count == 0)
                return BadRequest("No packed items");
            return Json(_packing.AddWoodDunnage(plan));
        }

        [HttpPost]
        public IActionResult PackAuto([FromBody] MultiContainerRequest request)
        {
            if (request?.Items == null || request.Items.Count == 0)
                return BadRequest("No items provided");
            return Json(_packing.PackAuto(request));
        }

        [HttpGet]
        public IActionResult GetContainers() => Json(PackingService.GetContainerTypes());
    }
}
