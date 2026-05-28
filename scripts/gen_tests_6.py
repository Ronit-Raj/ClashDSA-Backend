#!/usr/bin/env python3
"""
Test case generator for Problem 3: Longest Substring Without Repeating Characters
Generates input files in data/test/ and expected output files in data/stdout/
Naming convention: {problem_id}_{test_id}.txt
"""

import os
import random
import string

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
TEST_DIR = os.path.join(BASE_DIR, "test")
STDOUT_DIR = os.path.join(BASE_DIR, "stdout")
PROBLEM_ID = 6


def longest_substring_answer(s: str) -> int:
    """Standard sliding window approach to find the max unique substring length."""
    char_map = {}
    left = 0
    max_length = 0

    for right, char in enumerate(s):
        if char in char_map and char_map[char] >= left:
            left = char_map[char] + 1
        char_map[char] = right
        max_length = max(max_length, right - left + 1)
    
    return max_length


def write_test(test_id: int, s: str) -> None:
    """Writes the input string and the calculated length to respective files."""
    ans = longest_substring_answer(s)

    input_path = os.path.join(TEST_DIR, f"{PROBLEM_ID}_{test_id}.txt")
    output_path = os.path.join(STDOUT_DIR, f"{PROBLEM_ID}_{test_id}.txt")

    # The problem states: "If the string is empty, the input line will be blank."
    with open(input_path, "w", encoding="utf-8") as f:
        f.write(f"{s}\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"{ans}\n")

    # Preview formatting
    preview = s if len(s) < 30 else s[:27] + "..."
    print(f"  [Test {test_id:2d}]  len={len(s):<7}  s='{preview}'  =>  {ans}")


def main() -> None:
    os.makedirs(TEST_DIR, exist_ok=True)
    os.makedirs(STDOUT_DIR, exist_ok=True)

    print(f"Generating test cases for problem {PROBLEM_ID} (Longest Substring Without Repeating Characters)")
    print(f"  Output dirs: {TEST_DIR}  |  {STDOUT_DIR}\n")

    # 1. Empty string
    write_test(1, "")

    # 2. Single character
    write_test(2, "a")

    # 3. Canonical example 1
    write_test(3, "abcabcbb")

    # 4. All same characters
    write_test(4, "bbbbb")

    # 5. Answer at the end
    write_test(5, "pwwkew")

    # 6. Full unique string
    write_test(6, "abcdefghij")

    # 7. String with spaces
    write_test(7, "a b c a b c")

    # 8. Special characters and symbols
    write_test(8, "!@#$%^&*()!@#")

    # 9. Long repeating sequence with different bridge
    write_test(9, "aaaaaaaaaabcdeaaaaaaaaaa")

    # 10. Numbers and mixed case
    write_test(10, "AbC123aBc456")

    # 11. Large case: All unique ASCII (Printable)
    # 95 printable ASCII chars
    printable = "".join(chr(i) for i in range(32, 127))
    write_test(11, printable)

    # 12. Stress test: Max constraint (10^5)
    # We'll create a pattern [abc...xyz] repeated to ensure O(n) performance
    n = 100_000
    pattern = string.ascii_letters + string.digits
    stress_s = (pattern * (n // len(pattern) + 1))[:n]
    write_test(12, stress_s)

    # 13. Stress test: Max constraint with very small unique window
    # Forces the pointer to move constantly
    stress_s_small = "ab" * (n // 2)
    write_test(13, stress_s_small)

    print(f"\nDone — {13} test cases written.")


if __name__ == "__main__":
    main()