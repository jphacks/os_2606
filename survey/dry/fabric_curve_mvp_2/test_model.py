import unittest,math
from model import constant_rate, half_time, falling_phase_time
class TestFabric(unittest.TestCase):
    def test_published(self): self.assertAlmostEqual(constant_rate(20,50),.33)
    def test_figure(self): self.assertAlmostEqual(half_time(20,50),2.3)
    def test_exponential(self):self.assertAlmostEqual(falling_phase_time(20,50,.25),4.6)
    def test_reject_extrapolation(self):
        with self.assertRaises(ValueError): constant_rate(35,50)
    def test_monotonic(self): self.assertGreater(constant_rate(20,30),constant_rate(20,70))
if __name__=='__main__': unittest.main()
