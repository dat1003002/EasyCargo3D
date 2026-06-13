using EasyCargo3D.Data;
using EasyCargo3D.Models;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Repositories
{
    public class ContainerTypeRepository : IContainerTypeRepository
    {
        private readonly AppDbContext _db;
        public ContainerTypeRepository(AppDbContext db) => _db = db;

        public Task<List<ContainerType>> GetAllActiveAsync() =>
            _db.ContainerTypes
               .Where(x => x.IsActive)
               .OrderBy(x => x.SortOrder)
               .ToListAsync();

        public Task<ContainerType?> GetByIdAsync(int id) =>
            _db.ContainerTypes.FirstOrDefaultAsync(x => x.Id == id);

        public Task<ContainerType?> GetByCodeAsync(string code) =>
            _db.ContainerTypes.FirstOrDefaultAsync(x => x.Code == code && x.IsActive);

        public async Task<ContainerType> CreateAsync(ContainerType entity)
        {
            _db.ContainerTypes.Add(entity);
            await _db.SaveChangesAsync();
            return entity;
        }

        public async Task<ContainerType> UpdateAsync(ContainerType entity)
        {
            _db.ContainerTypes.Update(entity);
            await _db.SaveChangesAsync();
            return entity;
        }

        public async Task DeleteAsync(int id)
        {
            var entity = await _db.ContainerTypes.FindAsync(id);
            if (entity != null)
            {
                entity.IsActive = false; // soft delete
                await _db.SaveChangesAsync();
            }
        }
    }
}
