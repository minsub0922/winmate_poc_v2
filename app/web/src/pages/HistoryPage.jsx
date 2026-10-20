import {FeedbackPopup} from '../components/feedback-popup.jsx';
import React, { useEffect, useState } from 'react';
import { requestJson } from '../api/client.js';
import { sharedProposal } from '../repositories/proposals.js';

/** Restore a direct owner URL on a browser that does not yet have its history. */
export function HistoryPage({ id, go }) {
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    requestJson('/api/history/' + encodeURIComponent(id), { signal: controller.signal }).then(snapshot => {
      if (!controller.signal.aborted) sharedProposal(snapshot, id);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, retry]);
  return <><FeedbackPopup message={error} actionLabel="다시 시도" onAction={()=>setRetry(x=>x+1)}/><div className="boot"><b>제안서 히스토리</b>{!error&&<span className="spin"/>}</div></>;
}
