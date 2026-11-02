/**
 * @file cert-question.schema.spec.ts
 * @description Unit tests for CertQuestion schema and compound index
 *
 * Made by Anh Tu - Share to be share
 */

import { CertQuestion, CertQuestionSchema } from './cert-question.schema';

describe('CertQuestionSchema', () => {
  it('should be named CertQuestion', () => {
    expect(CertQuestion.name).toBe('CertQuestion');
  });

  it('should have compound unique index on certId and externalId', () => {
    const indexes = CertQuestionSchema.indexes();
    const hasCompoundIndex = indexes.some(
      ([fields, options]: any) =>
        fields.certId === 1 && fields.externalId === 1 && options?.unique === true,
    );
    expect(hasCompoundIndex).toBe(true);
  });
});
