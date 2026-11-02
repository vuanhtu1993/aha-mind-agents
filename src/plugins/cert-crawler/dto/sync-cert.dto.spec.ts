/**
 * @file sync-cert.dto.spec.ts
 * @description Unit tests for SyncCertDto validation
 *
 * Made by Anh Tu - Share to be share
 */

import { validate } from 'class-validator';
import { SyncCertDto } from './sync-cert.dto';

describe('SyncCertDto', () => {
  it('should validate valid certId', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'cca-f';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty certId', async () => {
    const dto = new SyncCertDto();
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
