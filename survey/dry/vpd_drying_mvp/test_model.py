import unittest
import numpy as np
from model import vpd, load, fit, predict, evaluate
class TestModel(unittest.TestCase):
    def test_vpd_saturated(self): self.assertAlmostEqual(float(vpd(20,100)),0.0)
    def test_vpd_humidity(self): self.assertGreater(float(vpd(20,40)),float(vpd(20,80)))
    def test_inverse_positive(self):
        t,r,y,_=load();p=fit(t,r,y,'vpd_inverse');self.assertGreater(p,0);self.assertGreater(float(predict(20,50,p,'vpd_inverse')),0)
    def test_cv(self): self.assertEqual(set(evaluate()),{'vpd_inverse','log_vpd','linear'})
if __name__=='__main__': unittest.main()
