using EasyCargo3D.Models;
using EasyCargo3D.Services;
using Microsoft.AspNetCore.Mvc;

namespace EasyCargo3D.Controllers
{
    [Route("api/pallet-types")]
    [ApiController]
    public class PalletTypeController : ControllerBase
    {
        private readonly IPalletTypeService _svc;
        public PalletTypeController(IPalletTypeService svc) => _svc = svc;

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
        public async Task<IActionResult> Create([FromBody] PalletType model)
        {
            var created = await _svc.CreateAsync(model);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PalletType model)
        {
            if (id != model.Id) return BadRequest("Id không khớp.");
            return Ok(await _svc.UpdateAsync(model));
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            await _svc.DeleteAsync(id);
            return NoContent();
        }
    }
}
