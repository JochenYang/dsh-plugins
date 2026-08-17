window.__ModuleLoader__.load({ id: "dsh-vision-bridge", factory: (require) => {
var __modules = Object.create(null); var __cache = Object.create(null);
__modules["./index.js"] = function(module, exports, require, __load_) {
"use strict";
/**
 * dsh-vision-bridge browser half: capture clipboard images pasted into the
 * composer and route them by the current model's capability.
 *
 * pasteMode (served by the host at /_dsh/vision-bridge/config):
 * - 'auto' / 'path' (default): upload to the paste route and insert a text
 *   path marker (`[pasted image N: <path>]`). The message never carries an
 *   image part, so DSH's image gates — including the "session already
 *   contains images" model-switch guard — never fire, and the session model
 *   can be switched freely between multimodal and text-only routes. The
 *   model reads the image through vision_glance.
 * - 'native': never intercept — DSH's native paste handling runs untouched
 *   (native image parts may enter the session, which then cannot switch to
 *   a text-only model; use only for single-model sessions).
 *
 * Native draft re-insertion is deliberately absent: an image part in the
 * session history is what makes DSH refuse switching to a text-only model.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
/** Same-origin routes served by the host bundle. */
const PASTE_IMAGES_ROUTE = '/_dsh/vision-bridge/paste-images';
const CONFIG_ROUTE = '/_dsh/vision-bridge/config';
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Cached mode from the host; 'auto' is the safe default before/without config. */
let pasteMode = 'auto';
exports.inject = ['conversation', 'sessions', 'modelDirectories'];
function imageFiles(data) {
    if (data === null)
        return [];
    const fromItems = Array.from(data.items)
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((file) => file !== null);
    const candidates = fromItems.length > 0 ? fromItems : Array.from(data.files);
    return candidates.filter(file => file.type.toLowerCase().startsWith('image/'));
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Best-effort current model hint from the model-selection directory. */
function modelHint(ctx, sessionId) {
    try {
        const directories = ctx.modelDirectories;
        const current = directories?.directoryFor?.(sessionId)?.current;
        if (current !== null && current !== undefined
            && typeof current.provider === 'string' && typeof current.model === 'string') {
            return `&provider=${encodeURIComponent(current.provider)}&model=${encodeURIComponent(current.model)}`;
        }
    }
    catch {
        // no hint — the host falls back to the session's logged model
    }
    return '';
}
async function uploadImage(ctx, sessionId, file) {
    const query = new URLSearchParams({
        sessionId,
        name: file.name || 'clipboard-image',
        size: String(file.size),
    });
    const hint = modelHint(ctx, sessionId);
    const response = await fetch(`${PASTE_IMAGES_ROUTE}?${query.toString()}${hint}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true)
        throw new Error(body.error?.message ?? `Image copy failed (${response.status})`);
    return body;
}
/** Insert text into the draft at [start, end), returning the new cursor position. */
function insertAt(input, start, end, text) {
    if (text === '')
        return start;
    const snapshot = input.state.getSnapshot();
    input.setDraft(snapshot.draft.slice(0, start) + text + snapshot.draft.slice(end));
    return start + text.length;
}
function apply(ctx) {
    void refreshConfig();
    ctx.effect(() => {
        const listener = (event) => { void handlePaste(ctx, event); };
        document.addEventListener('paste', listener, true);
        return () => { document.removeEventListener('paste', listener, true); };
    }, 'dsh-vision-bridge: clipboard image capture');
}
async function refreshConfig() {
    try {
        const response = await fetch(CONFIG_ROUTE, { credentials: 'same-origin' });
        const body = await response.json();
        if (response.ok && body.ok === true) {
            const mode = body.value?.pasteMode;
            pasteMode = mode === 'path' || mode === 'native' ? mode : 'auto';
        }
    }
    catch {
        // keep the safe 'auto' default
    }
}
async function handlePaste(ctx, event) {
    const files = imageFiles(event.clipboardData);
    if (files.length === 0)
        return;
    if (files.length > MAX_IMAGES) {
        ctx.logger?.warn?.(`dsh-vision-bridge: paste rejected: at most ${MAX_IMAGES} images at a time`);
        return;
    }
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.closest('[data-composer-card]') === null)
        return;
    if (pasteMode === 'native')
        return; // let DSH's native paste handling run
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const sessionId = ctx.sessions.list.getSnapshot().current;
    if (sessionId === undefined)
        return;
    const actx = ctx.sessions.scope(sessionId);
    if (actx === undefined)
        return;
    const input = ctx.conversation.input.for(actx);
    const snapshot = input.state.getSnapshot();
    if (snapshot.phase !== 'plain')
        return;
    const start = Math.max(0, Math.min(target.selectionStart ?? snapshot.draft.length, snapshot.draft.length));
    const end = Math.max(start, Math.min(target.selectionEnd ?? start, snapshot.draft.length));
    const clipboardText = (event.clipboardData?.getData('text/plain') ?? '').replaceAll('\uFFFC', '');
    try {
        let cursor = insertAt(input, start, end, clipboardText);
        for (const [index, file] of files.entries()) {
            if (file.size <= 0)
                throw new Error(`${file.name || 'clipboard image'} is empty`);
            if (file.size > MAX_IMAGE_BYTES)
                throw new Error(`${file.name || 'clipboard image'} exceeds 10 MB`);
            const uploaded = await uploadImage(ctx, String(sessionId), file);
            const absolutePath = uploaded.value?.absolutePath;
            if (typeof absolutePath !== 'string' || absolutePath === '') {
                throw new Error('Image copy response contained an invalid path');
            }
            const marker = `[pasted image ${index + 1}: ${absolutePath}]`;
            if (index === 0 && clipboardText !== '' && !/\s$/u.test(snapshot.draft.slice(0, cursor))) {
                cursor = insertAt(input, cursor, cursor, ' ');
            }
            cursor = insertAt(input, cursor, cursor, marker);
        }
        requestAnimationFrame(() => {
            target.focus({ preventScroll: true });
            target.setSelectionRange(cursor, cursor);
        });
    }
    catch (error) {
        input.notify('error', `图片粘贴失败: ${messageOf(error)}`);
    }
}
};
function __resolve(from, request) {
  if (!request.startsWith(".")) return request;
  var parts = from.slice(2).split("/"); parts.pop();
  for (var part of request.split("/")) { if (part === "." || part === "") continue; if (part === "..") parts.pop(); else parts.push(part); }
  return "./" + parts.join("/");
}
function __load(id) {
  if (__modules[id] === undefined) return require(id);
  if (__cache[id] !== undefined) return __cache[id].exports;
  var module = __cache[id] = { exports: {} };
  __modules[id](module, module.exports, require, function(request) { var resolved = __resolve(id, request); return __modules[resolved] === undefined ? require(request) : __load(resolved); });
  return module.exports;
}
return __load("./index.js"); } });
//# sourceMappingURL=client.js.map
