function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function validateSession(session) {
  const snapshot = session?.snapshot;
  if (!session?.id || !Number.isInteger(session.revision) || session.revision < 0
      || !object(snapshot) || !Array.isArray(snapshot.messages) || !object(snapshot.gameState)
      || !object(snapshot.viewState)
      || snapshot.retryBaseMessages !== null && !Array.isArray(snapshot.retryBaseMessages)
      || snapshot.retryBaseState !== null && !object(snapshot.retryBaseState)) {
    throw new Error('会话快照已损坏，不能恢复或覆盖；请保留浏览器数据并检查存档');
  }
  const reading = snapshot.viewState.reading;
  if (reading && (!object(reading) || typeof reading.messageId !== 'string'
    || !Number.isInteger(reading.segmentIndex) || reading.segmentIndex < 0)) {
    throw new Error('会话阅读位置已损坏，不能恢复或覆盖');
  }
  return session;
}
