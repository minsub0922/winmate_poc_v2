"""App-owned live policy adapter around the read-only scenario composer.

The composer's generated library is a baseline. Runtime slot policies take priority
over exemplar locks, and final fixed values are retained after the model pipeline.
"""
import copy
import math
import sys
import threading

from .. import layout_library as live
from . import layout_snapshot

_LOCK = threading.RLock()


def install(library, auto=None):
    with _LOCK:
        if not getattr(library.load, '_live_layouts', False):
            original = library.load
            cache = {}

            def load(*args, **kwargs):
                snapshot = layout_snapshot.current()
                if snapshot is not None:
                    return snapshot['library']
                base = original(*args, **kwargs)
                state = live.load()
                if not state['items']:
                    return base
                key = (id(base), str(live.path()), state['rev'])
                with _LOCK:
                    if key not in cache:
                        value = copy.deepcopy(base)
                        entries = live.effective_items(state, live.base()[1])
                        for f, item in entries.items():
                            meta = value['layouts'].get(f)
                            if not meta:
                                continue
                            meta.update(live.apply_meta(meta, item))
                            for text in meta.get('texts', []):
                                if str(text['i']) in item.get('t', {}):
                                    text['text'] = item['t'][str(text['i'])]
                            for image in meta.get('images', []):
                                if str(image['i']) in item.get('img', {}):
                                    image['sample'] = item['img'][str(image['i'])]
                            modes = meta.setdefault('modes', {'t': {}, 'img': {}, 'lock': 'ai'})
                            for kind in ('t', 'img'):
                                modes.setdefault(kind, {}).update(item.get('modes', {}).get(kind, {}))
                            if item.get('fill') == 'fixed':
                                modes['lock'] = 'fixed'
                        cache.clear()
                        cache[key] = value
                    return cache[key]

            load._live_layouts = True
            library.load = load
            # Several modules bind `from .library import load` at import time.
            for name, module in tuple(sys.modules.items()):
                if name.startswith('composer.') and getattr(module, 'load', None) is original:
                    module.load = load
            _install_legacy_policy(library)
        if auto is None or getattr(auto, '_live_layouts', False):
            return
        auto._live_layouts = True
        compose_part, fixed_part, fixed_sheet, slot_plan, layout_out = auto.compose_part, auto.fixed_part, auto.fixed_sheet, auto.slot_plan, auto._layout_out

        def entry(f):
            snapshot = layout_snapshot.current()
            if snapshot is not None and f in snapshot['items']:
                return snapshot['items'][f]
            return live.load()['items'].get(f, {})

        def is_fixed_part(part):
            if any(entry(s.get('f')).get('fill') == 'slots' for s in part.get('exemplar', [])):
                return False
            return fixed_part(part)

        def is_fixed_sheet(f):
            fill = entry(f).get('fill')
            return fill == 'fixed' if fill in ('slots', 'fixed') else fixed_sheet(f)

        def compose(ctx, part, plan, registry, reserved=()):
            rows = compose_part(ctx, part, plan, registry, reserved)
            result = []
            layouts = library.load()['layouts']
            for sheet in rows:
                f = sheet['f']
                if layouts.get(f, {}).get('removed'):
                    continue
                item = entry(f)
                if item.get('fill') == 'slots':
                    sheet['fixed'] = False
                elif item.get('fill') == 'fixed':
                    sheet['fixed'] = True
                sheet.setdefault('ex_t', {}).update(item.get('t', {}))
                for i, src in item.get('img', {}).items():
                    sheet.setdefault('ex_img', {})[i] = {'src': src, 'keep': True}
                result.append(sheet)
            return result

        def plan_slots(ctx, sheet):
            result = slot_plan(ctx, sheet)
            item = entry(sheet['f'])
            policies = item.get('modes', {}).get('t', {})
            if not policies or item.get('fill') == 'fixed':
                return result
            texts = {str(t['i']): t for t in library.load()['layouts'][sheet['f']]['texts']}
            by = {str(p['i']): p for p in result}
            for i, mode in policies.items():
                text = texts.get(i)
                if not text:
                    continue
                if mode in ('fixed', 'pick'):
                    by[i] = {'i': int(i), 'lock': text['text']}
                elif mode != 'section':
                    ref = item.get('t', {}).get(i, text['text'])
                    old = by.get(i, {})
                    # Explicitly freeing a slot must also remove an inherited exemplar lock.
                    by[i] = {**{k: v for k, v in old.items() if k != 'lock'}, 'i': int(i), 'r': text.get('role') or 'text',
                             'ref': ref, 'max': max(20, math.ceil(len(ref) * 1.5)), 'mode': mode, 'sample': False}
            return list(by.values())

        def output(sheet):
            result = layout_out(sheet)
            item = entry(sheet['f'])
            if not item:
                return result
            meta = library.load()['layouts'].get(sheet['f'], {})
            ov = result.setdefault('ov', {})
            for text in meta.get('texts', []):
                i = str(text['i'])
                if item.get('fill') == 'fixed' or item.get('modes', {}).get('t', {}).get(i) == 'fixed':
                    ov.setdefault('t', {})[i] = text['text']
            for image in meta.get('images', []):
                i = str(image['i'])
                if item.get('fill') == 'fixed' or item.get('modes', {}).get('img', {}).get(i) == 'fixed':
                    src = item.get('img', {}).get(i) or image.get('sample')
                    if src:
                        ov.setdefault('img', {})[i] = {'src': src, 'keep': True}
            return result

        auto.compose_part, auto.fixed_part, auto.fixed_sheet, auto.slot_plan, auto._layout_out = compose, is_fixed_part, is_fixed_sheet, plan_slots, output
        from composer import pictures
        type_slots = pictures.type_slots

        def image_slots(sheet, part, ctx):
            result = type_slots(sheet, part, ctx)
            policies = entry(sheet['f']).get('modes', {}).get('img', {})
            for slot in result:
                mode = policies.get(slot['key'])
                if mode in ('fixed', 'pick', 'section'):
                    slot['kind'] = 'keep'
                elif mode == 'ai' and slot['kind'] in ('keep', 'icon'):
                    slot['kind'] = 'scene'
                elif mode in ('product', 'solution'):
                    slot['kind'] = mode
            return result

        pictures.type_slots = image_slots


def _fixed_output(result, item, meta):
    ov = result.setdefault('ov', {})
    for text in meta.get('texts', []):
        i = str(text['i'])
        if item.get('fill') == 'fixed' or item.get('modes', {}).get('t', {}).get(i) == 'fixed':
            ov.setdefault('t', {})[i] = text['text']
    for image in meta.get('images', []):
        i = str(image['i'])
        if item.get('fill') == 'fixed' or item.get('modes', {}).get('img', {}).get(i) == 'fixed':
            src = item.get('img', {}).get(i) or image.get('sample')
            if src:
                ov.setdefault('img', {})[i] = {'src': src, 'keep': True}
    return result


def _install_legacy_policy(library):
    """The older two-step Storyboard completion uses a separate text/image writer."""
    from composer import fill, pipeline
    text_slots, image_slots, to_app_parts = fill.text_slots, fill.image_slots, pipeline.to_app_parts

    def text_policy(slide, inp):
        item = live.load()['items'].get(slide['f'], {})
        if item.get('fill') == 'fixed':
            return []
        policies = item.get('modes', {}).get('t', {})
        result = {str(x['i']): x for x in text_slots(slide, inp) if policies.get(str(x['i'])) not in ('fixed', 'section', 'pick')}
        # A manually freed brand/label slot is allowed even when the old writer
        # would classify its wording as a structural label.
        texts = {str(t['i']): t for t in library.load()['layouts'][slide['f']].get('texts', [])}
        for i, mode in policies.items():
            if mode == 'ai' and i not in result and i in texts:
                t = texts[i]
                result[i] = {'i': int(i), 'r': t.get('role') or 'text', 'ref': t['text'], 'max': max(20, math.ceil(len(t['text']) * 1.5)), 'o': t.get('o', 0), 'footer': False}
        return list(result.values())

    def image_policy(slide, *args, **kwargs):
        item = live.load()['items'].get(slide['f'], {})
        if item.get('fill') == 'fixed':
            return []
        policies = item.get('modes', {}).get('img', {})
        return [slot for slot in image_slots(slide, *args, **kwargs) if policies.get(str(slot['key'])) not in ('fixed', 'section', 'pick')]

    def output(deck):
        parts = to_app_parts(deck)
        layouts = library.load()['layouts']
        items = live.load()['items']
        for part in parts:
            part['layouts'] = [_fixed_output(x, items.get(x['f'], {}), layouts.get(x['f'], {})) for x in part.get('layouts', []) if not layouts.get(x['f'], {}).get('removed')]
        return parts

    fill.text_slots, fill.image_slots, pipeline.to_app_parts = text_policy, image_policy, output
