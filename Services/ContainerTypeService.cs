using EasyCargo3D.Models;
using EasyCargo3D.Repositories;

namespace EasyCargo3D.Services
{
    public class ContainerTypeService : IContainerTypeService
    {
        private readonly IContainerTypeRepository _repo;
        public ContainerTypeService(IContainerTypeRepository repo) => _repo = repo;

        public Task<List<ContainerType>> GetAllAsync() => _repo.GetAllActiveAsync();

        public Task<ContainerType?> GetByIdAsync(int id) => _repo.GetByIdAsync(id);

        public Task<ContainerType?> GetByCodeAsync(string code) => _repo.GetByCodeAsync(code);

        public async Task<ContainerType> CreateAsync(ContainerType model)
        {
            if (string.IsNullOrWhiteSpace(model.Code))
                throw new ArgumentException("Code không được để trống.");
            return await _repo.CreateAsync(model);
        }

        public async Task<ContainerType> UpdateAsync(ContainerType model)
        {
            var existing = await _repo.GetByIdAsync(model.Id)
                ?? throw new KeyNotFoundException($"Không tìm thấy ContainerType Id={model.Id}");
            existing.Name      = model.Name;
            existing.Length    = model.Length;
            existing.Width     = model.Width;
            existing.Height    = model.Height;
            existing.MaxWeight = model.MaxWeight;
            existing.Icon      = model.Icon;
            existing.SortOrder = model.SortOrder;
            existing.IsActive  = model.IsActive;
            return await _repo.UpdateAsync(existing);
        }

        public Task DeleteAsync(int id) => _repo.DeleteAsync(id);
    }
}
