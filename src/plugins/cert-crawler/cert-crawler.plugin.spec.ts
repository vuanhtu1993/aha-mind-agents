/**
 * @file cert-crawler.plugin.spec.ts
 * @description Unit tests for CertCrawlerPlugin
 *
 * Made by Anh Tu - Share to be share
 */

import { CertCrawlerPlugin } from './cert-crawler.plugin';

describe('CertCrawlerPlugin', () => {
  let plugin: CertCrawlerPlugin;

  beforeEach(() => {
    plugin = new CertCrawlerPlugin();
  });

  it('should be defined', () => {
    expect(plugin).toBeDefined();
  });

  it('should have valid metadata with id "cert-crawler"', () => {
    expect(plugin.metadata.id).toBe('cert-crawler');
    expect(plugin.metadata.displayName).toBe('Cert Crawler Agent');
    expect(plugin.metadata.pipelines).toHaveLength(1);
    expect(plugin.metadata.pipelines[0].id).toBe('sync');
  });

  it('should validate valid sync input', async () => {
    const valid = await plugin.validateInput('sync', { certId: 'cca-f' });
    expect(valid.certId).toBe('cca-f');
  });

  it('should reject invalid input without certId', async () => {
    await expect(plugin.validateInput('sync', {})).rejects.toThrow();
  });

  it('should return pipeline steps for sync', () => {
    const steps = plugin.getSteps('sync');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s: { id: string }) => s.id === 'attemptResolver')).toBe(true);
  });
});
