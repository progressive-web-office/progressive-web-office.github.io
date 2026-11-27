import { describe, expect, it } from 'vitest';
import { SAMPLE } from './canvas-fixtures';
import { anchor, arrowHead, bounds, CanvasError, colourCss, drawingOrder, edgeEnds, edgeGeometry, emptyCanvasText, facingSides, nearestSide, newId, nodesInGroup, parseCanvas, PRESET_COLOURS, serializeCanvas } from '../src/canvas/model';

describe('CANVAS-001 reading a JSON Canvas file', () => {
  it('reads nodes of every type and edges, keeping unknown types and fields', () => {
    const doc = parseCanvas(SAMPLE);
    expect(doc.nodes.map((n) => n.type)).toEqual(['group', 'text', 'file', 'link', 'sticker']);
    expect(doc.nodes[0]!.futureField).toBe(true);
    expect(doc.nodes[2]).toMatchObject({ file: 'Notes/Plan.md', subpath: '#Goals' });
    expect(doc.edges[0]).toMatchObject({ fromSide: 'right', toSide: 'left', label: 'leads to' });
    expect(doc.indent).toBe('\t');
  });
  it('reads an empty file as an empty canvas', () => {
    expect(parseCanvas('')).toMatchObject({ nodes: [], edges: [] });
    expect(parseCanvas('{}')).toMatchObject({ nodes: [], edges: [] });
  });
  it.each([
    ['not json', /not JSON/],
    ['[]', /not a canvas/],
    ['{"nodes":{}}', /"nodes" is not a list/],
    ['{"nodes":[{"type":"text","x":0,"y":0,"width":1,"height":1}]}', /has no id/],
    ['{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":1}]}', /has no height/],
    ['{"edges":[{"id":"e","fromNode":"a"}]}', /has no ends/],
  ])('refuses %s with an explanation', (text, message) => {
    expect(() => parseCanvas(text)).toThrow(CanvasError);
    expect(() => parseCanvas(text)).toThrow(message);
  });
  it('gives the six preset colours and any #RRGGBB', () => {
    expect(Object.keys(PRESET_COLOURS)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(colourCss('3')).toBe(PRESET_COLOURS['3']);
    expect(colourCss('#A1b2C3')).toBe('#A1b2C3');
    expect(colourCss('red')).toBeUndefined();
    expect(colourCss(undefined)).toBeUndefined();
  });
  it('draws groups behind the other nodes', () => {
    const doc = parseCanvas(SAMPLE);
    expect(drawingOrder([...doc.nodes].reverse()).map((n) => n.id)[0]).toBe('g1');
  });
  it('has the default ends of the format: an arrow at the end only', () => {
    const [e1, e2] = parseCanvas(SAMPLE).edges;
    expect(edgeEnds(e1!)).toEqual({ from: 'none', to: 'arrow' });
    expect(edgeEnds(e2!)).toEqual({ from: 'arrow', to: 'none' });
  });
});

describe('CANVAS-001 geometry', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 };
  const b = { x: 300, y: 0, width: 100, height: 50 };
  it('gives the bounds of the nodes and the middle of their sides', () => {
    expect(bounds([a, b])).toEqual({ x: 0, y: 0, width: 400, height: 50 });
    expect(bounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(anchor(a, 'right')).toEqual({ x: 100, y: 25 });
    expect(anchor(a, 'top')).toEqual({ x: 50, y: 0 });
  });
  it('chooses the sides facing each other and the side nearest a point', () => {
    expect(facingSides(a, b)).toEqual(['right', 'left']);
    expect(facingSides(a, { x: 0, y: 300, width: 100, height: 50 })).toEqual(['bottom', 'top']);
    expect(nearestSide(b, { x: 290, y: 20 })).toBe('left');
  });
  it('draws a curve leaving each node perpendicularly, with its middle and arrow head', () => {
    const g = edgeGeometry(a, b, 'right', 'left');
    expect(g.path.startsWith('M 100 25 C')).toBe(true);
    expect(g.path.endsWith('300 25')).toBe(true);
    expect(g.middle).toEqual({ x: 200, y: 25 });
    expect(g.toDir).toEqual({ x: 1, y: 0 });
    expect(arrowHead({ x: 300, y: 25 }, g.toDir).split(' ')).toHaveLength(3);
  });
  it('finds the nodes inside a group', () => {
    const doc = parseCanvas(SAMPLE);
    expect(nodesInGroup(doc.nodes[0]!, doc.nodes).map((n) => n.id)).toEqual(['t1', 'f1']);
  });
});

describe('CANVAS-001 a .canvas file is opened', () => {
  it('is accepted by the open dialog and read as text, to be shown by the canvas view', async () => {
    const { ACCEPTED_EXTENSIONS, detectFormat } = await import('../src/core/format');
    expect(ACCEPTED_EXTENSIONS).toContain('.canvas');
    expect(detectFormat('plan.canvas', new TextEncoder().encode(SAMPLE))).toBe('text');
  });
});

describe('CANVAS-004 writing a JSON Canvas file', () => {
  it('writes back the same file when nothing changed (fields, order, indentation)', () => {
    const doc = parseCanvas(SAMPLE);
    expect(JSON.parse(serializeCanvas(doc))).toEqual(JSON.parse(SAMPLE));
    expect(serializeCanvas(doc)).toContain('\n\t"nodes": [');
    expect(Object.keys(JSON.parse(serializeCanvas(doc)))).toEqual(['nodes', 'edges', 'meta']);
  });
  it('keeps unknown node types and fields through a change', () => {
    const doc = parseCanvas(SAMPLE);
    doc.nodes[1]!.x = 10;
    const back = JSON.parse(serializeCanvas(doc));
    expect(back.nodes[1].x).toBe(10);
    expect(back.nodes[4]).toEqual({ id: 'x1', type: 'sticker', x: 600, y: 400, width: 50, height: 50, emoji: '*' });
    expect(back.nodes[0].futureField).toBe(true);
  });
  it('writes a new canvas with two-space indentation', () => {
    expect(emptyCanvasText()).toBe('{\n  "nodes": [],\n  "edges": []\n}\n');
  });
  it('makes identifiers of 16 hexadecimal digits, never one already taken', () => {
    const id = newId(['a']);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
