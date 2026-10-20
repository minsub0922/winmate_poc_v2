import React from 'react';
import { TemplateLibrary } from './LibraryPage.jsx';

/** Personal templates, reached directly from the sidebar. */
export function MyTemplatesPage({ go, saved }) {
  return <TemplateLibrary go={go} personal saved={saved} />;
}
