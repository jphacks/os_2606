import unittest
from completion import predict,evaluate
class CompletionTest(unittest.TestCase):
 def test_base(self):
  self.assertTrue(0<predict(19,48)<30)
 def test_unknown_garment(self):
  with self.assertRaises(ValueError):predict(19,48,'hoodie')
 def test_extrapolation(self):
  with self.assertRaises(ValueError):predict(30,60)
 def test_validation(self):
  m=evaluate();self.assertEqual(m['n_conditions'],10);self.assertEqual(m['n_case_groups'],5)
if __name__=='__main__': unittest.main()
