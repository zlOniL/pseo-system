import { CitiesService } from './cities.service';

describe('CitiesService', () => {
  it('returns the same 38 main localities used by scale generation', () => {
    const service = new CitiesService();
    service.onModuleInit();

    const localities = service.getMainLocalities();

    expect(localities).toHaveLength(38);
    expect(localities).toContain('Setúbal');
    expect(localities).toContain('Guimarães');
    expect(localities).toContain('Olhão');
  });
});
