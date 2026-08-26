from app.ocr_main import _parse_tesseract_tsv


def test_tesseract_tsv_reassembles_words_on_the_same_line() -> None:
    header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"
    rows = [
        "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tБелки",
        "5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t88\t7,5",
        "5\t1\t1\t1\t1\t3\t24\t0\t10\t10\t86\tг",
        "5\t1\t1\t1\t2\t1\t0\t15\t10\t10\t92\tЖиры",
        "5\t1\t1\t1\t2\t2\t12\t15\t10\t10\t90\t12",
    ]

    text, confidence = _parse_tesseract_tsv(
        (header + "\n" + "\n".join(rows)).encode("utf-8")
    )

    assert text == "Белки 7,5 г\nЖиры 12"
    assert confidence == 0.892
