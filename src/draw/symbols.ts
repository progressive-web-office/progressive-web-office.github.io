/**
 * DRAW-005: libraries of schematic symbols. Each symbol is drawn around its
 * centre, in drawing units (the grid step is 10), with its pins on the grid
 * so that wires snap to them whatever the quarter turn.
 */

export type Pt = [number, number];

export type SymbolCategory = 'electrical' | 'logic' | 'block' | 'fluid' | 'flowchart' | 'ladder' | 'fbd' | 'sfc';

export interface SymbolDef {
  id: string;
  name: string;
  category: SymbolCategory;
  /** Extra words for the search (other names, standard numbers). */
  keywords?: string;
  /** Reference prefix (R → R1, R2…); empty for symbols without a reference. */
  prefix: string;
  /** Unit of the value (Ω, F, H…), added when the value is a bare number. */
  unit?: string;
  /** The value is written inside the symbol (flowcharts, blocks) rather than beside it. */
  inside?: boolean;
  /** Where the value goes otherwise: above (ladder variables) or to the right (SFC transitions); below by default. */
  label?: 'above' | 'right';
  /** Pins, relative to the centre. */
  pins: Pt[];
  /** Bounding box [x0, y0, x1, y1], relative to the centre. */
  box: [number, number, number, number];
  /** SVG markup, stroked with the current colour and not filled unless stated. */
  body: string;
}

const L = (...pts: number[]): string => {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
  return `<path d="${d}"/>`;
};
const C = (x: number, y: number, r: number, fill = false): string => `<circle cx="${x}" cy="${y}" r="${r}"${fill ? ' fill="currentColor"' : ''}/>`;
const T = (x: number, y: number, text: string, size = 10): string =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`;
const arrowHead = (x: number, y: number, angle: number, size = 5): string => {
  const a = (angle * Math.PI) / 180;
  const p = (da: number): string => `${(x - size * Math.cos(a + da)).toFixed(1)} ${(y - size * Math.sin(a + da)).toFixed(1)}`;
  return `<path d="M${x} ${y}L${p(0.45)}L${p(-0.45)}Z" fill="currentColor"/>`;
};
/** Leads from the two horizontal pins (±30) to the body (±inner). */
const leads = (inner: number, outer = 30): string => L(-outer, 0, -inner, 0) + L(inner, 0, outer, 0);
const H2: Pt[] = [[-30, 0], [30, 0]];
const V2: Pt[] = [[0, -30], [0, 30]];
const HBOX = (h: number): [number, number, number, number] => [-30, -h, 30, h];
const VBOX = (w: number): [number, number, number, number] => [-w, -30, w, 30];

const diode = (extra = ''): string => leads(8) + '<path d="M-8 -8L-8 8L8 0Z"/>' + extra;
const bjt = (pnp: boolean): string =>
  C(2, 0, 17) + L(-30, 0, -6, 0) + L(-6, -12, -6, 12) + L(-6, -5, 10, -15, 10, -30) + L(-6, 5, 10, 15, 10, 30) +
  (pnp ? arrowHead(-4, 6.3, 212) : arrowHead(8, 13.8, 32));
const mos = (p: boolean): string =>
  C(2, 0, 17) + L(-30, 0, -10, 0) + L(-10, -12, -10, 12) + L(-5, -14, -5, -7) + L(-5, -3, -5, 3) + L(-5, 7, -5, 14) +
  L(-5, -10, 10, -10, 10, -30) + L(-5, 10, 10, 10, 10, 30) + L(-5, 0, 10, 0, 10, 10) + (p ? arrowHead(8, 0, 0) : arrowHead(-4, 0, 180));
const coilArcs = (from: number, to: number, r = 5): string => {
  let d = `M${from} 0`;
  for (let x = from; x < to; x += 2 * r) d += `A${r} ${r} 0 0 1 ${x + 2 * r} 0`;
  return `<path d="${d}"/>`;
};
const vCoil = (x: number, side: 1 | -1): string => {
  let d = `M${x} -20`;
  for (let y = -20; y < 20; y += 10) d += `A5 5 0 0 ${side > 0 ? 1 : 0} ${x} ${y + 10}`;
  return `<path d="${d}"/>`;
};
const spring = (x0: number, x1: number, h = 6): string => {
  const n = 6;
  const step = (x1 - x0) / n;
  let d = `M${x0} 0`;
  for (let i = 1; i <= n; i++) d += `L${x0 + i * step} ${i === n ? 0 : i % 2 ? -h : h}`;
  return `<path d="${d}"/>`;
};

const ELECTRICAL: SymbolDef[] = [
  { id: 'resistor', name: 'Resistor', category: 'electrical', keywords: 'IEC 60617-04-01-01', prefix: 'R', unit: 'Ω', pins: H2, box: HBOX(6), body: leads(20) + '<rect x="-20" y="-6" width="40" height="12"/>' },
  {
    id: 'potentiometer', name: 'Potentiometer', category: 'electrical', keywords: 'variable resistor rheostat', prefix: 'R', unit: 'Ω', pins: [[-30, 0], [30, 0], [0, -20]], box: [-30, -20, 30, 6],
    body: leads(20) + '<rect x="-20" y="-6" width="40" height="12"/>' + L(0, -20, 0, -8) + arrowHead(0, -6, 90),
  },
  { id: 'capacitor', name: 'Capacitor', category: 'electrical', prefix: 'C', unit: 'F', pins: H2, box: HBOX(12), body: leads(4) + L(-4, -12, -4, 12) + L(4, -12, 4, 12) },
  {
    id: 'capacitor-polarised', name: 'Polarised capacitor', category: 'electrical', keywords: 'electrolytic', prefix: 'C', unit: 'F', pins: H2, box: HBOX(12),
    body: L(-30, 0, -4, 0) + L(8, 0, 30, 0) + L(-4, -12, -4, 12) + '<path d="M10 -12Q4 0 10 12"/>' + T(-12, -9, '+', 9),
  },
  { id: 'inductor', name: 'Inductor', category: 'electrical', keywords: 'coil choke', prefix: 'L', unit: 'H', pins: H2, box: HBOX(6), body: leads(20) + coilArcs(-20, 20) },
  { id: 'diode', name: 'Diode', category: 'electrical', prefix: 'D', pins: H2, box: HBOX(8), body: diode(L(8, -8, 8, 8)) },
  {
    id: 'led', name: 'Light-emitting diode (LED)', category: 'electrical', keywords: 'LED', prefix: 'D', pins: H2, box: [-30, -20, 30, 8],
    body: diode(L(8, -8, 8, 8)) + L(0, -10, 8, -18) + arrowHead(8, -18, -45, 4) + L(6, -8, 14, -16) + arrowHead(14, -16, -45, 4),
  },
  { id: 'zener', name: 'Zener diode', category: 'electrical', prefix: 'D', pins: H2, box: HBOX(10), body: diode(L(4, -10, 8, -8, 8, 8, 12, 10)) },
  { id: 'npn', name: 'NPN transistor', category: 'electrical', keywords: 'bipolar BJT', prefix: 'Q', pins: [[-30, 0], [10, -30], [10, 30]], box: [-30, -30, 19, 30], body: bjt(false) },
  { id: 'pnp', name: 'PNP transistor', category: 'electrical', keywords: 'bipolar BJT', prefix: 'Q', pins: [[-30, 0], [10, -30], [10, 30]], box: [-30, -30, 19, 30], body: bjt(true) },
  { id: 'nmos', name: 'N-channel MOSFET', category: 'electrical', keywords: 'transistor NMOS', prefix: 'Q', pins: [[-30, 0], [10, -30], [10, 30]], box: [-30, -30, 19, 30], body: mos(false) },
  { id: 'pmos', name: 'P-channel MOSFET', category: 'electrical', keywords: 'transistor PMOS', prefix: 'Q', pins: [[-30, 0], [10, -30], [10, 30]], box: [-30, -30, 19, 30], body: mos(true) },
  {
    id: 'opamp', name: 'Operational amplifier', category: 'electrical', keywords: 'op-amp comparator', prefix: 'U', pins: [[-30, -10], [-30, 10], [40, 0]], box: [-30, -30, 40, 30],
    body: '<path d="M-20 -30L-20 30L30 0Z"/>' + L(-30, -10, -20, -10) + L(-30, 10, -20, 10) + L(30, 0, 40, 0) + T(-13, -10, '−') + T(-13, 10, '+'),
  },
  { id: 'vdc', name: 'Voltage source (DC)', category: 'electrical', keywords: 'generator', prefix: 'V', unit: 'V', pins: V2, box: VBOX(12), body: C(0, 0, 12) + L(0, -30, 0, -12) + L(0, 12, 0, 30) + T(0, -5, '+', 9) + T(0, 6, '−', 9) },
  { id: 'vac', name: 'Voltage source (AC)', category: 'electrical', keywords: 'generator alternating sine', prefix: 'V', unit: 'V', pins: V2, box: VBOX(12), body: C(0, 0, 12) + L(0, -30, 0, -12) + L(0, 12, 0, 30) + '<path d="M-7 0Q-3.5 -8 0 0T7 0"/>' },
  { id: 'idc', name: 'Current source', category: 'electrical', prefix: 'I', unit: 'A', pins: V2, box: VBOX(12), body: C(0, 0, 12) + L(0, -30, 0, -12) + L(0, 12, 0, 30) + L(0, 7, 0, -4) + arrowHead(0, -7, -90) },
  { id: 'battery', name: 'Battery', category: 'electrical', keywords: 'cell', prefix: 'B', unit: 'V', pins: V2, box: VBOX(12), body: L(0, -30, 0, -4) + L(0, 4, 0, 30) + L(-12, -4, 12, -4) + '<path d="M-6 4L6 4" stroke-width="4"/>' + T(10, -12, '+', 9) },
  { id: 'ground', name: 'Earth, ground', category: 'electrical', keywords: '0 V common', prefix: '', pins: [[0, -10]], box: [-12, -10, 12, 8], body: L(0, -10, 0, 0) + L(-12, 0, 12, 0) + L(-8, 4, 8, 4) + L(-4, 8, 4, 8) },
  { id: 'protective-earth', name: 'Protective earth', category: 'electrical', keywords: 'PE ground', prefix: '', pins: [[0, -20]], box: [-12, -20, 12, 12], body: L(0, -20, 0, -4) + L(-8, -4, 8, -4) + L(-5, 0, 5, 0) + L(-2, 4, 2, 4) + C(0, 0, 11) },
  { id: 'switch', name: 'Switch (normally open)', category: 'electrical', keywords: 'contact make NO', prefix: 'S', pins: H2, box: [-30, -12, 30, 2], body: L(-30, 0, -10, 0) + L(-10, 0, 10, -12) + L(10, 0, 30, 0) },
  { id: 'switch-nc', name: 'Switch (normally closed)', category: 'electrical', keywords: 'contact break NC', prefix: 'S', pins: H2, box: [-30, -8, 30, 6], body: L(-30, 0, -10, 0) + L(-10, 0, 14, 5) + L(10, 0, 10, 6) + L(10, 0, 30, 0) },
  { id: 'push-button', name: 'Push button', category: 'electrical', keywords: 'switch momentary', prefix: 'S', pins: H2, box: [-30, -24, 30, 2], body: L(-30, 0, -10, 0) + L(-10, 0, 10, -12) + L(10, 0, 30, 0) + '<path d="M0 -6L0 -20" stroke-dasharray="3 2"/>' + L(-5, -24, -5, -20, 5, -20, 5, -24) },
  { id: 'changeover', name: 'Changeover switch', category: 'electrical', keywords: 'two-way SPDT', prefix: 'S', pins: [[-30, 0], [30, -10], [30, 10]], box: [-30, -12, 30, 12], body: L(-30, 0, -10, 0) + L(-10, 0, 12, -9) + L(10, -10, 30, -10) + L(10, 10, 30, 10) + L(10, 10, 10, 5) },
  { id: 'fuse', name: 'Fuse', category: 'electrical', prefix: 'F', unit: 'A', pins: H2, box: HBOX(6), body: L(-30, 0, 30, 0) + '<rect x="-15" y="-6" width="30" height="12"/>' },
  { id: 'lamp', name: 'Lamp', category: 'electrical', keywords: 'light bulb indicator', prefix: 'H', pins: H2, box: HBOX(10), body: leads(10) + C(0, 0, 10) + L(-7, -7, 7, 7) + L(-7, 7, 7, -7) },
  { id: 'motor', name: 'Motor', category: 'electrical', prefix: 'M', pins: H2, box: HBOX(14), body: leads(14) + C(0, 0, 14) + T(0, 0, 'M', 13) },
  { id: 'generator', name: 'Generator', category: 'electrical', keywords: 'alternator dynamo', prefix: 'G', pins: H2, box: HBOX(14), body: leads(14) + C(0, 0, 14) + T(0, 0, 'G', 13) },
  {
    id: 'transformer', name: 'Transformer', category: 'electrical', prefix: 'T', pins: [[-30, -20], [-30, 20], [30, -20], [30, 20]], box: [-30, -20, 30, 20],
    body: vCoil(-8, 1) + vCoil(8, -1) + L(-2, -22, -2, 22) + L(2, -22, 2, 22) + L(-30, -20, -8, -20) + L(-30, 20, -8, 20) + L(8, -20, 30, -20) + L(8, 20, 30, 20),
  },
  { id: 'relay-coil', name: 'Relay coil', category: 'electrical', keywords: 'contactor', prefix: 'K', pins: H2, box: HBOX(8), body: leads(12) + '<rect x="-12" y="-8" width="24" height="16"/>' },
  { id: 'relay-no', name: 'Relay contact (normally open)', category: 'electrical', keywords: 'contactor make', prefix: 'K', pins: H2, box: [-30, -12, 30, 2], body: L(-30, 0, -10, 0) + L(-10, 0, 10, -12) + L(10, 0, 30, 0) + L(10, 0, 10, -4) },
  { id: 'relay-nc', name: 'Relay contact (normally closed)', category: 'electrical', keywords: 'contactor break', prefix: 'K', pins: H2, box: [-30, -8, 30, 6], body: L(-30, 0, -10, 0) + L(-10, 0, 14, 5) + L(10, 0, 10, 6) + L(10, 0, 30, 0) },
  { id: 'voltmeter', name: 'Voltmeter', category: 'electrical', keywords: 'meter', prefix: 'P', pins: H2, box: HBOX(12), body: leads(12) + C(0, 0, 12) + T(0, 0, 'V', 12) },
  { id: 'ammeter', name: 'Ammeter', category: 'electrical', keywords: 'meter', prefix: 'P', pins: H2, box: HBOX(12), body: leads(12) + C(0, 0, 12) + T(0, 0, 'A', 12) },
  { id: 'wattmeter', name: 'Wattmeter', category: 'electrical', keywords: 'meter power', prefix: 'P', pins: H2, box: HBOX(12), body: leads(12) + C(0, 0, 12) + T(0, 0, 'W', 12) },
  { id: 'connection', name: 'Terminal', category: 'electrical', keywords: 'connection point terminal', prefix: 'X', pins: [[0, 0]], box: [-4, -4, 4, 4], body: C(0, 0, 4) },
];

/** Inputs at x = −30 (y ±10), output at x = 30. */
const gateIn2 = L(-30, -10, -15, -10) + L(-30, 10, -15, 10);
const iec = (label: string, negated = false, inputs = 2): string =>
  '<rect x="-15" y="-20" width="30" height="40"/>' + T(0, -10, label) + (inputs === 2 ? gateIn2 : L(-30, 0, -15, 0)) + (negated ? C(18, 0, 3) + L(21, 0, 30, 0) : L(15, 0, 30, 0));
const AND = '<path d="M-15 -20H0A20 20 0 0 1 0 20H-15Z"/>';
const OR = '<path d="M-18 -20Q-6 0 -18 20Q8 20 22 0Q8 -20 -18 -20Z"/>';
const NOT = '<path d="M-15 -12L-15 12L12 0Z"/>';
const out = (x: number, negated: boolean): string => (negated ? C(x + 3, 0, 3) + L(x + 6, 0, 30, 0) : L(x, 0, 30, 0));
const LOGIC_PINS: Pt[] = [[-30, -10], [-30, 10], [30, 0]];
const LOGIC_BOX: [number, number, number, number] = [-30, -20, 30, 20];
const gate = (id: string, name: string, body: string, pins = LOGIC_PINS): SymbolDef => ({ id, name, category: 'logic', prefix: 'U', pins, box: LOGIC_BOX, body });

const LOGIC: SymbolDef[] = [
  gate('and-iec', 'AND gate (IEC)', iec('&')),
  gate('or-iec', 'OR gate (IEC)', iec('≥1')),
  gate('not-iec', 'NOT gate (IEC)', iec('1', true, 1), [[-30, 0], [30, 0]]),
  gate('nand-iec', 'NAND gate (IEC)', iec('&', true)),
  gate('nor-iec', 'NOR gate (IEC)', iec('≥1', true)),
  gate('xor-iec', 'XOR gate (IEC)', iec('=1')),
  gate('and', 'AND gate (ANSI)', AND + gateIn2 + out(20, false)),
  gate('or', 'OR gate (ANSI)', OR + L(-30, -10, -13, -10) + L(-30, 10, -13, 10) + out(22, false)),
  gate('not', 'NOT gate (ANSI)', NOT + L(-30, 0, -15, 0) + out(12, true), [[-30, 0], [30, 0]]),
  gate('nand', 'NAND gate (ANSI)', AND + gateIn2 + out(20, true)),
  gate('nor', 'NOR gate (ANSI)', OR + L(-30, -10, -13, -10) + L(-30, 10, -13, 10) + out(22, true)),
  gate('xor', 'XOR gate (ANSI)', OR + '<path d="M-24 -20Q-12 0 -24 20"/>' + L(-30, -10, -19, -10) + L(-30, 10, -19, 10) + out(22, false)),
];

const BLOCK: SymbolDef[] = [
  { id: 'block', name: 'Block (transfer function)', category: 'block', keywords: 'control system', prefix: '', inside: true, pins: [[-40, 0], [40, 0]], box: [-40, -20, 40, 20], body: '<rect x="-30" y="-20" width="60" height="40"/>' + L(-40, 0, -30, 0) + L(30, 0, 40, 0) },
  { id: 'sum', name: 'Summing point', category: 'block', keywords: 'comparator adder', prefix: '', pins: [[-20, 0], [0, -20], [0, 20], [20, 0]], box: [-20, -20, 20, 20], body: C(0, 0, 10) + L(-7, -7, 7, 7) + L(-7, 7, 7, -7) + L(-20, 0, -10, 0) + L(10, 0, 20, 0) + L(0, -20, 0, -10) + L(0, 10, 0, 20) },
  { id: 'takeoff', name: 'Take-off point', category: 'block', keywords: 'branch junction', prefix: '', pins: [[0, 0]], box: [-3, -3, 3, 3], body: C(0, 0, 3, true) },
  { id: 'integrator', name: 'Integrator', category: 'block', prefix: '', pins: [[-40, 0], [40, 0]], box: [-40, -20, 40, 20], body: '<rect x="-30" y="-20" width="60" height="40"/>' + L(-40, 0, -30, 0) + L(30, 0, 40, 0) + T(0, 0, '∫', 18) },
];

const valve32 =
  '<rect x="-40" y="-20" width="40" height="40"/><rect x="0" y="-20" width="40" height="40"/>' +
  // Rest (right): A to R, P blocked. Actuated (left): P to A, R blocked.
  L(20, -20, 30, 20) + arrowHead(30, 20, 76) + L(10, 20, 10, 12) + L(6, 12, 14, 12) +
  L(-30, 20, -20, -20) + arrowHead(-20, -20, -76) + L(-10, 20, -10, 12) + L(-14, 12, -6, 12) +
  L(20, -20, 20, -30) + L(10, 20, 10, 30) + L(30, 20, 30, 30) + spring(40, 56) + L(-40, 0, -50, 0) + L(-50, -6, -50, 6);
const valve52 =
  '<rect x="-40" y="-20" width="40" height="40"/><rect x="0" y="-20" width="40" height="40"/>' +
  // Rest (right): P to B, A to R. Actuated (left): P to A, B to S.
  L(20, 20, 30, -20) + arrowHead(30, -20, -76) + L(10, -20, 10, 20) + arrowHead(10, 20, 90) +
  L(-20, 20, -30, -20) + arrowHead(-30, -20, -104) + L(-10, -20, -10, 20) + arrowHead(-10, 20, 90) +
  L(10, -20, 10, -30) + L(30, -20, 30, -30) + L(10, 20, 10, 30) + L(20, 20, 20, 30) + L(30, 20, 30, 30) + spring(40, 56) + L(-40, 0, -50, 0) + L(-50, -6, -50, 6);

const FLUID: SymbolDef[] = [
  {
    id: 'cylinder-single', name: 'Single-acting cylinder', category: 'fluid', keywords: 'ISO 1219 pneumatic hydraulic actuator spring return', prefix: '', pins: [[-30, 20]], box: [-40, -10, 70, 20],
    body: '<rect x="-40" y="-10" width="80" height="20"/>' + L(-20, -10, -20, 10) + L(-20, 0, 70, 0) + spring(-16, 36, 7) + L(-30, 10, -30, 20),
  },
  {
    id: 'cylinder-double', name: 'Double-acting cylinder', category: 'fluid', keywords: 'ISO 1219 pneumatic hydraulic actuator', prefix: '', pins: [[-30, 20], [30, 20]], box: [-40, -10, 70, 20],
    body: '<rect x="-40" y="-10" width="80" height="20"/>' + L(-20, -10, -20, 10) + L(-20, 0, 70, 0) + L(-30, 10, -30, 20) + L(30, 10, 30, 20),
  },
  { id: 'valve-32', name: '3/2 directional valve', category: 'fluid', keywords: 'ISO 1219 distributor pneumatic', prefix: '', pins: [[20, -30], [10, 30], [30, 30]], box: [-50, -30, 56, 30], body: valve32 },
  { id: 'valve-52', name: '5/2 directional valve', category: 'fluid', keywords: 'ISO 1219 distributor pneumatic', prefix: '', pins: [[10, -30], [30, -30], [10, 30], [20, 30], [30, 30]], box: [-50, -30, 56, 30], body: valve52 },
  { id: 'pump', name: 'Hydraulic pump', category: 'fluid', keywords: 'ISO 1219', prefix: '', pins: [[0, 30], [0, -30]], box: [-15, -30, 15, 30], body: C(0, 0, 15) + '<path d="M0 -15L-6 -5L6 -5Z" fill="currentColor"/>' + L(0, 15, 0, 30) + L(0, -15, 0, -30) },
  { id: 'compressor', name: 'Compressor', category: 'fluid', keywords: 'ISO 1219 pneumatic', prefix: '', pins: [[0, 30], [0, -30]], box: [-15, -30, 15, 30], body: C(0, 0, 15) + '<path d="M0 -15L-6 -5L6 -5Z"/>' + L(0, 15, 0, 30) + L(0, -15, 0, -30) },
  { id: 'pressure-source', name: 'Pressure source', category: 'fluid', keywords: 'ISO 1219 pneumatic supply', prefix: '', pins: [[0, -20]], box: [-8, -20, 8, 6], body: '<path d="M0 -8L-8 6L8 6Z"/>' + L(0, -8, 0, -20) },
  { id: 'exhaust', name: 'Exhaust', category: 'fluid', keywords: 'ISO 1219 pneumatic', prefix: '', pins: [[0, -10]], box: [-7, -10, 7, 8], body: L(0, -10, 0, -4) + '<path d="M-7 -4L7 -4L0 8Z"/>' },
  { id: 'check-valve', name: 'Check valve', category: 'fluid', keywords: 'ISO 1219 non-return', prefix: '', pins: H2, box: HBOX(10), body: L(-30, 0, -6, 0) + C(0, 0, 6) + L(8, -10, 2, -6) + L(8, 10, 2, 6) + L(8, -10, 8, 10) + L(8, 0, 30, 0) },
  { id: 'flow-control', name: 'Flow control valve', category: 'fluid', keywords: 'ISO 1219 throttle restrictor', prefix: '', pins: H2, box: HBOX(14), body: leads(12) + '<path d="M-12 -6Q0 2 12 -6"/><path d="M-12 6Q0 -2 12 6"/>' + L(-10, 12, 10, -12) + arrowHead(10, -12, -50) },
  { id: 'pressure-gauge', name: 'Pressure gauge', category: 'fluid', keywords: 'ISO 1219 manometer', prefix: '', pins: [[0, 20]], box: [-10, -10, 10, 20], body: C(0, 0, 10) + L(0, 10, 0, 20) + L(-5, 5, 5, -5) + arrowHead(5, -5, -45, 4) },
];

const FLOW_PINS: Pt[] = [[0, -20], [40, 0], [0, 20], [-40, 0]];
const flow = (id: string, name: string, body: string, keywords: string, pins = FLOW_PINS, box: [number, number, number, number] = [-40, -20, 40, 20]): SymbolDef => ({ id, name, category: 'flowchart', keywords: `ISO 5807 ${keywords}`, prefix: '', inside: true, pins, box, body });
const FLOWCHART: SymbolDef[] = [
  flow('terminal', 'Start / end', '<rect x="-40" y="-20" width="80" height="40" rx="20"/>', 'terminator begin stop'),
  flow('process', 'Process', '<rect x="-40" y="-20" width="80" height="40"/>', 'step action'),
  flow('decision', 'Decision', '<path d="M0 -30L50 0L0 30L-50 0Z"/>', 'condition test if', [[0, -30], [50, 0], [0, 30], [-50, 0]], [-50, -30, 50, 30]),
  flow('io', 'Input / output', '<path d="M-30 -20L50 -20L30 20L-50 20Z"/>', 'data read write'),
  flow('subroutine', 'Predefined process', '<rect x="-40" y="-20" width="80" height="40"/>' + L(-32, -20, -32, 20) + L(32, -20, 32, 20), 'subroutine function'),
  flow('connector', 'Connector', C(0, 0, 10), 'on-page reference', [[0, -10], [10, 0], [0, 10], [-10, 0]], [-10, -10, 10, 10]),
];

/* IEC 61131-3 graphical languages (DRAW-012). */

const contact = (id: string, name: string, mark: string, keywords: string): SymbolDef => ({
  id, name, category: 'ladder', keywords: `IEC 61131-3 LD ladder contact ${keywords}`, prefix: '', label: 'above', pins: H2, box: [-30, -10, 30, 10],
  body: L(-30, 0, -6, 0) + L(6, 0, 30, 0) + L(-6, -10, -6, 10) + L(6, -10, 6, 10) + mark,
});
const coil = (id: string, name: string, mark: string, keywords: string): SymbolDef => ({
  id, name, category: 'ladder', keywords: `IEC 61131-3 LD ladder coil output ${keywords}`, prefix: '', label: 'above', pins: H2, box: [-30, -10, 30, 10],
  body: L(-30, 0, -9, 0) + L(9, 0, 30, 0) + '<path d="M-5 -9Q-11 0 -5 9"/><path d="M5 -9Q11 0 5 9"/>' + mark,
});
const rail = (id: string, name: string, side: 1 | -1): SymbolDef => ({
  id, name, category: 'ladder', keywords: 'IEC 61131-3 LD ladder power rail bus', prefix: '', pins: [[0, -30], [0, -10], [0, 10], [0, 30]], box: [-2, -40, 2, 40],
  body: `<path d="M0 -40L0 40" stroke-width="3"/>` + (side > 0 ? '' : ''),
});
const LADDER: SymbolDef[] = [
  rail('rail-left', 'Left power rail', 1),
  rail('rail-right', 'Right power rail', -1),
  contact('ld-no', 'Contact (normally open)', '', 'NO make'),
  contact('ld-nc', 'Contact (normally closed)', L(-6, 9, 6, -9), 'NC break negated'),
  contact('ld-p', 'Contact (rising edge, P)', T(0, 0, 'P', 10), 'positive transition edge'),
  contact('ld-n', 'Contact (falling edge, N)', T(0, 0, 'N', 10), 'negative transition edge'),
  coil('ld-coil', 'Coil', '', ''),
  coil('ld-coil-neg', 'Coil (negated)', L(-4, 7, 4, -7), 'negated /'),
  coil('ld-set', 'Coil (set, S)', T(0, 0, 'S', 10), 'set latch'),
  coil('ld-reset', 'Coil (reset, R)', T(0, 0, 'R', 10), 'reset unlatch'),
  coil('ld-coil-p', 'Coil (rising edge, P)', T(0, 0, 'P', 10), 'positive transition'),
  coil('ld-coil-n', 'Coil (falling edge, N)', T(0, 0, 'N', 10), 'negative transition'),
];

/** A function block of FBD: its type inside at the top, its inputs on the left and outputs on the right, named. */
const fb = (type: string, inputs: string[], outputs: string[], name = type, keywords = '', prefix = type): SymbolDef => {
  const n = Math.max(inputs.length, outputs.length, 1);
  const top = -(n - 1) * 10;
  const h0 = top - 20;
  const h1 = -top + 20;
  const pin = (i: number): number => top + i * 20;
  const body =
    `<rect x="-30" y="${h0}" width="60" height="${h1 - h0}"/>` +
    T(0, h0 + 9, type, 9) +
    inputs.map((p, i) => L(-40, pin(i), -30, pin(i)) + `<text x="-27" y="${pin(i)}" font-size="7" dominant-baseline="central" fill="currentColor" stroke="none">${p}</text>`).join('') +
    outputs.map((p, i) => L(30, pin(i), 40, pin(i)) + `<text x="27" y="${pin(i)}" font-size="7" text-anchor="end" dominant-baseline="central" fill="currentColor" stroke="none">${p}</text>`).join('');
  return {
    id: `fb-${type.toLowerCase()}`, name, category: 'fbd', keywords: `IEC 61131-3 FBD function block ${type} ${keywords}`, prefix,
    pins: [...inputs.map((_, i): Pt => [-40, pin(i)]), ...outputs.map((_, i): Pt => [40, pin(i)])], box: [-40, h0, 40, h1], body,
  };
};
const FBD: SymbolDef[] = [
  fb('TON', ['IN', 'PT'], ['Q', 'ET'], 'Timer on delay (TON)', 'timer delay'),
  fb('TOF', ['IN', 'PT'], ['Q', 'ET'], 'Timer off delay (TOF)', 'timer delay'),
  fb('TP', ['IN', 'PT'], ['Q', 'ET'], 'Timer pulse (TP)', 'timer pulse'),
  fb('CTU', ['CU', 'R', 'PV'], ['Q', 'CV'], 'Counter up (CTU)', 'counter'),
  fb('CTD', ['CD', 'LD', 'PV'], ['Q', 'CV'], 'Counter down (CTD)', 'counter'),
  fb('CTUD', ['CU', 'CD', 'R', 'LD', 'PV'], ['QU', 'QD', 'CV'], 'Counter up-down (CTUD)', 'counter'),
  fb('R_TRIG', ['CLK'], ['Q'], 'Rising edge (R_TRIG)', 'edge trigger'),
  fb('F_TRIG', ['CLK'], ['Q'], 'Falling edge (F_TRIG)', 'edge trigger'),
  fb('SR', ['S1', 'R'], ['Q1'], 'Set-dominant bistable (SR)', 'flip-flop latch memory'),
  fb('RS', ['S', 'R1'], ['Q1'], 'Reset-dominant bistable (RS)', 'flip-flop latch memory'),
  fb('ADD', ['IN1', 'IN2'], ['OUT'], 'Addition (ADD)', 'arithmetic +', ''),
  fb('SUB', ['IN1', 'IN2'], ['OUT'], 'Subtraction (SUB)', 'arithmetic -', ''),
  fb('MUL', ['IN1', 'IN2'], ['OUT'], 'Multiplication (MUL)', 'arithmetic *', ''),
  fb('DIV', ['IN1', 'IN2'], ['OUT'], 'Division (DIV)', 'arithmetic /', ''),
  fb('GT', ['IN1', 'IN2'], ['OUT'], 'Greater than (GT)', 'comparison >', ''),
  fb('LT', ['IN1', 'IN2'], ['OUT'], 'Less than (LT)', 'comparison <', ''),
  fb('EQ', ['IN1', 'IN2'], ['OUT'], 'Equal (EQ)', 'comparison =', ''),
  fb('SEL', ['G', 'IN0', 'IN1'], ['OUT'], 'Selection (SEL)', 'select', ''),
  fb('MOVE', ['IN'], ['OUT'], 'Move (MOVE)', 'assignment copy', ''),
  { ...fb('FB', ['IN1', 'IN2'], ['OUT'], 'Function block (generic)', 'custom user', 'FB'), inside: true, body: fb('', ['', ''], ['']).body },
];

const SFC: SymbolDef[] = [
  { id: 'sfc-step', name: 'Step', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet IEC 60848 étape', prefix: '', inside: true, pins: [[0, -30], [0, 30], [20, 0]], box: [-20, -30, 20, 30], body: '<rect x="-20" y="-20" width="40" height="40"/>' + L(0, -30, 0, -20) + L(0, 20, 0, 30) },
  { id: 'sfc-initial', name: 'Initial step', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet initial étape', prefix: '', inside: true, pins: [[0, -30], [0, 30], [20, 0]], box: [-20, -30, 20, 30], body: '<rect x="-20" y="-20" width="40" height="40"/><rect x="-16" y="-16" width="32" height="32"/>' + L(0, -30, 0, -20) + L(0, 20, 0, 30) },
  { id: 'sfc-transition', name: 'Transition', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet transition receptivity condition', prefix: '', label: 'right', pins: [[0, -20], [0, 20]], box: [-12, -20, 12, 20], body: L(0, -20, 0, 20) + '<path d="M-12 0L12 0" stroke-width="3"/>' },
  { id: 'sfc-action', name: 'Action block', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet action qualifier N S R', prefix: '', inside: true, pins: [[-50, 0]], box: [-50, -10, 50, 10], body: '<rect x="-40" y="-10" width="90" height="20"/>' + L(-50, 0, -40, 0) },
  { id: 'sfc-and-div', name: 'Simultaneous divergence (AND)', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet parallel branch double line', prefix: '', pins: [[0, -10], [-30, 10], [30, 10]], box: [-40, -10, 40, 10], body: L(0, -10, 0, -2) + L(-40, -2, 40, -2) + L(-40, 2, 40, 2) + L(-30, 2, -30, 10) + L(30, 2, 30, 10) },
  { id: 'sfc-and-conv', name: 'Simultaneous convergence (AND)', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet parallel join double line', prefix: '', pins: [[-30, -10], [30, -10], [0, 10]], box: [-40, -10, 40, 10], body: L(-30, -10, -30, -2) + L(30, -10, 30, -2) + L(-40, -2, 40, -2) + L(-40, 2, 40, 2) + L(0, 2, 0, 10) },
  { id: 'sfc-or-div', name: 'Selection divergence (OR)', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet alternative branch', prefix: '', pins: [[0, -10], [-30, 10], [30, 10]], box: [-30, -10, 30, 10], body: L(0, -10, 0, 0) + L(-30, 0, 30, 0) + L(-30, 0, -30, 10) + L(30, 0, 30, 10) },
  { id: 'sfc-or-conv', name: 'Selection convergence (OR)', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet alternative join', prefix: '', pins: [[-30, -10], [30, -10], [0, 10]], box: [-30, -10, 30, 10], body: L(-30, -10, -30, 0) + L(30, -10, 30, 0) + L(-30, 0, 30, 0) + L(0, 0, 0, 10) },
  { id: 'sfc-jump', name: 'Jump to a step', category: 'sfc', keywords: 'IEC 61131-3 SFC Grafcet jump goto renvoi', prefix: '', label: 'right', pins: [[0, -20]], box: [-8, -20, 8, 8], body: L(0, -20, 0, -4) + '<path d="M-8 -4L8 -4L0 8Z" fill="currentColor"/>' },
];

export const SYMBOLS: SymbolDef[] = [...ELECTRICAL, ...LOGIC, ...BLOCK, ...FLUID, ...FLOWCHART, ...LADDER, ...FBD, ...SFC];

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

export function symbolDef(id: string): SymbolDef | undefined {
  return BY_ID.get(id);
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The symbols whose name, keywords or category hold every word of the query. */
export function searchSymbols(query: string, category?: SymbolCategory): SymbolDef[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return SYMBOLS.filter((s) => (!category || s.category === category) && words.every((w) => fold(`${s.name} ${s.keywords ?? ''} ${s.id} ${s.category}`).includes(w)));
}
