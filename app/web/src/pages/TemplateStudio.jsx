import React from 'react';
import { requestJson } from '../api/client.js';
import { Toasts } from '../components/common.jsx';
import { SpatialPage } from './SpatialStudioPage.jsx';
import { BuildingPage } from './BuildingPage.jsx';

const endpoint = id => '/admin/api/spatial-templates/' + encodeURIComponent(id);
function notify(id, event, value) {
  if (parent !== window) parent.postMessage({ type: 'winmate-template-studio', id, event, value }, location.origin);
}
const managed = {
  load: id => requestJson(endpoint(id)),
  dirty: (id, value) => notify(id, 'dirty', value),
  async save(id, scene, revision) {
    const result = await requestJson(endpoint(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, revision, confirmed: true }) });
    notify(id, 'saved', result.revision);
    return result;
  },
};

export function TemplateStudio({ id }) {
  return <div className="sp-template-studio">{id.startsWith('building:')
    ? <BuildingPage id={id} managed={managed}/> : <SpatialPage id={id} managed={managed}/>}<Toasts/></div>;
}
