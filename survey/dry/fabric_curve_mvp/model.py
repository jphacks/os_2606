"""1974 fabric-drying paper: published constant-rate coefficients + approximate Fig.9 half-time.
Not a full laundry-completion predictor. Python stdlib only.
"""
import csv, math, argparse
from pathlib import Path
ROOT=Path(__file__).parent

def load():
    with (ROOT/'half_times_fig9_APPROX.csv').open(encoding='utf-8') as f:
        return [{k:float(r[k]) for k in ('temperature_c','humidity_pct','half_time_min')} for r in csv.DictReader(f)]

def interp(x, xp, yp):
    if not xp[0] <= x <= xp[-1]:
        raise ValueError(f'{x} outside measured range [{xp[0]},{xp[-1]}]')
    for i in range(len(xp)-1):
        if xp[i] <= x <= xp[i+1]:
            w=(x-xp[i])/(xp[i+1]-xp[i]); return yp[i]*(1-w)+yp[i+1]*w
    return yp[-1]

def constant_rate(temp,rh):
    """mg/cm^2/min, 1974 paper table 2; interpolate published line coefficients."""
    a=interp(temp,[10,20,30],[.006,.007,.011]); b=interp(temp,[10,20,30],[.56,.68,1.04])
    if not 10 <= rh <=70: raise ValueError('RH outside paper range 10-70%')
    return b-a*rh

def half_time(temp,rh):
    """Falling rate: half-time minutes, rough visual reads of Fig 9 (not exact)."""
    ds=load(); levels=[10,20,30]
    per_t=[]
    for t in levels:
        subset=sorted((r for r in ds if r['temperature_c']==t), key=lambda x:x['humidity_pct'])
        per_t.append(interp(rh,[x['humidity_pct'] for x in subset],[x['half_time_min'] for x in subset]))
    return interp(temp,levels,per_t)

def falling_phase_time(temp,rh,remaining_fraction):
    """Time to reach specified remaining fraction of EXCESS water, from falling-rate onset."""
    if not 0<remaining_fraction<1: raise ValueError('remaining_fraction must be in (0,1)')
    return half_time(temp,rh)*math.log(remaining_fraction)/math.log(.5)

def main():
    p=argparse.ArgumentParser();p.add_argument('--temp',type=float,default=20);p.add_argument('--rh',type=float,default=50); a=p.parse_args()
    print(f'T={a.temp} C, RH={a.rh}%')
    print(f'Initial constant rate: {constant_rate(a.temp,a.rh):.3f} mg/cm²/min')
    print(f'Falling phase half-time (approx): {half_time(a.temp,a.rh):.2f} min')
    for fraction in [.5,.2,.1]:
        print(f'Falling phase to {100*fraction:.0f}% remaining excess water: {falling_phase_time(a.temp,a.rh,fraction):.2f} min')
    print('NOT full clothing drying time; missing transition moisture, initial moisture and completion definition.')
if __name__=='__main__': main()
