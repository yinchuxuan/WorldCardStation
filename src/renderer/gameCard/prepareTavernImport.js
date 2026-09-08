import { compileTavern } from './compileTavern.js';

export function checkImportCanceled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('导入已取消'), { canceled: true });
}

export async function prepareTavernImport(task, { repository, confirm, targetCard, signal, onProgress }) {
  checkImportCanceled(signal);
  onProgress?.('正在转换酒馆卡…');
  const result = await compileTavern({ ...task, id: targetCard?.id || task.id }, signal);
  checkImportCanceled(signal);
  const errors = result.report.filter(item => item.severity === 'error');
  if (errors.length) throw new Error(errors.map(item => `${item.location}：${item.message}`).join('\n'));
  onProgress?.('正在校验游戏卡…');
  const { files, copies, worldbook } = result;
  const { revision } = await repository.stageTavernImport(task.token, { files, copies, worldbook }, targetCard?.id || null);
  checkImportCanceled(signal);
  const warnings = result.report.filter(item => item.severity === 'warning');
  const requests = [];
  if (warnings.length) requests.push({ kind: 'compatibility', name: result.summary.name, report: warnings });
  if (targetCard) requests.push({ kind: 'overwrite', name: result.summary.name, targetCard });
  for (const request of requests) {
    if (typeof confirm !== 'function') throw new Error('此导入存在兼容差异或覆盖风险，需要确认');
    if (await confirm(request) !== true) return null;
    checkImportCanceled(signal);
  }
  return revision;
}
