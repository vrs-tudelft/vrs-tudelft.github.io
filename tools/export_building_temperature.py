"""Export public KNMI temperature memory for the building illustration; no radar points read.

Run with the analysis environment: python tools/export_building_temperature.py --analysis <analysis repo>
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--analysis',type=Path,required=True)
    args=parser.parse_args()
    source=args.analysis.resolve()
    tree=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD:04_python/estimation'],text=True).strip()
    if tree!='ec37251f0f67599199fcaea0ef66a460d12dbb7f':
        raise ValueError('Review the source temperature model before changing this export')
    sys.path.insert(0,str(source/'04_python'))
    import pandas as pd
    from estimation.ground import read_knmi_hourly, temperature_memory
    doc=json.loads((ROOT/'data/simulator/real.json').read_text())
    files=sorted((source/'02_data/05_weather/knmi').glob('knmi_344_hourly_*.csv'))
    if not files:raise ValueError('Hourly KNMI inputs missing')
    hourly=pd.concat([read_knmi_hourly(p) for p in files])
    values=temperature_memory(hourly,pd.DatetimeIndex(doc['epochs']),tau_h=72.0)
    if values.isna().any():raise ValueError('Hourly inputs do not cover the report passes')
    out=dict(version=1,source='KNMI station 344 hourly temperature, CC BY 4.0',memory_h=72,
             window_tau=6,overpass_utc_hour=6,estimation_tree=tree,
             inputs_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
             dates=doc['epochs'],temperature_c=[round(float(v),5) for v in values])
    (ROOT/'data/building-temperature.json').write_text(json.dumps(out,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'Exported {len(values)} public weather values using the report temperature model; no radar points read.')


if __name__=='__main__':main()
