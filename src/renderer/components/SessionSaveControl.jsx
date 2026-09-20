import React from 'react';
import PropTypes from 'prop-types';
import './sessionSaveControl.css';

export default function SessionSaveControl({ control, onReload }) {
  if (!control?.error) return null;
  return <div className="session-save-control" onClick={event => event.stopPropagation()}>
    <div role="alert">{control.error.message}
      {control.conflict ? <button onClick={onReload}>重新加载存档（丢弃本页修改）</button> : null}
    </div>
  </div>;
}
SessionSaveControl.propTypes = { control: PropTypes.object, onReload: PropTypes.func };
