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
});
