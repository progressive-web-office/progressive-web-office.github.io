/** DOC-055: what a click on a link does while editing — show its bubble (the default), or follow it. */
export type LinkClick = 'show' | 'follow';

const KEY = 'pwo.doc.linkClick';

export function loadLinkClick(): LinkClick {
  try {
    return localStorage.getItem(KEY) === 'follow' ? 'follow' : 'show';
  } catch {
    return 'show';
  }
}

export function saveLinkClick(value: LinkClick): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* the choice lasts for this page */
  }
}
