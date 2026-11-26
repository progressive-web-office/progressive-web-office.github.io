/**
 * PSEUDO-032: XML parts of untrusted packages. A document type declaration
 * (and so any entity) is refused before parsing: OOXML and OpenDocument never
 * need one, and browsers differ on how they expand internal entities.
 */
import { LIMITS, Refusal } from '../limits';

const DECLARATION = /^﻿?\s*<\?xml[^?]*\?>/;

export interface XmlPart {
  doc: Document;
  /** The XML declaration of the source, written back as it was. */
  declaration: string;
}

export function decodeXml(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export function parseXmlPart(text: string, name: string): XmlPart {
  if (text.length > LIMITS.xmlChars) throw new Refusal('xml-too-large', name);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Refusal('doctype', name);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Refusal('xml-invalid', name);
  return { doc, declaration: DECLARATION.exec(text)?.[0].replace(/^﻿?\s*/, '') ?? '' };
}

export function serializeXmlPart(part: XmlPart): string {
  const body = new XMLSerializer().serializeToString(part.doc).replace(DECLARATION, '');
  return part.declaration ? `${part.declaration}\n${body}` : body;
}

/** Parts read as XML: by extension, or by content for extension-less parts. */
export function looksLikeXml(name: string, data: Uint8Array): boolean {
  if (/\.(xml|rels|vml)$/i.test(name)) return true;
  if (/\.[a-z0-9]{1,5}$/i.test(name.split('/').pop() ?? '')) return false;
  let i = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0;
  while (i < data.length && (data[i] === 0x20 || data[i] === 0x0a || data[i] === 0x0d || data[i] === 0x09)) i++;
  return data[i] === 0x3c;
}
