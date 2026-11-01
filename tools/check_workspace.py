"""Story, accessibility, legacy routing and public-weather contracts. Standard library only."""
from collections import Counter
from html.parser import HTMLParser
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self,path):
        super().__init__()
        self.ids=[];self.tabs=[];self.views=[];self.tips=[];self.inputs=[];self.body={}
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if 'data-site-tab' in a or 'data-tab' in a:self.tabs.append(a)
        if 'data-site-view' in a or a.get('role')=='tabpanel':self.views.append(a)
        if 'data-tip' in a:self.tips.append((tag,a))
        if tag=='input':self.inputs.append(a)
        if tag=='body':self.body=a


active={'index.html':2,'simulator.html':3,'results.html':2}
for name,count in active.items():
    page=Page(ROOT/name)
    duplicates=[k for k,v in Counter(page.ids).items() if v>1]
    assert not duplicates,(name,'duplicate IDs',duplicates)
    assert len(page.tabs)==len(page.views)==count,(name,'only the intended main screens should be navigable')
    assert {t['aria-controls'] for t in page.tabs}=={v['id'] for v in page.views}
    for tag,a in page.tips:
        if tag=='button':assert a.get('type')=='button' and a.get('aria-label'),(name,'tooltip name')
    assert 'css/story.css' in (ROOT/name).read_text(encoding='utf-8')

retired=['theory.html','buildings.html','animations.html','estimation.html','overview.html','data.html','3d/index.html']
for name in retired:
    page=Page(ROOT/name)
    assert not page.views,(name,'retired screens must not remain a parallel site')
    targets=[page.body['data-redirect'],*json.loads(page.body.get('data-routes','{}')).values()]
    for target in targets:
        url=urlsplit(target)
        assert url.path in active,(name,'legacy route must end in the story',target)
        if url.fragment:assert url.fragment in Page(ROOT/url.path).ids,(name,'legacy anchor',target)
    assert 'js/redirect.js' in (ROOT/name).read_text()

sim=Page(ROOT/'simulator.html')
assert {i['value'] for i in sim.inputs if i.get('name')=='atm'}=={'simulated','radiosonde','cabauw'}
assert {'height','motion'}<={v['id'] for v in Page(ROOT/'index.html').views}
assert {'signal','coverage'}<={v['id'] for v in Page(ROOT/'results.html').views}
for removed in ['js/animations.js','js/overview.js','js/theory.js','3d/flight.js']:
    assert not (ROOT/removed).exists(),('unused story surfaces should not ship',removed)

doc=json.loads((ROOT/'data/simulator/real.json').read_text())
temperature=json.loads((ROOT/'data/building-temperature.json').read_text())
assert temperature['memory_h']==72 and temperature['window_tau']==6 and temperature['overpass_utc_hour']==6
assert temperature['dates']==doc['epochs']
assert len(temperature['temperature_c'])==len(doc['epochs']) and all(math.isfinite(x) for x in temperature['temperature_c'])
assert all(len(h)==64 for h in temperature['inputs_sha256'].values())
print('3 destinations, 7 main screens, 7 legacy redirects, public 72 h weather intact')
