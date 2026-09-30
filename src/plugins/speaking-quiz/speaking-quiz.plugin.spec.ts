import { SpeakingQuizPlugin } from './speaking-quiz.plugin';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';

describe('SpeakingQuizPlugin', () => {
  let plugin: SpeakingQuizPlugin;
  let mockPipeline: Partial<SpeakingQuizPipelineService>;

  beforeEach(() => {
    mockPipeline = {
      execute: jest.fn(),
    };
    plugin = new SpeakingQuizPlugin(mockPipeline as SpeakingQuizPipelineService);
  });

  it('should have valid metadata', () => {
    expect(plugin.metadata.id).toBe('speaking-quiz');
    expect(plugin.metadata.displayName).toBe('Speaking Quiz Agent');
    expect(plugin.metadata.pipelines.length).toBeGreaterThan(0);
  });

  it('should validate inputs properly', async () => {
    await expect(plugin.validateInput('generate', { storybookId: 'id123' })).resolves.toBeDefined();
    await expect(plugin.validateInput('generate', {})).rejects.toThrow();
  });

  it('should return pipeline steps', () => {
    const steps = plugin.getSteps('generate');
    expect(steps.length).toBe(4);
    expect(steps[0].id).toBe('contextResolver');
  });
});
