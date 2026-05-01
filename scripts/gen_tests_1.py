#!/usr/bin/env python3
"""
Test case generator for Problem 1: Two Sum
Generates input files in data/test/ and expected output files in data/stdout/
Naming convention: {problem_id}_{test_id}.txt
"""

import os

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
TEST_DIR = os.path.join(BASE_DIR, "test")
STDOUT_DIR = os.path.join(BASE_DIR, "stdout")
PROBLEM_ID = 1


def two_sum_answer(nums: list[int], target: int) -> tuple[int, int]:
    """Return the two indices that sum to target (smaller index first)."""
    seen: dict[int, int] = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return seen[complement], i
        seen[num] = i
    raise ValueError("No solution found — bad test case!")


def write_test(test_id: int, nums: list[int], target: int) -> None:
    i, j = two_sum_answer(nums, target)
    assert i < j, "Indices must be in increasing order"

    input_path = os.path.join(TEST_DIR, f"{PROBLEM_ID}_{test_id}.txt")
    output_path = os.path.join(STDOUT_DIR, f"{PROBLEM_ID}_{test_id}.txt")

    with open(input_path, "w") as f:
        f.write(f"{len(nums)}\n")
        f.write(" ".join(map(str, nums)) + "\n")
        f.write(f"{target}\n")

    with open(output_path, "w") as f:
        f.write(f"{i} {j}\n")

    print(
        f"  [Test {test_id:2d}]  nums={nums[:6]}{'...' if len(nums) > 6 else ''}"
        f"  target={target}  =>  {i} {j}"
    )


def main() -> None:
    os.makedirs(TEST_DIR, exist_ok=True)
    os.makedirs(STDOUT_DIR, exist_ok=True)

    print(f"Generating test cases for problem {PROBLEM_ID} (Two Sum)")
    print(f"  Output dirs: {TEST_DIR}  |  {STDOUT_DIR}\n")

    # ------------------------------------------------------------------
    # Test 1: Canonical example from the problem statement
    # ------------------------------------------------------------------
    write_test(1, [2, 7, 11, 15], 9)

    # ------------------------------------------------------------------
    # Test 2: Answer NOT at indices 0 and 1
    # ------------------------------------------------------------------
    write_test(2, [3, 2, 4], 6)

    # ------------------------------------------------------------------
    # Test 3: Minimum array size, duplicate values
    # ------------------------------------------------------------------
    write_test(3, [3, 3], 6)

    # ------------------------------------------------------------------
    # Test 4: Negative numbers in the array
    # ------------------------------------------------------------------
    write_test(4, [-3, 4, 3, 90], 0)

    # ------------------------------------------------------------------
    # Test 5: Boundary values (10^9 and -10^9)
    # ------------------------------------------------------------------
    write_test(5, [1_000_000_000, -1_000_000_000, 2, 3], 0)

    # ------------------------------------------------------------------
    # Test 6: Answer at the very end of the array
    # ------------------------------------------------------------------
    write_test(6, [1, 2, 3, 4, 5, 6], 11)

    # ------------------------------------------------------------------
    # Test 7: Answer at first and last index
    # ------------------------------------------------------------------
    write_test(7, [1, 4, 3, 2, 5], 6)

    # ------------------------------------------------------------------
    # Test 8: Answer in the middle, mixed values
    # ------------------------------------------------------------------
    write_test(8, [5, 3, 8, 1, 6, 2, 7], 9)

    # ------------------------------------------------------------------
    # Test 9: All negative numbers
    # ------------------------------------------------------------------
    write_test(9, [-2, -5, -4, -1, -3], -7)

    # ------------------------------------------------------------------
    # Test 10: Mixed positive/negative with zero target
    # ------------------------------------------------------------------
    write_test(10, [-6, 10, 3, -4, 6, -8], 0)

    # ------------------------------------------------------------------
    # Test 11: Target is negative, answer spread apart
    # ------------------------------------------------------------------
    write_test(11, [0, -1, 7, -9, 3, -5, 2], -10)

    # ------------------------------------------------------------------
    # Test 12: Large n stress test (n = 200 000)
    # Answer pair placed at indices 0 and n-1 so a greedy O(n^2) TLEs
    # Middle values are distinct odd numbers 3, 5, 7, ... (all positive,
    # so no two middle values can cancel each other, and no middle value
    # cancels with 10^9 or -10^9).
    # ------------------------------------------------------------------
    n = 200_000
    target = 0
    first_val = 1_000_000_000
    last_val = -1_000_000_000
    # n-2 distinct odd positive integers starting from 3
    middle = list(range(3, 3 + 2 * (n - 2), 2))  # [3, 5, 7, ..., 399997]
    nums = [first_val] + middle + [last_val]
    assert len(nums) == n
    write_test(12, nums, target)

    print(f"\nDone — {12} test cases written.")


if __name__ == "__main__":
    main()
