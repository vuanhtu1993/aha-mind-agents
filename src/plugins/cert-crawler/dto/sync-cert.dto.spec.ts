/**
 * @file sync-cert.dto.spec.ts
 * @description Unit tests for SyncCertDto
 *
 * Made by Anh Tu - Share to be share
 */

import { validate } from 'class-validator';
import { SyncCertDto } from './sync-cert.dto';

describe('SyncCertDto', () => {
  it('should validate valid certId without optional flags', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'cca-f';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate valid certId with boolean force and resetCooldown flags', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'ccao-f';
    dto.force = true;
    dto.resetCooldown = true;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-boolean force flag', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'ccao-f';
    (dto as any).force = 'not-a-boolean';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-boolean resetCooldown flag', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'ccao-f';
    (dto as any).resetCooldown = 'not-a-boolean';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty certId', async () => {
    const dto = new SyncCertDto();
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
