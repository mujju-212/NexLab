"""
seed_test_cases.py — seeds public + private test cases for top LeetCode problems
Run: cd backend && python seed_test_cases.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app import create_app
from app.extensions import db
from app.models.practice import Problem, PracticeTestCase

app = create_app()

# Format: slug -> [(input, expected, is_sample), ...]
# is_sample=True = visible to user, False = hidden judge case
TEST_CASES = {
    "two-sum": [
        ("4\n2 7 11 15\n9", "0 1", True),
        ("3\n3 2 4\n6", "1 2", True),
        ("2\n3 3\n6", "0 1", False),
        ("5\n1 2 3 4 5\n9", "3 4", False),
        ("6\n0 4 3 0 5 1\n0", "0 3", False),
    ],
    "reverse-string": [
        ("5\nh e l l o", "o l l e h", True),
        ("7\nH a n n a h", "h a n n a H", True),
        ("1\na", "a", False),
        ("3\na b c", "c b a", False),
    ],
    "fibonacci-number": [
        ("2", "1", True),
        ("3", "2", True),
        ("4", "3", False),
        ("10", "55", False),
        ("0", "0", False),
        ("1", "1", False),
    ],
    "palindrome-number": [
        ("121", "true", True),
        ("-121", "false", True),
        ("10", "false", False),
        ("0", "true", False),
        ("1001", "true", False),
        ("12321", "true", False),
    ],
    "reverse-integer": [
        ("123", "321", True),
        ("-123", "-321", True),
        ("120", "21", True),
        ("0", "0", False),
        ("1534236469", "0", False),
    ],
    "valid-parentheses": [
        ("()", "true", True),
        ("()[]{}", "true", True),
        ("(]", "false", True),
        ("([)]", "false", False),
        ("{[]}", "true", False),
        ("", "true", False),
    ],
    "merge-two-sorted-lists": [
        ("3 3\n1 2 4\n1 3 4", "1 1 2 3 3 4", True),
        ("0 0\n\n", "", True),
        ("1 1\n0\n0", "0 0", False),
        ("2 2\n1 3\n2 4", "1 2 3 4", False),
    ],
    "best-time-to-buy-and-sell-stock": [
        ("6\n7 1 5 3 6 4", "5", True),
        ("5\n7 6 4 3 1", "0", True),
        ("1\n1", "0", False),
        ("4\n3 1 4 2", "3", False),
        ("6\n2 4 1 7 5 3", "6", False),
    ],
    "valid-anagram": [
        ("anagram\nnagaram", "true", True),
        ("rat\ncar", "false", True),
        ("a\na", "true", False),
        ("ab\nba", "true", False),
        ("aacc\nccac", "false", False),
    ],
    "binary-search": [
        ("6 9\n-1 0 3 5 9 12", "4", True),
        ("6 2\n-1 0 3 5 9 12", "-1", True),
        ("1 5\n5", "0", False),
        ("4 0\n0 1 2 3", "0", False),
        ("3 3\n1 2 3", "2", False),
    ],
    "climbing-stairs": [
        ("2", "2", True),
        ("3", "3", True),
        ("4", "5", False),
        ("5", "8", False),
        ("10", "89", False),
    ],
    "maximum-subarray": [
        ("9\n-2 1 -3 4 -1 2 1 -5 4", "6", True),
        ("1\n1", "1", True),
        ("5\n5 4 -1 7 8", "23", True),
        ("4\n-2 -1 -3 -4", "-1", False),
        ("6\n1 2 3 4 5 6", "21", False),
    ],
    "single-number": [
        ("5\n2 2 1", "1", True),
        ("7\n4 1 2 1 2", "4", True),
        ("1\n1", "1", False),
        ("5\n0 1 0 1 99", "99", False),
    ],
    "missing-number": [
        ("4\n3 0 1", "2", True),
        ("1\n0", "1", True),
        ("10\n9 6 4 2 3 5 7 0 1", "8", True),
        ("3\n0 1 3", "2", False),
        ("5\n1 2 3 4", "0", False),
    ],
    "contains-duplicate": [
        ("4\n1 2 3 1", "true", True),
        ("4\n1 2 3 4", "false", True),
        ("5\n1 1 1 3 3", "true", False),
        ("1\n1", "false", False),
    ],
    "count-primes": [
        ("10", "4", True),
        ("0", "0", True),
        ("1", "0", False),
        ("20", "8", False),
        ("100", "25", False),
    ],
    "power-of-two": [
        ("1", "true", True),
        ("16", "true", True),
        ("3", "false", True),
        ("0", "false", False),
        ("4", "true", False),
        ("5", "false", False),
    ],
    "factorial-trailing-zeroes": [
        ("3", "0", True),
        ("5", "1", True),
        ("0", "0", False),
        ("25", "6", False),
        ("30", "7", False),
    ],
    "find-the-index-of-the-first-occurrence-in-a-string": [
        ("sadbutsad\nsad", "0", True),
        ("leetcode\nleeto", "-1", True),
        ("hello\nll", "2", False),
        ("aaa\na", "0", False),
    ],
    "length-of-last-word": [
        ("Hello World", "5", True),
        ("   fly me   to   the moon  ", "4", True),
        ("luffy is still joyboy", "6", False),
        ("a", "1", False),
    ],
    "roman-to-integer": [
        ("III", "3", True),
        ("LVIII", "58", True),
        ("MCMXCIV", "1994", True),
        ("IV", "4", False),
        ("IX", "9", False),
        ("XL", "40", False),
    ],
    "add-binary": [
        ("11\n1", "100", True),
        ("1010\n1011", "10101", True),
        ("0\n0", "0", False),
        ("111\n111", "1110", False),
    ],
    "sqrt-x": [
        ("4", "2", True),
        ("8", "2", True),
        ("0", "0", False),
        ("1", "1", False),
        ("9", "3", False),
        ("16", "4", False),
    ],
    "plus-one": [
        ("3\n1 2 3", "1 2 4", True),
        ("3\n4 3 2 1", "4 3 2 2", True),
        ("1\n9", "1 0", True),
        ("2\n9 9", "1 0 0", False),
    ],
    "minimum-depth-of-binary-tree": [
        ("3 9 20 null null 15 7", "2", True),
        ("5 null 3 null null 2 null null null 1", "3", True),
    ],
    "excel-sheet-column-number": [
        ("A", "1", True),
        ("AB", "28", True),
        ("ZY", "701", True),
        ("Z", "26", False),
        ("AA", "27", False),
    ],
    "majority-element": [
        ("3\n3 2 3", "3", True),
        ("7\n2 2 1 1 1 2 2", "2", True),
        ("5\n1 1 1 2 3", "1", False),
        ("1\n1", "1", False),
    ],
    "reverse-linked-list": [
        ("5\n1 2 3 4 5", "5 4 3 2 1", True),
        ("2\n1 2", "2 1", True),
        ("1\n1", "1", False),
        ("0\n", "", False),
    ],
    "implement-stack-using-queues": [
        ("push 1\npush 2\ntop\npop\nempty", "2\n2\nfalse", True),
    ],
    "invert-binary-tree": [
        ("4 2 7 1 3 6 9", "4 7 2 9 6 3 1", True),
        ("2 1 3", "2 3 1", True),
        ("", "", False),
    ],
    "valid-palindrome": [
        ("A man, a plan, a canal: Panama", "true", True),
        ("race a car", "false", True),
        (" ", "true", False),
        ("Was it a car or a cat I saw?", "true", False),
    ],
    "longest-common-prefix": [
        ("3\nflower flow flight", "fl", True),
        ("3\ndog racecar car", "", True),
        ("1\nflower", "flower", False),
        ("2\nab a", "a", False),
    ],
    "move-zeroes": [
        ("5\n0 1 0 3 12", "1 3 12 0 0", True),
        ("2\n0 0", "0 0", True),
        ("1\n0", "0", False),
        ("5\n1 2 3 4 5", "1 2 3 4 5", False),
    ],
    "first-bad-version": [
        ("5 4", "4", True),
        ("1 1", "1", True),
        ("10 3", "3", False),
    ],
    "summary-ranges": [
        ("6\n0 1 2 4 5 7", "0->2 4->5 7", True),
        ("5\n0 2 3 4 6", "0 2->4 6", True),
        ("0\n", "", False),
    ],
    "count-complete-tree-nodes": [
        ("6\n1 2 3 4 5 6", "6", True),
        ("0\n", "0", True),
        ("1\n1", "1", False),
    ],
    "reverse-bits": [
        ("43261596", "964176192", True),
        ("4294967293", "3221225471", True),
    ],
    "number-of-1-bits": [
        ("11", "3", True),
        ("128", "1", True),
        ("4294967293", "31", False),
        ("0", "0", False),
    ],
    "house-robber": [
        ("4\n1 2 3 1", "4", True),
        ("4\n2 7 9 3 1", "12", True),
        ("1\n5", "5", False),
        ("2\n2 1", "2", False),
        ("6\n2 1 1 2 1 1", "4", False),
    ],
    "isomorphic-strings": [
        ("egg\nadd", "true", True),
        ("foo\nbar", "false", True),
        ("paper\ntitle", "true", True),
        ("ab\naa", "false", False),
    ],
    "contains-duplicate-ii": [
        ("4 1\n1 2 3 1", "true", True),
        ("4 2\n1 2 3 1 2 3", "false", True),
        ("5 3\n1 0 1 1", "true", False),
    ],
    "product-of-array-except-self": [
        ("4\n1 2 3 4", "24 12 8 6", True),
        ("4\n-1 1 0 -3 3", "0 0 9 0 0", True),
        ("2\n1 1", "1 1", False),
    ],
    "maximum-product-subarray": [
        ("6\n2 3 -2 4", "6", True),
        ("4\n-2 0 -1", "0", True),
        ("1\n0", "0", False),
        ("5\n-2 3 -4", "24", False),
    ],
    "find-minimum-in-rotated-sorted-array": [
        ("5\n3 4 5 1 2", "1", True),
        ("7\n4 5 6 7 0 1 2", "0", True),
        ("3\n11 13 15", "11", False),
        ("1\n1", "1", False),
    ],
    "search-in-rotated-sorted-array": [
        ("7 0\n4 5 6 7 0 1 2", "4", True),
        ("7 3\n4 5 6 7 0 1 2", "-1", True),
        ("1 0\n1", "-1", False),
        ("6 6\n6 7 0 1 2 3 4 5", "0", False),
    ],
    "3sum": [
        ("6\n-1 0 1 2 -1 -4", "-1 -1 2\n-1 0 1", True),
        ("3\n0 1 1", "", True),
        ("3\n0 0 0", "0 0 0", False),
    ],
    "container-with-most-water": [
        ("9\n1 8 6 2 5 4 8 3 7", "49", True),
        ("2\n1 1", "1", True),
        ("4\n4 3 2 1 4", "16", False),
    ],
    "longest-substring-without-repeating-characters": [
        ("abcabcbb", "3", True),
        ("bbbbb", "1", True),
        ("pwwkew", "3", True),
        ("", "0", False),
        ("au", "2", False),
        ("dvdf", "3", False),
    ],
    "string-to-integer-atoi": [
        ("42", "42", True),
        ("   -42", "-42", True),
        ("4193 with words", "4193", True),
        ("words and 987", "0", False),
        ("-91283472332", "-2147483648", False),
    ],
    "merge-sorted-array": [
        ("3 3\n1 2 3\n2 5 6", "1 2 2 3 5 6", True),
        ("1 0\n1\n", "1", True),
        ("0 1\n\n1", "1", False),
        ("4 4\n1 3 5 7\n2 4 6 8", "1 2 3 4 5 6 7 8", False),
    ],
    "Pascal's-triangle": [
        ("5", "1\n1 1\n1 2 1\n1 3 3 1\n1 4 6 4 1", True),
        ("1", "1", True),
        ("3", "1\n1 1\n1 2 1", False),
    ],
    "linked-list-cycle": [
        ("4 1\n3 2 0 -4", "true", True),
        ("2 0\n1 2", "true", True),
        ("1 -1\n1", "false", False),
    ],
    "intersection-of-two-linked-lists": [
        ("2 3 3\n4 1\n5 6 1\n8 4 5", "8", True),
        ("3 2 1\n1 9 1\n3\n2 4", "2", True),
        ("2 3 0\n2 6\n1 5\n", "null", False),
    ],
    "excel-sheet-column-title": [
        ("1", "A", True),
        ("28", "AB", True),
        ("701", "ZY", True),
        ("26", "Z", False),
        ("27", "AA", False),
    ],
    "find-peak-element": [
        ("3\n1 2 3", "2", True),
        ("4\n1 2 1 3 5 6 4", "5", True),
    ],
    "minimum-size-subarray-sum": [
        ("7 4\n2 3 1 2 4 3", "2", True),
        ("4 4\n1 4 4", "1", True),
        ("11 3\n1 1 1 1 1 1 1 1", "0", False),
    ],
    "implement-trie-prefix-tree": [
        ("insert apple\nsearch apple\nsearch app\nstartsWith app\ninsert app\nsearch app\nstartsWith pre",
         "true\nfalse\ntrue\ntrue\nfalse", True),
    ],
    "kth-largest-element-in-an-array": [
        ("6 2\n3 2 1 5 6 4", "5", True),
        ("5 4\n3 2 3 1 2 4 5 5 6", "4", True),
        ("1 1\n1", "1", False),
    ],
    "course-schedule": [
        ("2 1\n1 0", "true", True),
        ("2 2\n1 0\n0 1", "false", True),
        ("3 0\n", "true", False),
    ],
    "number-of-islands": [
        ("4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "1", True),
        ("4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", "3", True),
        ("1 1\n0", "0", False),
    ],
    "coin-change": [
        ("3 11\n1 5 6", "2", True),
        ("2 3\n2", "-1", True),
        ("1 0\n1", "0", False),
        ("3 6\n1 3 4", "2", False),
    ],
    "longest-increasing-subsequence": [
        ("10\n10 9 2 5 3 7 101 18", "4", True),
        ("7\n0 1 0 3 2 3", "4", True),
        ("6\n7 7 7 7 7", "1", False),
        ("4\n4 10 4 3 8 9", "3", False),
    ],
    "unique-paths": [
        ("3 7", "28", True),
        ("3 2", "3", True),
        ("1 1", "1", False),
        ("7 3", "28", False),
    ],
    "jump-game": [
        ("5\n2 3 1 1 4", "true", True),
        ("5\n3 2 1 0 4", "false", True),
        ("1\n0", "true", False),
        ("4\n2 0 0 0", "false", False),
    ],
    "clone-graph": [
        ("4\n1 4\n1 3\n2 4\n1 3", "[[2,4],[1,3],[2,4],[1,3]]", True),
        ("0\n", "[]", True),
    ],
    "word-search": [
        ("4 4\nABCE\nSFCS\nADEE\nSEE", "true", True),
        ("4 4\nABCE\nSFCS\nADEE\nABCB", "false", True),
    ],
    "decode-ways": [
        ("12", "2", True),
        ("226", "3", True),
        ("06", "0", True),
        ("0", "0", False),
        ("11106", "2", False),
    ],
    "surrounded-regions": [
        ("4 4\nXXXX\nXOOX\nXXOX\nXOXX", "XXXX\nXXXX\nXXXX\nXOXX", True),
        ("1 1\nX", "X", False),
    ],
    "sum-of-two-integers": [
        ("1 2", "3", True),
        ("2 3", "5", True),
        ("0 0", "0", False),
        ("-1 1", "0", False),
        ("-2 -3", "-5", False),
    ],
    "valid-perfect-square": [
        ("16", "true", True),
        ("14", "false", True),
        ("1", "true", False),
        ("4", "true", False),
        ("25", "true", False),
    ],
    "guess-number-higher-or-lower": [
        ("10 6", "6", True),
        ("1 1", "1", True),
        ("2 1", "1", False),
    ],
    "range-sum-query-immutable": [
        ("5\n-2 0 3 -5 2 -1\n0 2\n2 5\n0 5", "1\n-1\n-3", True),
    ],
    "counting-bits": [
        ("2", "0 1 1", True),
        ("5", "0 1 1 2 1 2", True),
        ("0", "0", False),
        ("8", "0 1 1 2 1 2 2 3 1", False),
    ],
    "top-k-frequent-elements": [
        ("6 2\n1 1 1 2 2 3", "1 2", True),
        ("1 1\n1", "1", True),
        ("6 2\n4 1 -1 2 -1 2 3", "-1 2", False),
    ],
    "word-pattern": [
        ("abba\ndog cat cat dog", "true", True),
        ("abba\ndog cat cat fish", "false", True),
        ("aaaa\ndog cat cat dog", "false", False),
        ("abba\ndog dog dog dog", "false", False),
    ],
    "find-all-anagrams-in-a-string": [
        ("cbaebabacd\nabc", "0 6", True),
        ("abab\nab", "0 1 2", True),
        ("baa\naa", "1", False),
    ],
    "repeated-dna-sequences": [
        ("AAAAACCCCCAAAAACCCCCCAAAAAGGGTTT", "AAAAACCCCC CCCCCAAAAA", True),
        ("AAAAAAAAAAAAA", "AAAAAAAAAA", True),
    ],
    "4sum": [
        ("6 0\n1 0 -1 0 -2 2", "-2 -1 1 2\n-2 0 0 2\n-1 0 0 1", True),
        ("4 0\n2 2 2 2 2", "2 2 2 2", True),
    ],
    "rotate-array": [
        ("7 3\n1 2 3 4 5 6 7", "5 6 7 1 2 3 4", True),
        ("3 2\n-1 -100 3 99", "3 99 -1 -100", True),
        ("1 0\n1", "1", False),
    ],
    "longest-palindromic-substring": [
        ("babad", "bab", True),
        ("cbbd", "bb", True),
        ("a", "a", False),
        ("racecar", "racecar", False),
    ],
    "trapping-rain-water": [
        ("12\n0 1 0 2 1 0 1 3 2 1 2 1", "6", True),
        ("6\n4 2 0 3 2 5", "9", True),
        ("2\n4 2", "0", False),
    ],
    "wildcard-matching": [
        ("aa\na", "false", True),
        ("aa\n*", "true", True),
        ("cb\n?a", "false", True),
        ("adceb\n*a*b", "true", False),
    ],
    "permutations": [
        ("3\n1 2 3", "1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1", True),
        ("1\n0", "0", True),
        ("2\n0 1", "0 1\n1 0", False),
    ],
    "group-anagrams": [
        ("6\neat tea tan ate nat bat", "bat\neat tea ate\ntan nat", True),
        ("1\n", "", True),
        ("1\na", "a", False),
    ],
    "pow-x-n": [
        ("2.00000 10", "1024.00000", True),
        ("2.10000 3", "9.26100", True),
        ("2.00000 -2", "0.25000", True),
        ("1.00000 2147483647", "1.00000", False),
    ],
    "n-queens": [
        ("4", ".Q..\n...Q\nQ...\n..Q.\n..Q.\nQ...\n...Q\n.Q..", True),
        ("1", "Q", True),
    ],
    "text-justification": [
        ("4 16\nWhat must be shall be", "What   must   be\nshall be       \n", True),
    ],
}


def seed():
    with app.app_context():
        total_added = 0
        total_problems = 0
        for slug, cases in TEST_CASES.items():
            problem = Problem.query.filter_by(slug=slug).first()
            if not problem:
                print(f"  SKIP (not found): {slug}")
                continue
            # Remove existing test cases
            PracticeTestCase.query.filter_by(problem_id=problem.id).delete()
            total_problems += 1
            for idx, (inp, exp, is_sample) in enumerate(cases):
                tc = PracticeTestCase(
                    problem_id=problem.id,
                    input_data=inp,
                    expected=exp,
                    is_sample=is_sample,
                    order_index=idx,
                )
                db.session.add(tc)
                total_added += 1
        db.session.commit()
        print(f"\n✅ Done — seeded {total_added} test cases across {total_problems} problems.")


if __name__ == '__main__':
    seed()
