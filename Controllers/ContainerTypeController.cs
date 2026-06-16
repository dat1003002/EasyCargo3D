using EasyCargo3D.Models;
using EasyCargo3D.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EasyCargo3D.Controllers
{
    [Route("api/container-types")]
    [ApiController]
    public class ContainerTypeController : ControllerBase
    {
        private readonly IContainerTypeService _svc;
        public ContainerTypeController(IContainerTypeService svc) => _svc = svc;

        [HttpGet]
        public async Task<IActionResult> GetAll() =>
            Ok(await _svc.GetAllAsync());

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var item = await _svc.GetByIdAsync(id);
            return item is null ? NotFound() : Ok(item);
        }

        [HttpGet("by-code/{code}")]
        public async Task<IActionResult> GetByCode(string code)
        {
            var item = await _svc.GetByCodeAsync(code);
            return item is null ? NotFound() : Ok(item);
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Create([FromBody] ContainerType model)
        {
            var created = await _svc.CreateAsync(model);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }

        [HttpPut("{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Update(int id, [FromBody] ContainerType model)
        {
            if (id != model.Id) return BadRequest("Id không khớp.");
            return Ok(await _svc.UpdateAsync(model));
        }

        [HttpDelete("{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Delete(int id)
        {
            await _svc.DeleteAsync(id);
            return NoContent();
        }
    }
}
