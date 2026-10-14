import { AgentConfig, AgentConfigSchema } from './agent-config.schema';
import mongoose from 'mongoose';

describe('AgentConfigSchema', () => {
  it('should validate nodeOverrides containing maxTokens, model, temperature, and systemPrompt', () => {
    const TestModel = mongoose.model('TestAgentConfig', AgentConfigSchema);
    const doc = new TestModel({
      agentId: 'story-shadowing',
      defaultModel: 'zai-org/glm-5.3-flash',
      nodeOverrides: {
        youtubeConsolidator: {
          model: 'deepseek-v4.1-flash',
          systemPrompt: 'Custom prompt',
          temperature: 0.2,
          maxTokens: 16384,
        },
      },
    });

    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.nodeOverrides?.youtubeConsolidator.maxTokens).toBe(16384);
    expect(doc.nodeOverrides?.youtubeConsolidator.model).toBe('deepseek-v4.1-flash');
  });
});
