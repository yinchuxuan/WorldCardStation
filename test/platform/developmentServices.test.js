import { createTauriRendererServices } from '../../src/renderer/platform/tauriRendererServices.js';
import { createMemoryRendererServices } from '../../src/renderer/platform/memoryRendererServices.js';

describe('Development service contract', () => {
  test('maps the read-only instruction request without renderer-supplied paths', async () => {
    const invoke = jest.fn().mockResolvedValue('native instructions');
    const services = createTauriRendererServices({ invoke });
    await expect(services.development.getInstructions()).resolves.toBe('native instructions');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('get_game_card_development_instructions', {});
  });

  test('normalizes native resource errors', async () => {
    const services = createTauriRendererServices({
      invoke: jest.fn().mockRejectedValue('客户端开发包不完整')
    });
    await expect(services.development.getInstructions()).rejects.toThrow('客户端开发包不完整');
  });

  test('memory platform supplies instructions without native access', async () => {
    const services = createMemoryRendererServices({ developmentInstructions: 'fixture instructions' });
    await expect(services.development.getInstructions()).resolves.toBe('fixture instructions');
    await expect(createMemoryRendererServices().development.getInstructions()).resolves.toEqual(expect.any(String));
  });
});
