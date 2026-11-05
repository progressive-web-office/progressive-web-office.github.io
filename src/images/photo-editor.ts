/**
 * IMG-001: a picture edited in a dialog — turned, mirrored, lighter or with
 * more contrast, a region blurred (a face, a name, a number plate), cropped,
 * resized. The original is kept until "Apply".
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { askSignature, fitSize, signButton, signatureImage } from '../app/mark';
import { drawTurned, flipMark, flipRect, isUnchanged, NO_EDIT, outputSize, rectBetween, renderPhoto, turnedSize, turnMark, turnRect, type PhotoEdit, type Rect } from './photo';

export interface EditedPhoto {
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
}

/** `sign`: after ✍ Sign, a drag places the signature again, its size chosen (MARK-001). */
type Tool = 'crop' | 'blur' | 'highlight' | 'arrow' | 'text' | 'sign';

/** Largest side of the preview, in CSS pixels. */
const PREVIEW = 640;

export async function editPhoto(host: HTMLElement, bytes: Uint8Array, mediaType: string): Promise<EditedPhoto | null> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mediaType }));
  const [sw, sh] = [bitmap.width, bitmap.height];
  return new Promise((resolve) => {
    let edit: PhotoEdit = { ...NO_EDIT, blurs: [], marks: [] };
    let tool: Tool = 'crop';
    let drag: { from: [number, number]; to: [number, number] } | undefined;
    const canvas = h('canvas', { class: 'photo-canvas', role: 'img', 'aria-label': t('photo.preview') });
    const ctx = canvas.getContext('2d')!;
    let turned: HTMLCanvasElement = drawTurned(bitmap, sw, sh, edit);
    let ratio = 1;

    const size = h('span', { class: 'photo-size', role: 'status' });
    const slider = (label: string, min: number, max: number, value: number, onInput: (v: number) => void): HTMLLabelElement => {
      const input = h('input', { type: 'range', min: String(min), max: String(max), value: String(value), 'aria-label': label });
      input.addEventListener('input', () => onInput(Number(input.value)));
      return h('label', { class: 'photo-slider' }, label, input);
    };
    const brightness = slider(t('photo.brightness'), 30, 200, 100, (v) => update({ brightness: v }, true));
    const contrast = slider(t('photo.contrast'), 30, 200, 100, (v) => update({ contrast: v }, true));
    const scale = slider(t('photo.resize'), 5, 100, 100, (v) => update({ scale: v / 100 }, false));

    const draw = (): void => {
      const { w, h: hh } = { w: turned.width, h: turned.height };
      ratio = Math.min(1, PREVIEW / Math.max(w, hh));
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(hh * ratio);
      ctx.drawImage(turned, 0, 0, canvas.width, canvas.height);
      const shown = (r: Rect): Rect => ({ x: r.x * ratio, y: r.y * ratio, w: r.w * ratio, h: r.h * ratio });
      const pending = drag ? rectBetween(drag.from, drag.to, w, hh) : undefined;
      const crop = tool === 'crop' && pending ? pending : edit.crop;
      if (crop && crop.w > 0 && crop.h > 0) {
        const c = shown(crop);
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.rect(c.x, c.y, c.w, c.h);
        ctx.fill('evenodd');
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
        ctx.restore();
      }
      if (drag && tool === 'arrow') {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(drag.from[0] * ratio, drag.from[1] * ratio);
        ctx.lineTo(drag.to[0] * ratio, drag.to[1] * ratio);
        ctx.stroke();
        ctx.restore();
      }
      if ((tool === 'blur' || tool === 'highlight') && pending) {
        const c = shown(pending);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.restore();
      }
      const out = outputSize(sw, sh, edit);
      size.textContent = `${out.w} × ${out.h} px`;
    };
    const update = (patch: Partial<PhotoEdit>, redraw: boolean): void => {
      edit = { ...edit, ...patch };
      if (redraw) turned = drawTurned(bitmap, sw, sh, edit);
      draw();
    };
    const turn = (by: 90 | 270): void => {
      const { w, h: hh } = turnedSize(sw, sh, edit.rotate);
      const rotate = ((edit.rotate + by) % 360) as PhotoEdit['rotate'];
      update({ rotate, blurs: edit.blurs.map((r) => turnRect(r, w, hh, by)), marks: edit.marks.map((m) => turnMark(m, w, hh, by)), ...(edit.crop ? { crop: turnRect(edit.crop, w, hh, by) } : {}) }, true);
    };
    const flip = (): void => {
      const { w } = turnedSize(sw, sh, edit.rotate);
      update({ flip: !edit.flip, blurs: edit.blurs.map((r) => flipRect(r, w)), marks: edit.marks.map((m) => flipMark(m, w)), ...(edit.crop ? { crop: flipRect(edit.crop, w) } : {}) }, true);
    };

    const point = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * turned.width, ((e.clientY - r.top) / r.height) * turned.height];
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      drag = { from: p, to: p };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.to = point(e);
      draw();
    });
    const release = (): void => {
      if (!drag) return;
      const { from, to } = drag;
      const r = rectBetween(from, to, turned.width, turned.height);
      drag = undefined;
      if (tool === 'sign') {
        const at = edit.marks.findLastIndex((m) => m.kind === 'signature');
        const sig = edit.marks[at];
        if (sig?.kind !== 'signature') return draw();
        let rect: Rect;
        if (r.w < 4 || r.h < 4) rect = { ...sig.rect, x: from[0] - sig.rect.w / 2, y: from[1] - sig.rect.h / 2 };
        else {
          // Fitted in the box dragged, its proportions kept.
          const k = Math.min(r.w / sig.rect.w, r.h / sig.rect.h);
          rect = { x: r.x, y: r.y, w: Math.round(sig.rect.w * k), h: Math.round(sig.rect.h * k) };
        }
        const marks = edit.marks.slice();
        marks[at] = { ...sig, rect };
        update({ marks }, true);
        return;
      }
      if (tool === 'text') {
        const text = window.prompt(t('photo.textPrompt'))?.trim();
        if (text) update({ marks: [...edit.marks, { kind: 'text', at: from, text }] }, true);
        else draw();
        return;
      }
      if (tool === 'arrow') {
        if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 6) return draw();
        update({ marks: [...edit.marks, { kind: 'arrow', from, to }] }, true);
        return;
      }
      if (r.w < 4 || r.h < 4) {
        // A click: no crop.
        if (tool === 'crop') update({ crop: undefined }, false);
        else draw();
        return;
      }
      if (tool === 'crop') update({ crop: r }, false);
      else if (tool === 'highlight') update({ marks: [...edit.marks, { kind: 'highlight', rect: r }] }, true);
      else update({ blurs: [...edit.blurs, r] }, true);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /** MARK-001: the signature pad of the PDF viewer; the signature put at the bottom right. */
    const sign = async (): Promise<void> => {
      const sig = await askSignature(dialog);
      if (!sig) return;
      const image = await signatureImage(sig.png);
      const size = fitSize(sig.width, sig.height, turned.width * 0.35, turned.height * 0.25);
      const margin = Math.round(Math.min(turned.width, turned.height) * 0.04);
      const rect = { x: turned.width - size.w - margin, y: turned.height - size.h - margin, ...size };
      update({ marks: [...edit.marks, { kind: 'signature', rect, image }] }, true);
      tool = 'sign';
      for (const input of dialog.querySelectorAll<HTMLInputElement>('input[name=photo-tool]')) input.checked = false;
      hint.textContent = t('photo.signHint');
    };
    const hint = h('p', { class: 'hint' }, t('photo.hint'));
    const toolRadio = (value: Tool, label: string): HTMLLabelElement => {
      const input = h('input', { type: 'radio', name: 'photo-tool', value, checked: value === tool });
      input.addEventListener('change', () => {
        tool = value;
        hint.textContent = t('photo.hint');
        draw();
      });
      return h('label', { class: 'photo-tool' }, input, ` ${label}`);
    };
    const dialog = h('dialog', { class: 'dialog photo-dialog', 'aria-labelledby': 'photo-title' });
    const finish = (value: EditedPhoto | null): void => {
      bitmap.close();
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const apply = async (): Promise<void> => {
      if (isUnchanged(edit)) return finish(null);
      const out = renderPhoto(bitmap, sw, sh, edit);
      const type = mediaType === 'image/jpeg' || mediaType === 'image/webp' ? mediaType : 'image/png';
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, type, 0.92));
      if (!blob) return finish(null);
      finish({ bytes: new Uint8Array(await blob.arrayBuffer()), mediaType: blob.type || type, width: out.width, height: out.height });
    };
    const reset = (): void => {
      edit = { ...NO_EDIT, blurs: [], marks: [] };
      for (const input of dialog.querySelectorAll<HTMLInputElement>('input[type=range]')) input.value = '100';
      turned = drawTurned(bitmap, sw, sh, edit);
      draw();
    };
    dialog.append(
      h('h2', { id: 'photo-title' }, t('photo.title')),
      h(
        'div',
        { class: 'photo-tools', role: 'toolbar', 'aria-label': t('photo.tools') },
        button(t('photo.turnLeft'), () => turn(270), { text: '⟲', title: t('photo.turnLeft') }),
        button(t('photo.turnRight'), () => turn(90), { text: '⟳', title: t('photo.turnRight') }),
        button(t('photo.flip'), flip, { text: '⇋', title: t('photo.flip') }),
        h('span', { class: 'photo-tool-group', role: 'radiogroup', 'aria-label': t('photo.dragTool') }, toolRadio('crop', `✂ ${t('photo.crop')}`), toolRadio('blur', `▒ ${t('photo.blur')}`), toolRadio('highlight', `🖍 ${t('photo.highlight')}`), toolRadio('arrow', `➚ ${t('photo.arrow')}`), toolRadio('text', `T ${t('photo.text')}`)),
        signButton(() => void sign()),
        button(t('photo.undoMark'), () => update(edit.marks.length ? { marks: edit.marks.slice(0, -1) } : { blurs: edit.blurs.slice(0, -1) }, true), { text: `↶ ${t('photo.undoMark')}` }),
      ),
      hint,
      h('div', { class: 'photo-stage' }, canvas),
      h('div', { class: 'photo-sliders' }, brightness, contrast, scale, size),
      h('div', { class: 'dialog-actions' }, button(t('photo.reset'), reset), button(t('common.cancel'), () => finish(null)), button(t('photo.apply'), () => void apply(), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    draw();
  });
}
