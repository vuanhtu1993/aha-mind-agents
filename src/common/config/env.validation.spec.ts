import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('should successfully validate and return default values for valid config', () => {
    const validConfig = {
      MONGODB_URI: 'mongodb://localhost:27017/test-db',
    };

    const validated = validateEnv(validConfig);
    expect(validated.MONGODB_URI).toBe('mongodb://localhost:27017/test-db');
    expect(validated.PORT).toBe(3001);
    expect(validated.REDIS_URL).toBe('redis://localhost:6379');
    expect(validated.GEMINI_MODEL).toBe('gemini-3.5-flash');
  });

  it('should throw error when MONGODB_URI is missing', () => {
    const invalidConfig = {
      PORT: '3001',
    };

    expect(() => validateEnv(invalidConfig)).toThrow('[EnvValidation]');
  });

  it('should support Hive AI configuration with defaults', () => {
    const env = {
      MONGODB_URI: 'mongodb://localhost:27017/test',
      HIVE_API_KEY: 'test-hive-key',
    };
    const validated = validateEnv(env);
    expect(validated.HIVE_API_KEY).toBe('test-hive-key');
    expect(validated.HIVE_MODEL).toBe('zai-org/glm-5.3-flash');
    expect(validated.HIVE_BASE_URL).toBe('https://api.thehive.ai/api/v3');
  });
});

