"""Observed whole-load completion time: 2024 room-drying paper only.

Do not apply this to a garment type, air-conditioner setpoint, or initial sensor values.
"""
from pathlib import Path
import csv
import numpy as np

ROOT=Path(__file__).parent
DATA=ROOT/'completion_observations.csv'


def rows():
    with DATA.open(encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))


def design(rows_):
    return np.array([[1.0, float(r['indoor_temp_c']),float(r['indoor_rh_pct'])] for r in rows_])


def fit(rows_):
    X=design(rows_)
    y=np.array([float(r['drying_hours']) for r in rows_])
    if len(rows_) < 4 or np.linalg.matrix_rank(X)<3:
        raise ValueError('Insufficient independent observed conditions')
    return np.linalg.lstsq(X,y,rcond=None)[0]


def evaluate():
    rs=rows(); beta=fit(rs); y=np.array([float(r['drying_hours']) for r in rs]); yhat=design(rs)@beta
    groups=sorted(set(r['case_id'] for r in rs)); errors=[]
    for group in groups:
        train=[r for r in rs if r['case_id']!=group]
        test=[r for r in rs if r['case_id']==group]
        pred=design(test)@fit(train)
        actual=np.array([float(r['drying_hours']) for r in test])
        errors.extend((pred-actual).tolist())
    return {'coefficients':beta.tolist(),'train_mae_h':float(np.mean(abs(yhat-y))),
            'leave_case_out_mae_h':float(np.mean(np.abs(np.asarray(errors)))),
            'n_conditions':len(rs),'n_case_groups':len(groups)}


def predict(temp,rh,clothing='mixed_2kg_30items'):
    if clothing!='mixed_2kg_30items':
        raise ValueError('No independently identified garment-type coefficients; only mixed_2kg_30items is supported')
    rs=rows()
    temp=float(temp); rh=float(rh)
    # if not (min(float(r['indoor_temp_c']) for r in rs)<=temp<=max(float(r['indoor_temp_c']) for r in rs) and
    #         min(float(r['indoor_rh_pct']) for r in rs)<=rh<=max(float(r['indoor_rh_pct']) for r in rs)):
    #     raise ValueError('Outside the observed temperature/humidity marginal ranges; refusing extrapolation')
    duration=float(np.array([1,temp,rh])@fit(rs))
    if duration<=0:raise ValueError('Nonphysical prediction; insufficient evidence')
    return duration
