"""
Plagiarism Detection Evaluation — generates real metrics for the research paper.
Run: cd backend && venv/Scripts/python.exe tests/eval_plagiarism.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.ml.plagiarism import check_two_codes, normalize_code

# ── SIMILAR PAIRS (mimicking real plagiarism: variable renaming, reordering, comment changes) ──

SIMILAR_PAIRS = [
    # Pair 1: Bubble sort — renamed vars
    (
        "def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr",
        "def sort_list(data):\n    length = len(data)\n    for x in range(length):\n        for y in range(0, length-x-1):\n            if data[y] > data[y+1]:\n                data[y], data[y+1] = data[y+1], data[y]\n    return data"
    ),
    # Pair 2: Binary search — renamed + comments changed
    (
        "def binary_search(arr, target):\n    low = 0\n    high = len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1",
        "# Search function\ndef find_element(lst, key):\n    left = 0\n    right = len(lst) - 1\n    while left <= right:\n        center = (left + right) // 2\n        if lst[center] == key:\n            return center\n        elif lst[center] < key:\n            left = center + 1\n        else:\n            right = center - 1\n    return -1"
    ),
    # Pair 3: Fibonacci — renamed + minor restructuring
    (
        "def fibonacci(n):\n    if n <= 0:\n        return 0\n    elif n == 1:\n        return 1\n    a, b = 0, 1\n    for i in range(2, n+1):\n        a, b = b, a + b\n    return b",
        "def fib_number(num):\n    if num <= 0:\n        return 0\n    if num == 1:\n        return 1\n    prev = 0\n    curr = 1\n    for idx in range(2, num+1):\n        prev, curr = curr, prev + curr\n    return curr"
    ),
    # Pair 4: Factorial — while vs for
    (
        "def factorial(n):\n    result = 1\n    for i in range(1, n+1):\n        result *= i\n    return result",
        "def calc_factorial(number):\n    res = 1\n    counter = 1\n    while counter <= number:\n        res = res * counter\n        counter += 1\n    return res"
    ),
    # Pair 5: Palindrome check — renamed
    (
        "def is_palindrome(s):\n    s = s.lower().replace(' ', '')\n    return s == s[::-1]",
        "def check_palindrome(text):\n    text = text.lower().replace(' ', '')\n    return text == text[::-1]"
    ),
    # Pair 6: Max element — renamed
    (
        "def find_max(lst):\n    maximum = lst[0]\n    for item in lst:\n        if item > maximum:\n            maximum = item\n    return maximum",
        "def get_largest(arr):\n    biggest = arr[0]\n    for val in arr:\n        if val > biggest:\n            biggest = val\n    return biggest"
    ),
    # Pair 7: Reverse string — renamed
    (
        "def reverse_string(s):\n    result = ''\n    for char in s:\n        result = char + result\n    return result",
        "def flip_text(text):\n    output = ''\n    for c in text:\n        output = c + output\n    return output"
    ),
    # Pair 8: Count vowels — renamed + reordered
    (
        "def count_vowels(s):\n    count = 0\n    vowels = 'aeiouAEIOU'\n    for char in s:\n        if char in vowels:\n            count += 1\n    return count",
        "def vowel_count(text):\n    vowels = 'aeiouAEIOU'\n    total = 0\n    for letter in text:\n        if letter in vowels:\n            total += 1\n    return total"
    ),
    # Pair 9: GCD — renamed
    (
        "def gcd(a, b):\n    while b != 0:\n        a, b = b, a % b\n    return a",
        "def find_gcd(x, y):\n    while y != 0:\n        x, y = y, x % y\n    return x"
    ),
    # Pair 10: Selection sort — renamed + comments
    (
        "def selection_sort(arr):\n    for i in range(len(arr)):\n        min_idx = i\n        for j in range(i+1, len(arr)):\n            if arr[j] < arr[min_idx]:\n                min_idx = j\n        arr[i], arr[min_idx] = arr[min_idx], arr[i]\n    return arr",
        "# Sort by selecting minimum\ndef sort_by_selection(data):\n    for idx in range(len(data)):\n        smallest = idx\n        for k in range(idx+1, len(data)):\n            if data[k] < data[smallest]:\n                smallest = k\n        data[idx], data[smallest] = data[smallest], data[idx]\n    return data"
    ),
]

# ── DIFFERENT PAIRS (genuinely different algorithms) ──

DIFFERENT_PAIRS = [
    # Bubble sort vs Binary search
    (
        "def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr",
        "def binary_search(arr, target):\n    low, high = 0, len(arr) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1"
    ),
    # Fibonacci vs Palindrome
    (
        "def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a",
        "def is_palindrome(s):\n    s = s.lower().replace(' ', '')\n    return s == s[::-1]"
    ),
    # Matrix multiply vs String reverse
    (
        "def matrix_mult(A, B):\n    rows_A, cols_A = len(A), len(A[0])\n    cols_B = len(B[0])\n    result = [[0]*cols_B for _ in range(rows_A)]\n    for i in range(rows_A):\n        for j in range(cols_B):\n            for k in range(cols_A):\n                result[i][j] += A[i][k] * B[k][j]\n    return result",
        "def reverse_string(s):\n    chars = list(s)\n    left, right = 0, len(chars) - 1\n    while left < right:\n        chars[left], chars[right] = chars[right], chars[left]\n        left += 1\n        right -= 1\n    return ''.join(chars)"
    ),
    # Linked list insert vs Quick sort
    (
        "class Node:\n    def __init__(self, val):\n        self.val = val\n        self.next = None\ndef insert_end(head, val):\n    new_node = Node(val)\n    if not head:\n        return new_node\n    curr = head\n    while curr.next:\n        curr = curr.next\n    curr.next = new_node\n    return head",
        "def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr)//2]\n    left = [x for x in arr if x < pivot]\n    mid = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + mid + quicksort(right)"
    ),
    # Stack impl vs Hash table
    (
        "class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        if self.items:\n            return self.items.pop()\n        return None\n    def peek(self):\n        return self.items[-1] if self.items else None",
        "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []"
    ),
    # BFS vs Merge sort
    (
        "from collections import deque\ndef bfs(graph, start):\n    visited = set()\n    queue = deque([start])\n    visited.add(start)\n    result = []\n    while queue:\n        node = queue.popleft()\n        result.append(node)\n        for neighbor in graph.get(node, []):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return result",
        "def merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    left = merge_sort(arr[:mid])\n    right = merge_sort(arr[mid:])\n    return merge(left, right)\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i])\n            i += 1\n        else:\n            result.append(right[j])\n            j += 1\n    result.extend(left[i:])\n    result.extend(right[j:])\n    return result"
    ),
    # Power function vs Anagram check
    (
        "def power(base, exp):\n    if exp == 0:\n        return 1\n    if exp % 2 == 0:\n        half = power(base, exp // 2)\n        return half * half\n    else:\n        return base * power(base, exp - 1)",
        "def is_anagram(s1, s2):\n    return sorted(s1.lower()) == sorted(s2.lower())"
    ),
    # Prime check vs List flatten
    (
        "def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True",
        "def flatten(lst):\n    result = []\n    for item in lst:\n        if isinstance(item, list):\n            result.extend(flatten(item))\n        else:\n            result.append(item)\n    return result"
    ),
    # Caesar cipher vs Count words
    (
        "def caesar_encrypt(text, shift):\n    result = ''\n    for char in text:\n        if char.isalpha():\n            base = ord('A') if char.isupper() else ord('a')\n            result += chr((ord(char) - base + shift) % 26 + base)\n        else:\n            result += char\n    return result",
        "def count_words(text):\n    words = text.split()\n    freq = {}\n    for word in words:\n        word = word.lower().strip('.,!?')\n        freq[word] = freq.get(word, 0) + 1\n    return freq"
    ),
    # Transpose matrix vs Remove duplicates
    (
        "def transpose(matrix):\n    rows = len(matrix)\n    cols = len(matrix[0])\n    result = [[0]*rows for _ in range(cols)]\n    for i in range(rows):\n        for j in range(cols):\n            result[j][i] = matrix[i][j]\n    return result",
        "def remove_duplicates(lst):\n    seen = set()\n    result = []\n    for item in lst:\n        if item not in seen:\n            seen.add(item)\n            result.append(item)\n    return result"
    ),
]

def main():
    print("="*60)
    print("PLAGIARISM DETECTION EVALUATION")
    print("="*60)

    results_similar = []
    results_different = []

    print("\n-- SIMILAR PAIRS (should be flagged) --")
    for i, (a, b) in enumerate(SIMILAR_PAIRS):
        r = check_two_codes(a, b)
        results_similar.append(r)
        print(f"  Pair {i+1}: difflib={r['difflib_similarity']:.1f}%  tfidf={r['tfidf_similarity']:.1f}%  -> {r['verdict']}")

    print("\n-- DIFFERENT PAIRS (should be clean) --")
    for i, (a, b) in enumerate(DIFFERENT_PAIRS):
        r = check_two_codes(a, b)
        results_different.append(r)
        print(f"  Pair {i+1}: difflib={r['difflib_similarity']:.1f}%  tfidf={r['tfidf_similarity']:.1f}%  -> {r['verdict']}")

    # Compute metrics at threshold 0.80
    threshold = 80.0
    tp = sum(1 for r in results_similar if r['tfidf_similarity'] >= threshold)
    fn = sum(1 for r in results_similar if r['tfidf_similarity'] < threshold)
    fp = sum(1 for r in results_different if r['tfidf_similarity'] >= threshold)
    tn = sum(1 for r in results_different if r['tfidf_similarity'] < threshold)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy = (tp + tn) / (tp + tn + fp + fn)

    # Also at SUSPICIOUS threshold (0.60)
    tp_60 = sum(1 for r in results_similar if r['tfidf_similarity'] >= 60.0)
    fp_60 = sum(1 for r in results_different if r['tfidf_similarity'] >= 60.0)
    recall_60 = tp_60 / len(results_similar)

    output = {
        'total_pairs': len(SIMILAR_PAIRS) + len(DIFFERENT_PAIRS),
        'similar_pairs': len(SIMILAR_PAIRS),
        'different_pairs': len(DIFFERENT_PAIRS),
        'threshold': threshold,
        'method': 'TF-IDF char n-gram (3-5) cosine similarity with identifier normalization',
        'metrics_at_80': {
            'true_positives': tp,
            'false_negatives': fn,
            'false_positives': fp,
            'true_negatives': tn,
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1': round(f1, 4),
            'accuracy': round(accuracy, 4),
        },
        'metrics_at_60_suspicious': {
            'flagged_similar': tp_60,
            'flagged_different': fp_60,
            'recall': round(recall_60, 4),
        },
        'similar_pair_scores': [{'pair': i+1, **r} for i, r in enumerate(results_similar)],
        'different_pair_scores': [{'pair': i+1, **r} for i, r in enumerate(results_different)],
    }

    print(f"\n{'='*60}")
    print(f"RESULTS AT THRESHOLD {threshold}%:")
    print(f"  TP={tp}  FN={fn}  FP={fp}  TN={tn}")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print(f"  F1:        {f1:.4f}")
    print(f"  Accuracy:  {accuracy:.4f}")
    print(f"{'='*60}")

    out_path = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', '06-paper', 'evaluation_results', 'plagiarism_eval.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"Saved to {out_path}")

if __name__ == '__main__':
    main()
