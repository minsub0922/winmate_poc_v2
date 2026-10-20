import React from 'react';
import { TemplateLibrary } from './LibraryPage.jsx';

/** Favourites have their own page and independent search/filter state. */
export function FavoritesPage({ go }) {
  return <TemplateLibrary go={go} favorites />;
}
