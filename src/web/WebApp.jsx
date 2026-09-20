import React from 'react';
import App from '../renderer/App.jsx';
import { hostedCards } from './hostedCards.js';
import './webPlay.css';

function WebApp() {
  const [revision, setRevision] = React.useState(0);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    const unsubscribe = hostedCards.subscribe(() => setRevision(value => value + 1));
    const unsubscribeErrors = hostedCards.subscribeErrors(setError);
    return () => { unsubscribe(); unsubscribeErrors(); hostedCards.release(); };
  }, []);
  return <div className="web-application" data-platform="web" data-save-policy="manual">
    <App key={revision} />
    {error && <div className="web-resource-error" role="alert">资源卸载失败：{error.message}；请重新打开游戏列表重试。
      <button onClick={() => setError(null)} aria-label="关闭资源错误">关闭</button></div>}
  </div>;
}

export default WebApp;
