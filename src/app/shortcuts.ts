/** App shortcuts of the installed application (PLT-009). */
import { inExam } from '../exam/mode';
import type { App } from './app';

const SHORTCUT_KINDS = ['document', 'spreadsheet', 'presentation'] as const;

/** Start a new document asked by an app shortcut, `?new=document|spreadsheet|presentation`. */
export async function openNewFromShortcut(app: App): Promise<void> {
  const params = new URLSearchParams(location.search);
  const kind = params.get('new');
  if (kind === null) return;
  params.delete('new');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  const wanted = SHORTCUT_KINDS.find((k) => k === kind);
  if (wanted && !inExam()) await app.newDocument(wanted);
}
