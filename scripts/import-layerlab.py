"""Import the approved LayerLab GUI Pro - Simple Casual components for local use.

Licensed Layer Store material. Copies only the declared files below from the purchased
PNG archive into the gitignored assets/layerlab/ folder, reads each sprite's Unity
spriteBorder (nine-slice metadata) from the matching .unitypackage, reads PNG sizes from the
IHDR header, and writes:
  - scripts/layerlab-assets.json  (tracked provenance: source path, sha256, bytes, size, slicing)
  - css/layerlab-slices.css       (gitignored, generated: one custom-property block per asset)
Originals are never modified. Pixels are never decoded here and must never be sent to AI tools.

Usage: python3 scripts/import-layerlab.py [png-zip] [--unitypackage path]
"""
import hashlib, json, pathlib, re, struct, sys, tarfile, zipfile

DEFAULT_ZIP = '/Volumes/Development/Assets/Downloads/LayerLab Packs/GUI Pro - Simple Casual_PNG.zip'
C = 'PNG/PNG_Light/Component/'
BTN, FRM, LBL, ETC = C + 'Button/', C + 'Frame/', C + 'Label/', C + 'UI_Etc/'
PICTO = C + 'Icon_PictoIcons_(x2)/PictoIcons_128/Pictoicon_'
ITEM = C + 'Icon_ItemIcons_(x2)/ItemIcons_128/itemicon_'
BG = 'PNG/PNG_Light/Demo/Demo_Background/'

# Declarative list: local name -> archive path. Existing names from the first integration are kept
# so earlier evidence and old paths stay valid. Pet packs, 2D Art Maker and craftpix are not used.
ITEMS = [
    # Buttons (nine-slice)
    {'name': 'button-red', 'source': BTN + 'Button_Demo_Common/Btn_Rectangle00_n_Red.png'},
    {'name': 'button-green', 'source': BTN + 'Button_Demo_Common/Btn_Rectangle00_n_Green.png'},
    {'name': 'button-orange', 'source': BTN + 'Button_Demo_Common/Btn_Rectangle00_n_Orange.png'},
    {'name': 'button-white', 'source': BTN + 'Button_Custom/Btn_Rectangle00_n_White1.png'},
    {'name': 'button-white2', 'source': BTN + 'Button_Custom/Btn_Rectangle00_n_White2.png'},
    {'name': 'button-disabled', 'source': BTN + 'Button_Demo_Light/Btn_Rectangle00_d.png'},
    {'name': 'button-square', 'source': BTN + 'Button_Demo_Light/Btn_IconButton_Square.png'},
    {'name': 'button-circle', 'source': BTN + 'Button_Demo_Light/Btn_IconButton_Circle_90.png'},
    {'name': 'button-circle-red', 'source': BTN + 'Button_Demo_Common/Btn_IconButton_Circle_90_red.png'},
    {'name': 'menu-button', 'source': BTN + 'Button_Demo_Light/Btn_MenuButton_Rectangle00_n.png'},
    {'name': 'menu-button-active', 'source': BTN + 'Button_Demo_Light/Btn_MenuButton_Rectangle00_s.png'},
    # Frames, cards, lists
    {'name': 'panel', 'source': FRM + 'Frame_Custom/BasicFrame_Rectangle01_l_White.png'},
    {'name': 'card-word', 'source': FRM + 'Frame_Custom/CardFrame01_White2.png'},
    {'name': 'card-sticker', 'source': FRM + 'Frame_Custom/CardFrame01_White1.png'},
    {'name': 'item-frame', 'source': FRM + 'Frame_Custom/ItemFrame01_White2.png'},
    {'name': 'item-frame-icon', 'source': FRM + 'Frame_Custom/ItemFrame01_White3.png'},
    {'name': 'item-focus', 'source': FRM + 'Frame_Demo_Light/ItemFrame01_Focus.png'},
    {'name': 'list-row', 'source': FRM + 'Frame_Demo_Light/ListFrame01_n.png'},
    {'name': 'list-row-selected', 'source': FRM + 'Frame_Demo_Light/ListFrame01_s.png'},
    {'name': 'tab-menu', 'source': FRM + 'Frame_Custom/TabMenuFrame_White.png'},
    {'name': 'table-cell', 'source': FRM + 'Frame_Custom/TableFrame01_White1.png'},
    {'name': 'picture-frame', 'source': FRM + 'Frame_Custom/PictureFrame00_White1.png'},
    {'name': 'divider', 'source': FRM + 'Frame_Custom/LineFrame_White.png'},
    {'name': 'ring-large', 'source': FRM + 'Frame_Custom/BasicFrame_Circle_154_White.png'},
    {'name': 'ring-red', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Red.png'},
    {'name': 'ring-blue', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Blue.png'},
    {'name': 'ring-green', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Green1.png'},
    {'name': 'ring-sky', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Sky.png'},
    {'name': 'ring-brown', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Brown.png'},
    {'name': 'ring-mint', 'source': FRM + 'Frame_Demo_Common/BasicFrame_Circle_116_Green2.png'},
    # Popups
    {'name': 'popup-body', 'source': C + 'Popup/Popup_Custom/Popup_White1_Body.png'},
    {'name': 'popup-topbar', 'source': C + 'Popup/Popup_Custom/Popup_White4_TopBar02.png'},
    # Timer bar
    {'name': 'slider-frame', 'source': C + 'Slider/Slider_Demo_Light/Slider01_Frame.png'},
    {'name': 'slider-fill', 'source': C + 'Slider/Slider_Demo_Light/Slider01_Fill.png'},
    {'name': 'slider-low-frame', 'source': C + 'Slider/Slider_Demo_Light/Slider23_Frame.png'},
    {'name': 'slider-low-fill', 'source': C + 'Slider/Slider_Demo_Light/Slider23_Fill_Red.png'},
    # Labels and chips
    {'name': 'ribbon-blue', 'source': LBL + 'Label_Ribbon00_Color_Blue.png'},
    {'name': 'tag-white', 'source': LBL + 'Label_Tag01_White.png'},
    {'name': 'tag-red', 'source': LBL + 'Label_Tag01_Color_Red.png'},
    {'name': 'tag-blue', 'source': LBL + 'Label_Tag01_Color_Blue.png'},
    {'name': 'tag-green', 'source': LBL + 'Label_Tag01_Color_Green.png'},
    # UI etc.
    {'name': 'selected', 'source': ETC + 'Toggle_Check_On.png'},
    {'name': 'switch-on', 'source': ETC + 'Toggle_Switch_Frame_On.png'},
    {'name': 'switch-off', 'source': ETC + 'Toggle_Switch_Frame_Off_Light.png'},
    {'name': 'switch-handle', 'source': ETC + 'Toggle_Switch_Handle.png'},
    {'name': 'input-frame', 'source': ETC + 'InputField_Frame.png'},
    # Picto icons
    {'name': 'icon-home', 'source': PICTO + 'home_1.png'},
    {'name': 'icon-add', 'source': PICTO + 'symbol_plus.png'},
    {'name': 'icon-share', 'source': PICTO + 'share.png'},
    {'name': 'icon-photo', 'source': PICTO + 'photo.png'},
    {'name': 'icon-topic-transport', 'source': PICTO + 'car.png'},
    {'name': 'icon-topic-space', 'source': PICTO + 'rocket.png'},
    {'name': 'icon-download', 'source': PICTO + 'download.png'},
    {'name': 'icon-back', 'source': PICTO + 'arrow_left.png'},
    {'name': 'icon-close', 'source': PICTO + 'symbol_x.png'},
    {'name': 'icon-check', 'source': PICTO + 'symbol_check.png'},
    {'name': 'icon-pause', 'source': PICTO + 'player_pause.png'},
    {'name': 'icon-play', 'source': PICTO + 'player_play.png'},
    {'name': 'icon-undo', 'source': PICTO + 'player_rw.png'},
    {'name': 'icon-redo', 'source': PICTO + 'player_fw.png'},
    {'name': 'icon-clear', 'source': PICTO + 'delete_1.png'},
    {'name': 'icon-palette', 'source': PICTO + 'color.png'},
    {'name': 'icon-peek', 'source': PICTO + 'eye_show.png'},
    {'name': 'icon-topic-mixed', 'source': PICTO + 'mix.png'},
    {'name': 'icon-topic-animals', 'source': PICTO + 'paw.png'},
    {'name': 'icon-topic-occupations', 'source': PICTO + 'tool_1.png'},
    {'name': 'icon-topic-sports', 'source': PICTO + 'shoes.png'},
    {'name': 'icon-topic-hongkong', 'source': PICTO + 'ship.png'},
    {'name': 'icon-topic-actions', 'source': PICTO + 'run.png'},
    {'name': 'sound-on', 'source': PICTO + 'sound_on.png'},
    {'name': 'sound-off', 'source': PICTO + 'sound_off.png'},
    # Item icons
    {'name': 'icon-topic-food', 'source': ITEM + 'pizza.png'},
    {'name': 'icon-topic-things', 'source': ITEM + 'home.png'},
    {'name': 'icon-topic-cartoons', 'source': ITEM + 'tv.png'},
    {'name': 'icon-topic-nature', 'source': ITEM + 'rainbow.png'},
    {'name': 'icon-topic-festivals', 'source': ITEM + 'gift_red.png'},
    {'name': 'icon-topic-fairytales', 'source': ITEM + 'unicorn.png'},
    {'name': 'pencil', 'source': ITEM + 'pencil.png'},
    {'name': 'icon-hourglass', 'source': ITEM + 'hourglass.png'},
    {'name': 'icon-bulb', 'source': ITEM + 'bulb.png'},
    {'name': 'icon-heart', 'source': ITEM + 'heart.png'},
    {'name': 'icon-flag', 'source': ITEM + 'flag_0_red.png'},
    {'name': 'icon-friends', 'source': ITEM + 'friends.png'},
    {'name': 'icon-replay', 'source': PICTO + 'refresh.png'},
    {'name': 'star', 'source': ITEM + 'star_0.png'},
    {'name': 'book', 'source': ITEM + 'book_blue.png'},
    {'name': 'trophy', 'source': ITEM + 'trophy_gold.png'},
    {'name': 'settings', 'source': ITEM + 'setting.png'},
    # Backgrounds (small files only; the 1-1.4 MB Background_00/01 are deliberately excluded)
    {'name': 'bg-sky', 'source': BG + 'Background_Gradatient01_Sky.png'},
    {'name': 'bg-pattern', 'source': BG + 'Background_pattern.png'},
    # Higher-contrast PictoIcon replacements, kept as separate assets for the UI layer.
    {'name': 'picto-settings', 'source': PICTO + 'setting_1.png'},
    {'name': 'picto-book', 'source': PICTO + 'book_1.png'},
    {'name': 'picto-pencil', 'source': PICTO + 'pencil.png'},
    {'name': 'picto-trophy', 'source': PICTO + 'trophy_1.png'},
    {'name': 'picto-star', 'source': PICTO + 'star.png'},
    {'name': 'picto-heart', 'source': PICTO + 'love.png'},
    {'name': 'picto-friends', 'source': PICTO + 'friend.png'},
    {'name': 'picto-hourglass', 'source': PICTO + 'hourglass.png'},
    {'name': 'picto-bulb', 'source': PICTO + 'bulb.png'},
    {'name': 'picto-flag', 'source': PICTO + 'flag_1.png'},
    {'name': 'picto-topic-food', 'source': PICTO + 'apple.png'},
    {'name': 'picto-topic-things', 'source': PICTO + 'home_2.png'},
    {'name': 'picto-topic-cartoons', 'source': PICTO + 'tv.png'},
    {'name': 'picto-topic-nature', 'source': PICTO + 'tree.png'},
    {'name': 'picto-topic-festivals', 'source': PICTO + 'gift_1.png'},
    {'name': 'picto-topic-fairytales', 'source': PICTO + 'unicorn.png'},
]
# Width multipliers emitted for every nine-slice asset (percent of the source pixel border).
SCALES = (20, 25, 33, 40, 50, 66, 100)
UNITY_ROOT = 'Assets/Layer Lab/GUI Pro-SimpleCasual/ResourcesData/Sprites/'


def png_size(data, name):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        sys.exit(f'{name}: not a PNG with a leading IHDR chunk')
    return struct.unpack('>II', data[16:24])


def unity_borders(package):
    """Map Unity asset path -> (left, bottom, right, top) from a gzip tar, without extracting to disk."""
    names, metas = {}, {}
    with tarfile.open(package, 'r|gz') as tar:
        for member in tar:
            if not member.isfile():
                continue
            guid, _, leaf = member.name.lstrip('./').partition('/')
            if leaf not in ('pathname', 'asset.meta'):
                continue
            text = tar.extractfile(member).read().decode('utf-8', 'replace')
            (names if leaf == 'pathname' else metas)[guid] = text
    out = {}
    for guid, path in names.items():
        path = path.splitlines()[0].strip()
        m = re.search(r'spriteBorder:\s*\{x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*z:\s*([\d.]+),\s*w:\s*([\d.]+)\}', metas.get(guid, ''))
        out[path] = tuple(round(float(v)) for v in m.groups()) if m else None
    return out


def match_unity(source, borders):
    rel = source.split('PNG/PNG_Light/', 1)[1]
    rel = rel.replace('Component/', 'Components/', 1)
    exact = UNITY_ROOT + rel
    if exact in borders:
        return exact
    base = rel.rsplit('/', 1)[1].lower()
    hits = [p for p in borders if p.lower().endswith('/' + base) and '_dark' not in p.lower()]
    if hits and len({borders[p] for p in hits}) == 1:
        return hits[0]
    if not hits:
        return None
    sys.exit(f'Ambiguous Unity metadata for {source}: {hits}')


def css_slice(border, width, height):
    """Unity (left, bottom, right, top) -> CSS (top, right, bottom, left); keep >=2px centre for `fill`."""
    left, bottom, right, top = border or (0, 0, 0, 0)
    adjusted = False
    if left + right > width - 2 and left + right:
        k = (width - 2) / (left + right)
        left, right, adjusted = int(left * k), int(right * k), True
    if top + bottom > height - 2 and top + bottom:
        k = (height - 2) / (top + bottom)
        top, bottom, adjusted = int(top * k), int(bottom * k), True
    return [top, right, bottom, left], adjusted


def main():
    args = [a for a in sys.argv[1:]]
    package = None
    if '--unitypackage' in args:
        i = args.index('--unitypackage')
        package = args[i + 1]
        del args[i:i + 2]
    source = pathlib.Path(args[0] if args else DEFAULT_ZIP)
    package = pathlib.Path(package or source.with_name('GUI Pro - Simple Casual.unitypackage'))
    root = pathlib.Path(__file__).resolve().parents[1]
    if not source.exists() or not package.exists():
        sys.exit(f'Missing licensed archive ({source}) or Unity package ({package}).')
    names = [item['name'] for item in ITEMS]
    if len(set(names)) != len(names):
        sys.exit('Duplicate asset names in ITEMS')
    borders = unity_borders(package)
    out = root / 'assets/layerlab'
    out.mkdir(parents=True, exist_ok=True)
    manifest, css_root, css_classes = [], [], []
    with zipfile.ZipFile(source) as z:
        for item in ITEMS:
            data = z.read(item['source'])
            width, height = png_size(data, item['source'])
            unity_path = match_unity(item['source'], borders)
            border = borders.get(unity_path) if unity_path else None
            nine = bool(border and any(border))
            slice_, adjusted = css_slice(border if nine else None, width, height)
            file = f"assets/layerlab/{item['name']}.png"
            (root / file).write_bytes(data)
            manifest.append({
                'file': file,
                'source': item['source'],
                'sha256': hashlib.sha256(data).hexdigest(),
                'bytes': len(data),
                'width': width,
                'height': height,
                'unityPath': unity_path,
                'spriteBorder': dict(zip(('left', 'bottom', 'right', 'top'), border)) if border else None,
                'cssSlice': slice_ if nine else None,
                'sliceAdjusted': adjusted,
            })
            v = f"--ll-{item['name']}"
            url = f'url("../{file}")'
            lines = [f'{v}-img: {url};', f'{v}-size: {width}px {height}px;', f'{v}-ratio: {width} / {height};']
            cls = [f'--ll-img: var({v}-img);', f'--ll-width: {width}px;', f'--ll-height: {height}px;']
            if nine:
                s = ' '.join(map(str, slice_))
                lines += [f'{v}-slice: {s} fill;', f'{v}: {url} {s} fill;']
                for pct in SCALES:
                    lines.append(f'{v}-w{pct}: ' + ' '.join(f'{round(n * pct / 100, 2)}px' for n in slice_) + ';')
                cls += [f'--ll-slice: var({v}-slice);', f'--ll-border: var({v}-w100);']
            else:
                # Zero-border Unity sprites are rendered whole, never assigned invented corner slices.
                lines += [f'{v}-slice: 0 fill;', f'{v}: {url} 0 fill;']
                for pct in SCALES:
                    lines.append(f'{v}-w{pct}: 0;')
                cls += [f'--ll-slice: var({v}-slice);', '--ll-border: 0;']
            css_root.append('  ' + '\n  '.join(lines))
            css_classes.append(f".ll-{item['name']} {{ {' '.join(cls)} }}")
    manifest_text = json.dumps(manifest, indent=2) + '\n'
    digest = hashlib.sha256(manifest_text.encode()).hexdigest()
    (root / 'scripts/layerlab-assets.json').write_text(manifest_text)
    header = (
        '/* GENERATED by scripts/import-layerlab.py - do not edit. Licensed LayerLab slicing data.\n'
        f'   manifest-sha256: {digest}\n'
        '   Unity spriteBorder (left,bottom,right,top) is converted to CSS slice order (top right bottom left). */\n'
    )
    (root / 'css/layerlab-slices.css').write_text(header + ':root {\n' + '\n'.join(css_root) + '\n}\n' + '\n'.join(css_classes) + '\n')
    total = sum(m['bytes'] for m in manifest)
    sliced = sum(1 for m in manifest if m['cssSlice'])
    print(f'Imported {len(manifest)} local assets ({total} bytes, {sliced} nine-slice); manifest {digest[:12]}; originals unchanged.')


if __name__ == '__main__':
    main()
