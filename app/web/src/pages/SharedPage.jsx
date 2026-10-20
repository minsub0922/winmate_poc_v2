import {FeedbackPopup} from '../components/feedback-popup.jsx';
import React, { useEffect, useState } from 'react';
import { getBootstrap } from '../api/bootstrap.js';
import { useStore, getProposal } from '../repositories/proposals.js';
import { connectShared } from '../services/sharing.js';
import { ProposalScreen } from './ProposalPage.jsx';

export function SharedPage({ token, go }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const initial = getBootstrap().shared;
    return connectShared(token, { snapshot: initial?.token === token ? initial : null }).subscribe(setState);
  }, [token]);
  const p = useStore(() => state?.proposalId ? getProposal(state.proposalId) : null);
  if (!p) return <><FeedbackPopup message={state?.error} actionLabel="다시 시도" onAction={()=>connectShared(token).refresh()}/><div className="boot"><b>공유 Storyboard</b>{!state?.error&&<span className="spin"/>}</div></>;
  return <ProposalScreen key={p.id} p={p} go={go} />;
}
