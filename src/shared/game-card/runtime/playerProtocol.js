function requirePlayerProtocol(card) {
  if (card && card.formatVersion !== '2') {
    throw new Error('此游戏卡使用旧版协议或未知版本，请迁移到 formatVersion "2" 后重新导入；旧存档不自动迁移。');
  }
  return card || null;
}

export { requirePlayerProtocol };
