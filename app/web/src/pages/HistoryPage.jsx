import {FeedbackPopup} from '../components/feedback-popup.jsx';
import React, { useEffect, useState } from 'react';
import { requestJson } from '../api/client.js';
import { getProposal, sharedProposal } from '../repositories/proposals.js';
import { accountSyncReady } from '../repositories/account-sync.js';

/** Restore a direct owner URL on a browser that does not yet have its history. */
export function HistoryPage({ id, go }) {
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    // The account's records may still be on their way (a slow first load): this history is usually among them, with
    // the fill state of every sheet. Read the shared original only when the account does not hold it.
    accountSyncReady().then(() => controller.signal.aborted || getProposal(id) ? null
      : requestJson('/api/history/' + encodeURIComponent(id), { signal: controller.signal }).then(snapshot => {
        if (!controller.signal.aborted) sharedProposal(snapshot, id);
      })).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id, retry]);
  return <><FeedbackPopup message={error} actionLabel="다시 시도" onAction={()=>setRetry(x=>x+1)}/><div className="boot"><b>제안서 히스토리</b>{!error&&<span className="spin"/>}</div></>;
}
