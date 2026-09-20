import React, { useEffect, useState } from 'react';
import { loadCatalog } from './catalog.js';
import './webCatalog.css';

function WebCatalog() {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    // The HTML entry has no client routes; this honors both / and deployed subdirectories.
    const base = new URL('cards/', document.baseURI);
    loadCatalog(base, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setCards(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className="web-catalog" aria-label="游戏目录">
      <h2>游戏目录</h2>
      {error ? <div role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>重试</button></div>
        : cards === null ? <p>正在读取游戏目录…</p>
          : cards.length === 0 ? <p>暂时没有已发布的游戏卡。</p>
            : <ul>{cards.map(card => (
              <li key={card.cardId} data-card-id={card.cardId}>
                {card.coverUrl && <img src={card.coverUrl} alt={`${card.name}封面`} referrerPolicy="no-referrer" />}
                <h3>{card.name}</h3>
                <p>版本 {card.cardVersion}</p>
                <p>{card.description}</p>
                <button type="button" disabled>开始游玩（筹备中）</button>
              </li>
            ))}</ul>}
    </section>
  );
}

export default WebCatalog;
