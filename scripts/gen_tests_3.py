#!/usr/bin/env python3
"""
Test case generator for Problem 3: Valid Parentheses
Generates input files in data/test/ and expected output files in data/stdout/
Naming convention: {problem_id}_{test_id}.txt
"""

import os

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
TEST_DIR = os.path.join(BASE_DIR, "test")
STDOUT_DIR = os.path.join(BASE_DIR, "stdout")
PROBLEM_ID = 3


PAIRS = {")": "(", "]": "[", "}": "{"}
OPENING = set(PAIRS.values())


def valid_parentheses_answer(s: str) -> str:
    """Return YES when every bracket is closed by the correct matching bracket."""
    stack: list[str] = []

    for char in s:
        if char in OPENING:
            stack.append(char)
        elif not stack or stack.pop() != PAIRS[char]:
            return "NO"

    return "YES" if not stack else "NO"


def write_test(test_id: int, s: str) -> None:
    ans = valid_parentheses_answer(s)

    input_path = os.path.join(TEST_DIR, f"{PROBLEM_ID}_{test_id}.txt")
    output_path = os.path.join(STDOUT_DIR, f"{PROBLEM_ID}_{test_id}.txt")

    with open(input_path, "w", encoding="utf-8") as f:
        f.write(f"{s}\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"{ans}\n")

    preview = s if len(s) <= 40 else s[:37] + "..."
    print(f"  [Test {test_id:2d}]  len={len(s):<5}  s={preview}  =>  {ans}")


def main() -> None:
    os.makedirs(TEST_DIR, exist_ok=True)
    os.makedirs(STDOUT_DIR, exist_ok=True)

    print(f"Generating test cases for problem {PROBLEM_ID} (Valid Parentheses)")
    print(f"  Output dirs: {TEST_DIR}  |  {STDOUT_DIR}\n")

    # 1. Canonical example from the problem statement
    write_test(1, "()[]{}")

    # 2. Nested valid sequence from the problem statement
    write_test(2, "([{}])")

    # 3. Wrong bracket type from the problem statement
    write_test(3, "(]")

    # 4. Correct counts but wrong closing order from the problem statement
    write_test(4, "([)]")

    # 5. Minimum length: single opening bracket
    write_test(5, "(")

    # 6. Minimum length: single closing bracket
    write_test(6, "]")

    # 7. Deep mixed nesting
    write_test(7, "{[({[()]})]}")

    # 8. Valid adjacent groups with different bracket types
    write_test(8, "{}{}[[]](())")

    # 9. Extra unmatched opening bracket at the end
    write_test(9, "([]{}){")

    # 10. Extra unmatched closing bracket at the beginning
    write_test(10, ")([]{})")

    # 11. Almost valid, mismatch near the end
    write_test(11, "({[]})({[}])")

    # 12. Alternating valid pairs
    write_test(12, "()()[]{}([]{})")

    # 13. Long valid nested case at max constraint length (10^4)
    write_test(13, "(" * 2500 + "[" * 2500 + "]" * 2500 + ")" * 2500)

    # 14. Long invalid nested case with one wrong final closer
    write_test(14, "(" * 4999 + ")" * 4998 + "]")

    # 15. Long valid repeated pattern at max constraint length (10^4)
    pattern = "()[]"
    write_test(15, pattern * (10_000 // len(pattern)))

    print(f"\nDone — {15} test cases written.")


if __name__ == "__main__":
    main()
