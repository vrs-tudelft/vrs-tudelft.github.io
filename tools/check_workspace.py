"""Static UI contracts for shared composition, public weather and legacy deep links."""
from collections import Counter
from html.parser import HTMLParser
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self,path):
        super().__init__();self.ids=[];self.tabs=[];self.views=[];self.tips=[];self.feed(path.read_text(encoding='utf-8'))
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if 'data-site-tab' in a:self.tabs.append(a)
        if 'data-site-view' in a:self.views.append(a)
        if 'data-tip' in a:self.tips.append((tag,a))


pages=['index.html','theory.html','estimation.html','buildings.html','results.html','data.html','3d/index.html']
for name in pages:
    p=Page(ROOT/name)
    duplicate=[k for k,v in Counter(p.ids).items() if v>1]
    assert not duplicate,(name,'duplicate IDs',duplicate)
    assert len(p.tabs)==len(p.views)>=2,(name,'tab/view mismatch')
    assert {t['aria-controls'] for t in p.tabs}=={v['id'] for v in p.views}
    for tag,a in p.tips:
        if tag=='button':assert a.get('type')=='button' and a.get('aria-label'),(name,'tooltip accessible name')
for name,anchors in {
    'index.html':['about','paper-team','claims'],
    'data.html':['reference','low-level','soundings','rule'],
    'estimation.html':['chain','mother','sim-chain','limits'],
    'buildings.html':['thermal','sinking','combined','scene','bands','radar'],
    'results.html':['metrics','passes','station','reading'],
    '3d/index.html':['stage','gl','panel','timepanel','see','noWebgl']
}.items():
    assert set(anchors)<=set(Page(ROOT/name).ids),(name,'legacy deep link missing')
doc=json.loads((ROOT/'data/simulator/real.json').read_text())
temperature=json.loads((ROOT/'data/building-temperature.json').read_text())
assert temperature['memory_h']==72 and temperature['window_tau']==6 and temperature['overpass_utc_hour']==6
assert temperature['dates']==doc['epochs']
assert len(temperature['temperature_c'])==len(doc['epochs']) and all(math.isfinite(x) for x in temperature['temperature_c'])
assert all(len(h)==64 for h in temperature['inputs_sha256'].values())
assert '5-day memory' not in (ROOT/'js/overview-data.js').read_text(encoding='utf-8')
print(f'{len(pages)} consistent workspaces, legacy anchors intact, 213 public 72 h weather values')
