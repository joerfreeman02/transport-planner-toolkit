import unittest

from diagnose_tfl_ibus_stop_mappings import unresolved_mapping_records


class TfLStopMappingDiagnosticTests(unittest.TestCase):
    def test_classifies_absent_stop_record_and_record_without_naptan(self):
        references = [
            {"patternIdx": "P-1", "stopPointIdx": "missing"},
            {"patternIdx": "P-2", "stopPointIdx": "no-code"},
            {"patternIdx": "P-3", "stopPointIdx": "mapped"},
        ]
        stop_records = {
            "no-code": [{"naptanCode": None}],
            "mapped": [{"naptanCode": "490000001A"}],
        }

        gaps = unresolved_mapping_records(references, stop_records)

        self.assertEqual([item["mappingStatus"] for item in gaps], [
            "no-Stop_Point-record",
            "Stop_Point-record-has-no-NaPTAN_Code",
        ])
        self.assertEqual([item["stopPointIdx"] for item in gaps], ["missing", "no-code"])

    def test_duplicate_naptan_records_are_a_mapping(self):
        gaps = unresolved_mapping_records(
            [{"patternIdx": "P", "stopPointIdx": "x"}],
            {"x": [{"naptanCode": "490000001A"}, {"naptanCode": "490000001A"}]},
        )
        self.assertEqual(gaps, [])


if __name__ == "__main__":
    unittest.main()
