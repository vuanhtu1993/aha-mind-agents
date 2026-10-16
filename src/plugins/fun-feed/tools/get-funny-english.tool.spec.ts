import { createGetFunnyEnglishTool } from './get-funny-english.tool';

describe('getFunnyEnglish Tool', () => {
  it('should query published memes matching criteria', async () => {
    const mediaModelMock: any = {
      find: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          title: 'Grammar meme',
          whyFunny: 'Irregular verbs mixup',
          youLearned: 'past participle',
          mediaUrl: 'https://media.giphy.com/test.gif',
        },
      ]),
    };

    const tool = createGetFunnyEnglishTool(mediaModelMock);
    const result = await (tool as any).func({ topic: 'grammar', limit: 2 });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Grammar meme');
    expect(mediaModelMock.find).toHaveBeenCalledWith({
      status: 'published',
      topic: 'grammar',
    });
  });
});
