"""Check the shared report export contract, not the historical exploratory grid."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
d = json.loads((ROOT / 'data/simulator/real.json').read_text())
assert d['version'] == 2 and not d['code']['uncommitted_changes'], 'Report source must be committed'
assert len(d['code']['virtual_radiosonde']) == 40
assert d['passes'] == len(d['epochs'])
assert d['defaults'] == dict(prior='none', layers='2', motion='building')
variants = 0
for motion in d['controls']['motion']:
    for prior in d['controls']['prior']:
        for layers in d['controls']['layers']:
            e = d['results'][motion][prior][layers]
            assert 'error' not in e
            n = len(e['edges']) - 1
            assert n == len(e['layer_points']) == len(e['rmse']) == len(e['station_r'])
            assert sum(x['n'] for x in e['layer_points']) == e['points_used']
            assert all(x['n'] >= 20 for x in e['layer_points']), 'Public aggregation floor'
            for key in ('est_anomaly', 'truth_anomaly'):
                assert len(e['steps'][key]) == n
                assert all(len(row) == d['passes'] and all(math.isfinite(x) for x in row) for row in e['steps'][key])
            variants += 1
for page in ('results.html',):
    text = (ROOT / page).read_text()
    assert 'js/report.js' in text and 'data/real/estimation.json' not in text
assert not (ROOT / 'data/real/estimation.json').exists(), 'Retire the superseded result export'
print(f'{variants} clean-source report variants; one observed-evidence destination')
