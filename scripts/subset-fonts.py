"""Split bundled CJK fonts by shipped text, retaining the complete source cmap.
Original source fonts stay in the checkout. Only core/extended parts are shipped.
Run after locale updates; never read player storage or user documents.
"""
from pathlib import Path
import json, hashlib, re
from fontTools.ttLib import TTFont
from fontTools import subset
root=Path(__file__).resolve().parent.parent
manifest=root/'scripts/font-assets.json'; source_manifest=root/'scripts/font-source-assets.json'
large=['gensen-rounded-tw-medium.woff2','gensen-rounded-tw-bold.woff2','noto-sans-jp.woff2','noto-sans-kr.woff2']
records=json.loads(manifest.read_text())
sources=json.loads(source_manifest.read_text()) if source_manifest.exists() else [r for r in records if Path(r['file']).name in large]
source_manifest.write_text(json.dumps(sources,indent=2)+'\n')
text=''.join(p.read_text() for p in (root/'js').rglob('*') if p.suffix in ['.json','.mjs','.js'])
common={ord(c) for c in text}|set(range(32,127))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ranges(points):
 parts=[]
 for cp in sorted(points):
  if parts and parts[-1][1]+1==cp:parts[-1][1]=cp
  else:parts.append([cp,cp])
 return ','.join('U+%X'%a+('-%X'%b if b!=a else '') for a,b in parts)
css=(root/'css/fonts.css').read_text(); output=[]; evidence=[]
for source in sources:
 p=root/source['file']; assert sha(p)==source['sha256']
 original=TTFont(p); cmap=original.getBestCmap(); available=set(cmap); sets={'core':available&common,'extended':available-common};assert sets['core']|sets['extended']==available
 blocks=[]
 # On rerun start from the retained original CSS, avoiding regex over generated ranges.
 original_css=root/'scripts/font-source.css'
 if not original_css.exists():original_css.write_text(css)
 base=original_css.read_text();block=next(b for b in re.findall(r'@font-face\s*\{[^}]+\}',base) if p.name in b)
 for kind,points in sets.items():
  f=TTFont(p);options=subset.Options();options.layout_features=['*'];options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*'];options.glyph_names=True;options.recalc_timestamp=False
  sub=subset.Subsetter(options=options);sub.populate(unicodes=points);sub.subset(f)
  # Layout closure can retain alias glyphs; keep cmap routing disjoint.
  for table in f['cmap'].tables:
   if table.isUnicode() and table.format != 14:
    table.cmap={cp:g for cp,g in table.cmap.items() if cp in points}
  # Distinct derivative names; preserve copyright and OFL name records.
  name='SketchGuess-'+p.stem+'-'+kind
  for rec in f['name'].names:
   if rec.nameID in [1,3,4,6,16]:rec.string=name.encode(rec.getEncoding(),errors='replace')
  target=p.with_name(p.stem+'-'+kind+'.woff2');f.flavor='woff2';f.save(target)
  loaded=TTFont(target);actual=loaded.getBestCmap();assert set(actual)==points
  assert all(loaded['hmtx'][actual[cp]]==original['hmtx'][cmap[cp]] for cp in points)
  assert loaded['hhea'].ascent==original['hhea'].ascent and loaded['hhea'].descent==original['hhea'].descent
  rel=str(target.relative_to(root));output.append({'file':rel,'family':source['family'],'bytes':target.stat().st_size,'sha256':sha(target),'license':source['license'],'licenseFile':source['licenseFile'],'sourceFile':source['file'],'sourceSha256':source['sha256'],'partition':kind,'unicodeCodepoints':len(points),'conversion':'fontTools Unicode partition; all layout features; full source coverage across both parts'})
  blocks.append(block.replace(p.name,target.name).replace('font-display: swap;','font-display: swap;\n  unicode-range: '+ranges(points)+';'))
 evidence.append({'source':source['file'],'sourceBytes':source['bytes'],'sourceCodepoints':len(available),'parts':[{k:v for k,v in r.items() if k in ['file','bytes','unicodeCodepoints']} for r in output[-2:]],'coverageExact':True,'advancesExact':True,'verticalMetricsExact':True})
 css=css.replace(block,'\n'.join(blocks)) if block in css else css
# Always assemble from source CSS for deterministic reruns.
base=(root/'scripts/font-source.css').read_text()
for source in sources:
 p=Path(source['file']);block=next(b for b in re.findall(r'@font-face\s*\{[^}]+\}',base) if p.name in b)
 blocks=[]
 for kind in ['core','extended']:
  target=root/p.with_name(p.stem+'-'+kind+'.woff2');points=set(TTFont(target).getBestCmap())
  blocks.append(block.replace(p.name,target.name).replace('font-display: swap;','font-display: swap;\n  unicode-range: '+ranges(points)+';'))
 base=base.replace(block,'\n'.join(blocks))
base=base.replace('/* Bundled OFL fonts. Full glyph sets are retained for player names/custom words. */','/* Generated CJK core/extended partitions. Full Unicode coverage retained for names/custom words. Run scripts/subset-fonts.py. */')
(root/'css/fonts.css').write_text(base)
records=[r for r in records if Path(r['file']).name not in large and r.get('partition') not in ['core','extended']]
manifest.write_text(json.dumps(records+output,indent=2)+'\n')
(root/'scripts/font-partition-report.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence,indent=2))
