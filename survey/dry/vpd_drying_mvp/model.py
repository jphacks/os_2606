#!/usr/bin/env python3
"""Empirical VPD drying-time baseline. Data: Sato et al. (2024), 10 cases.
The input T/RH must be the *mean during the entire drying period*, NOT a live reading.
"""
import argparse, csv, json
from pathlib import Path
import numpy as np

DATA=Path(__file__).with_name('observations.csv')

def saturation_kpa(t):
    return 0.6108*np.exp(17.27*np.asarray(t,dtype=float)/(np.asarray(t,dtype=float)+237.3))

def vpd(t,rh):
    return saturation_kpa(t)*(1-np.asarray(rh,dtype=float)/100)

def load():
    with DATA.open(newline='',encoding='utf-8') as f: rows=list(csv.DictReader(f))
    t=np.array([float(r['temp_c']) for r in rows]); rh=np.array([float(r['rh_pct']) for r in rows]);
    y=np.array([float(r['drying_hours']) for r in rows]);
    case=np.array([int(r['condition']) for r in rows]);
    return t,rh,y,case

def fit(t,rh,y,method):
    z=vpd(t,rh)
    if np.any(z<=0): raise ValueError('VPD must be positive for model training')
    if method=='vpd_inverse':
        x=1/z
        return float(np.dot(x,y)/np.dot(x,x))
    if method=='linear': return np.linalg.lstsq(np.column_stack([np.ones(len(t)),t,rh]),y,rcond=None)[0]
    if method=='log_vpd':
        return np.linalg.lstsq(np.column_stack([np.ones(len(t)),np.log(z)]),np.log(y),rcond=None)[0]
    raise ValueError(method)

def predict(t,rh,param,method):
    z=vpd(t,rh)
    if np.any(z<=0): return np.inf if np.ndim(z)==0 else np.where(z<=0,np.inf,np.nan)
    if method=='vpd_inverse': return param/z
    if method=='linear': return param[0]+param[1]*np.asarray(t)+param[2]*np.asarray(rh)
    if method=='log_vpd': return np.exp(param[0]+param[1]*np.log(z))
    raise ValueError(method)

def evaluate():
    t,rh,y,case=load()
    result={}
    for method in ['vpd_inverse','log_vpd','linear']:
        p=fit(t,rh,y,method); predictions=predict(t,rh,p,method)
        cv=np.zeros_like(y)
        for group in sorted(set(case)):
            train=case!=group
            cv[~train]=predict(t[~train],rh[~train],fit(t[train],rh[train],y[train],method),method)
        result[method]={
            'coefficients':np.atleast_1d(p).tolist(),
            'train_mae_hours':round(float(np.mean(np.abs(predictions-y))),3),
            'group_cv_mae_hours':round(float(np.mean(np.abs(cv-y))),3),
            'group_cv_rmse_hours':round(float(np.sqrt(np.mean((cv-y)**2))),3),
        }
    return result

def main():
    parser=argparse.ArgumentParser(description='Research-baseline VPD drying-time comparison')
    parser.add_argument('--temp',type=float)
    parser.add_argument('--rh',type=float)
    parser.add_argument('--allow-extrapolation',action='store_true')
    parser.add_argument('--compare',action='store_true')
    args=parser.parse_args()
    t,rh,y,case=load()
    if args.compare or args.temp is None or args.rh is None:
        print(json.dumps(evaluate(),ensure_ascii=False,indent=2))
        if args.temp is None or args.rh is None: return
    if not (-30<=args.temp<=60 and 0<=args.rh<=100): parser.error('Invalid temp/rh')
    outside=not (t.min()<=args.temp<=t.max() and rh.min()<=args.rh<=rh.max())
    if outside and not args.allow_extrapolation:
        parser.error('Outside observed temperature/RH range. Supply --allow-extrapolation for illustrative unvalidated projection.')
    z=float(vpd(args.temp,args.rh))
    print(f'VPD: {z:.3f} kPa')
    if z<=0:
        print('VPD=0: no finite drying-time estimate in this simplified model.')
        return
    method='vpd_inverse'; p=fit(t,rh,y,method)
    print(f'Fitted alpha: {p:.4f} h*kPa')
    print(f'Drying-time estimate (fixed research load): {float(predict(args.temp,args.rh,p,method)):.2f} h')
    print('WARNING: exploratory estimate; calibrated on 10 observational conditions from one study.')
    print('T/RH are MEAN DURING drying, not current readings; no garment type or AC setting modeled.')
    if outside: print('WARNING: extrapolation outside observed ranges; not validated.')

if __name__=='__main__': main()
