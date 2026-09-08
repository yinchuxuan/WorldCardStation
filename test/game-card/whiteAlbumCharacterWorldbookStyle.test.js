const fs = require('node:fs');
const path = require('node:path');

const entriesDir = path.join(
  __dirname, '../../game-card-examples/white-album-2/worldbook/entries'
);
const characters = [
  '北原春希', '冬马和纱', '小木曾雪菜', '饭冢武也', '水泽依绪',
  '早坂亲志', '柳原朋', '小木曾孝宏', '三年E班班主任', '诹访老师'
].map(name => fs.readFileSync(path.join(entriesDir, `${name}.md`), 'utf-8')).join('\n');

describe('white album character worldbook style', () => {
  test('describes characters through playable speech and behavior', () => {
    expect(characters).not.toContain('性格外向轻浮');
    expect(characters).not.toContain('性格开朗直率');
    expect(characters).not.toContain('性格直接、现实');
    expect(characters).not.toContain('性格随性又爱耍滑头');
    expect(characters).not.toContain('性格尖锐');
    expect(characters).toContain('看见没人处理的通知、排练安排或同学惹出的麻烦时');
    expect(characters).toContain('“烦死了”“笨蛋”“随你”之类的短句');
    expect(characters).toContain('用“大家一起”确认共同安排');
    expect(characters).toContain('替春希约人、制造见面机会');
    expect(characters).toContain('直接邀请对方一起玩或留下吃饭');
    expect(characters).toContain('问清“你到底想怎么做”');
    expect(characters).toContain('先套近乎、夸他可靠');
    expect(characters).toContain('“只是开玩笑”或“只是听别人说的”');
    expect(characters).toContain('训话会从眼前发生的具体事情讲起');
    expect(characters).toContain('先引用校规、出勤或升学程序');
  });
});
